import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const read = file => JSON.parse(readFileSync(file, 'utf8'));
const priced = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
const sum = values => values.reduce((a, b) => a + b, 0);

export function assessRun(run, capture, review, caseId, referenceKeys) {
  const account = run.accounts.find(row => row.caseId === caseId);
  assert.ok(account, 'Case missing from run');
  const completed = run.results.some(row => row.caseId === caseId && row.status === 200 && !row.error);
  const owner = account.userId;
  const own = (rows, field = 'user_id') => rows.filter(row => row[field] === owner);
  const models = own(capture.modelCosts ?? []).filter(row => row.cost_kind !== 'attribution');
  const providers = own(capture.logs).filter(row => ['web_search_exa', 'career_provider_usage'].includes(row.type));
  const operations = own(capture.operations);
  const modelAmounts = models.map(row => ['estimated','priced','provider_reported'].includes(row.cost_status) && priced(row.estimated_cost_usd) ? Number(row.estimated_cost_usd) : null);
  const providerAmounts = providers.map(row => priced(row.meta_data?.costUsd) ? Number(row.meta_data.costUsd) : null);
  const amounts = [...modelAmounts, ...providerAmounts];
  const children = operations.filter(row => row.kind === 'resource_item');
  const observed = new Set();
  for (const row of operations) {
    const refs = row.request?.sourceRefs ?? [];
    const candidates = row.kind === 'resource_search' ? refs : row.kind === 'resource_item' ? refs.slice(0, 1) : [];
    for (const ref of candidates) {
      if (['company', 'role', 'posting', 'web_resource', 'observation'].includes(ref.kind)) observed.add(`${ref.kind}:${ref.id}`);
    }
  }
  const unpricedAttempts = sum(children.map(row => Number(row.result?.unknownCostAttempts ?? 0)));
  const failedOperations = children.filter(row => row.status !== 'completed').length;
  const knownUsd = sum(amounts.filter(price => price != null));
  const incomplete = !completed || !models.length || amounts.some(price => price == null) || unpricedAttempts > 0 || failedOperations > 0;
  const messages = own(capture.messages);
  const opportunities = own(capture.opportunities, 'talent_id');
  const recommendations = own(capture.recommendations, 'talent_id');
  const visible = new Map([
    ...messages.filter(row => row.role === 'assistant').map(row => [`message:${row.id}`, row]),
    ...opportunities.filter(row => !row.deleted_at && !row.merged_into_id).map(row => [`opportunity:${row.id}`, row]),
    ...recommendations.map(row => [`recommendation:${row.id}`, row]),
  ]);
  const reviewedKeys = new Set();
  for (const verdict of review.useful) {
    assert.ok(verdict.key && verdict.reason?.trim() && visible.has(verdict.evidence), 'Useful result needs an owned result and a reviewer reason');
    assert.ok(!reviewedKeys.has(verdict.key), 'Duplicate useful result');
    reviewedKeys.add(verdict.key);
  }
  // A click or stage change alone cannot tell a reviewer whether Harper helped.
  const decisions = (review.decisions ?? []).map(entry => {
    const row = messages.find(row => entry.evidence === `message:${row.id}` && row.role === 'user');
    assert.ok(row?.content && entry.quote?.trim() && row.content.includes(entry.quote), 'User decision needs their words in an owned record');
    return entry;
  });
  const evidence = new Map(operations.map(row => [`operation:${row.id}`, row]));
  const missed = referenceKeys.filter(key => !reviewedKeys.has(key)).map(key => {
    const assessment = review.misses[key];
    assert.ok(assessment?.reason?.trim() && ['not_found','scored','found','insufficient_trace'].includes(assessment.stage), `Classify missed reference ${key}`);
    if (['found','scored'].includes(assessment.stage)) {
      const row = evidence.get(assessment.evidence);
      assert.ok(row, 'Discovery evidence needs an owned operation');
      if (assessment.stage === 'scored') assert.ok(row.kind === 'resource_item' && row.result?.evaluations?.length, 'Expected completed scoring evidence');
    }
    return { key, ...assessment };
  });
  return {
    completed, knownUsd, totalEstimatedUsd: incomplete ? null : knownUsd,
    unpricedReceipts: amounts.filter(value => value == null).length, unpricedAttempts, failedOperations,
    modelReceipts: models.length, providerReceipts: providers.length,
    distinctSourceRefsInspected: observed.size,
    scored: children.filter(row => row.result?.evaluations?.length).length,
    reusedItems: sum(operations.filter(row => ['resource_research','resource_evaluation'].includes(row.kind)).map(row => Number(row.result?.cacheHits ?? 0))),
    useful: [...reviewedKeys], decisions, missed,
    estimatedUsdPerUseful: !incomplete && reviewedKeys.size ? knownUsd / reviewedKeys.size : null,
  };
}

export function compare(left, right, review) {
  assert.deepEqual(left.run.fixtureHashes, right.run.fixtureHashes, 'The case and gold fixtures differ');
  assert.ok(Object.keys(left.run.fixtureHashes ?? {}).length && review.caseId && priced(review.budgetUsd));
  assert.ok(Array.isArray(review.referenceKeys) && review.referenceKeys.length && new Set(review.referenceKeys).size === review.referenceKeys.length);
  assert.notEqual(left.run.accounts.find(row => row.caseId === review.caseId)?.userId, right.run.accounts.find(row => row.caseId === review.caseId)?.userId, 'Use separate evaluation accounts');
  const sides = [left, right].map(({run, capture}, i) => assessRun(run, capture, review[i ? 'after' : 'before'], review.caseId, review.referenceKeys));
  const withinBudget = sides.every(side => side.totalEstimatedUsd !== null && side.totalEstimatedUsd <= review.budgetUsd);
  const [before, after] = sides;
  // The discovery runner uses live search. Only a reviewer with dated source evidence
  // can establish that both runs had the same market available to them.
  const sharedMarket = Boolean(review.sameMarketEvidence?.trim());
  return { caseId: review.caseId, budgetUsd: review.budgetUsd, sameMarketEvidence: review.sameMarketEvidence ?? null,
    withinBudget: sides.every(side => side.totalEstimatedUsd !== null) ? withinBudget : null,
    comparableAtBudget: sharedMarket && withinBudget, before, after,
    observedSpendDifferenceUsd: before.totalEstimatedUsd !== null && after.totalEstimatedUsd !== null ? before.totalEstimatedUsd - after.totalEstimatedUsd : null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [before, after, review] = process.argv.slice(2);
  assert.ok(before && after && review, 'Usage: node compareOpportunityDiscovery.mjs BEFORE_DIR AFTER_DIR REVIEW_JSON');
  const run = dir => ({run: read(join(dir, 'run.json')), capture: read(join(dir, 'durable.json'))});
  console.log(JSON.stringify(compare(run(before), run(after), read(review)), null, 2));
}
