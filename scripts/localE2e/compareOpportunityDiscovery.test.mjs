import test from 'node:test';
import assert from 'node:assert/strict';
import { compare } from './compareOpportunityDiscovery.mjs';

function runFor(owner, modelCost) {
  return {
    run: { fixtureHashes: { cases: 'same', gold: 'same' }, accounts: [{ caseId: 'first', userId: owner }], results: [{ caseId: 'first', status: 200 }] },
    capture: {
      modelCosts: [{ user_id: owner, cost_status: 'priced', estimated_cost_usd: modelCost }, { user_id: owner, cost_kind: 'attribution', cost_status: 'priced', estimated_cost_usd: modelCost }],
      logs: [{ user_id: owner, type: 'web_search_exa', meta_data: { costUsd: 0.25 } }],
      messages: [{ user_id: owner, id: 1, role: 'user', content: 'I decided to take the interview.' }],
      opportunities: [{ talent_id: owner, id: 'one' }], recommendations: [],
      operations: [{ user_id: owner, id: 'score', kind: 'resource_item', status: 'completed', request: { sourceRefs: [{ kind: 'role', id: 'two' }] }, result: { evaluations: [{ value: 1 }] } }],
    },
  };
}
const side = {
  useful: [{ key: 'one', evidence: 'opportunity:one', reason: 'Meets location and role preferences.' }],
  misses: { two: { stage: 'scored', evidence: 'operation:score', reason: 'The scoring input used the wrong location.' } },
  decisions: [{ evidence: 'message:1', quote: 'I decided to take the interview.' }],
};
const review = { caseId: 'first', budgetUsd: 2, referenceKeys: ['one', 'two'], sameMarketEvidence: 'Dated inventory sha256 matched in both runs', before: side, after: side };

test('prices unique owned receipts, counts scored opportunities and attaches the user’s own decision', () => {
  const result = compare(runFor('A', 1), runFor('B', 0.5), review);
  assert.equal(result.before.estimatedUsdPerUseful, 1.25);
  assert.equal(result.observedSpendDifferenceUsd, 0.5);
  assert.equal(result.before.distinctSourceRefsInspected, 1);
  assert.equal(result.after.missed[0].stage, 'scored');
  assert.equal(result.comparableAtBudget, true);
});

test('unknown costs, old captures and unverified markets cannot support a same-budget result', () => {
  const before = runFor('A', 1), after = runFor('B', 0.5);
  after.capture.operations[0].result.unknownCostAttempts = 1;
  assert.equal(compare(before, after, review).after.totalEstimatedUsd, null);
  delete before.capture.modelCosts;
  assert.equal(compare(before, after, review).withinBudget, null);
  assert.equal(compare(runFor('A', 1), runFor('B', 0.5), {...review, sameMarketEvidence: null}).comparableAtBudget, false);
  assert.equal(compare(runFor('A', 3), runFor('B', 0.5), review).comparableAtBudget, false);
});

test('no cost per useful result when none were useful, and no credit for an invented user quote', () => {
  const before = runFor('A', 1), after = runFor('B', 0.5);
  const empty = { useful: [], misses: { ...side.misses, one: { stage: 'insufficient_trace', reason: 'No result' } } };
  assert.equal(compare(before, after, {...review, after: empty}).after.estimatedUsdPerUseful, null);
  assert.throws(() => compare(before, after, {...review, after: { ...side, decisions: [{ evidence: 'message:1', quote: 'I joined.' }] }}), /User decision/);
});
