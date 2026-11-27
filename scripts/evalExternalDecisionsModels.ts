/** Decisions model comparison on the frozen external-decisions-summary-ranking dataset.
 * The same production scoring input, rubric, parser and rank formula; only the Decisions model changes.
 * Commands: prepare | probe | run <arm> [concurrency] | status | report. Raw artifacts stay in the ignored run folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildDecisionRequest, parseDecisionBatch } from '../src/lib/externalRecommendationsV2/decisions';
import { buildScoringInputParts, v2PromptCandidate } from '../src/lib/externalRecommendationsV2/scoringInput';
import { rankScore } from '../src/lib/externalRecommendationsV2/contract';

const TASK = path.resolve('docs/evaluation/external-decisions-summary-ranking');
const FROZEN = path.join(TASK, 'private/frozen-v1');
const RUN = path.join(TASK, 'runs/20261126-decisions-model-comparison-v1');
const OPENROUTER = 'https://openrouter.ai/api/alpha/decisions';
// Request shape follows the existing transport: OpenAI's own Decisions API, or OpenRouter's (the jev shape).
const ARMS = {
  luna: { provider: 'openai' as const, model: 'gpt-6-luna', endpoint: 'https://api.openai.com/v1/decisions', usdPerMtok: 0.10 },
  liquid_d12: { provider: 'jev' as const, model: 'liquid/d1.2', endpoint: OPENROUTER, usdPerMtok: 0.02 },
  pplx_v13: { provider: 'jev' as const, model: 'perplexity/pplx-decider-v1.3:free', endpoint: OPENROUTER, usdPerMtok: 0 },
};
type Arm = keyof typeof ARMS;
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const lines = (p: string): any[] => fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(v => JSON.parse(v));
const save = (p: string, v: unknown) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { mode: 0o600, flag: 'wx' });

function requestFor(arm: Arm, job: any) {
  const a = ARMS[arm];
  const request = buildDecisionRequest(a.provider, job.parts, job.roleIds) as any;
  return a.provider === 'jev' ? { ...request, model: a.model } : request;
}

function sourceState() {
  const files = ['scripts/evalExternalDecisionsModels.ts', 'src/lib/externalRecommendationsV2/decisions.ts',
    'src/lib/externalRecommendationsV2/scoringInput.ts', 'src/lib/externalRecommendationsV2/workerInputText.ts',
    'src/lib/externalRecommendationsV2/descriptionText.ts', 'src/lib/externalRecommendationsV2/fitQuestions.v4.json',
    'src/lib/externalRecommendationsV2/contract.ts', 'src/lib/talentOnboarding/jobPostingRecommendations.ts'];
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    files: Object.fromEntries(files.map(f => [f, sha(fs.readFileSync(f))])) };
}

function prepare() {
  if (fs.existsSync(RUN)) throw Error('Run already exists; do not overwrite it');
  const frozen = read(path.join(FROZEN, 'manifest.json'));
  for (const [name, hash] of Object.entries(frozen.files)) if (sha(fs.readFileSync(path.join(FROZEN, name))) !== hash) throw Error('Frozen input changed');
  const jobs: any[] = [];
  for (const c of lines(path.join(FROZEN, 'cases.jsonl'))) {
    for (let offset = 0; offset < c.roles.length; offset += 10) {
      const roles = c.roles.slice(offset, offset + 10);
      // The production candidate builder: nonempty stored summary in the locale, else the full JD.
      const candidates = roles.map((r: any) => v2PromptCandidate({ ...r.card, row: { description: r.card.roleDescription } } as any, c.locale));
      jobs.push({ id: `${c.run_id}-b${offset / 10}`, run_id: c.run_id, talent_id: c.talent_id,
        roleIds: roles.map((r: any) => r.card.roleId),
        recommendationIds: roles.map((r: any) => r.recommendation_id),
        parts: buildScoringInputParts({ ...c.user_context, evaluation_date: c.as_of }, candidates) });
    }
  }
  fs.mkdirSync(path.join(RUN, 'receipts'), { recursive: true, mode: 0o700 });
  const text = jobs.map(j => JSON.stringify(j)).join('\n') + '\n';
  fs.writeFileSync(path.join(RUN, 'jobs.jsonl'), text, { flag: 'wx', mode: 0o600 });
  save(path.join(RUN, 'manifest.json'), { task: 'external-decisions-summary-ranking', runId: path.basename(RUN),
    createdAt: new Date().toISOString(), frozen, source: sourceState(), jobsSha256: sha(text), batches: jobs.length, arms: ARMS,
    scoring: 'Current buildScoringInputParts + buildDecisionRequest + parseDecisionBatch + rankScore (fitQuestions.v4); OpenRouter arms use the existing jev request shape with only the model changed',
    transport: 'timeout 30s, at most 2 attempts on 408/429/5xx or network error; OpenRouter provider {allow_fallbacks:false, data_collection:"deny"} as in the existing jev path',
    primaryMetric: 'Like-over-dislike pair accuracy; ties/missing = 0.5; failures reported separately',
    privacy: 'User asked on 2026-11-26 to compare these models on the existing harper_eval dataset. No DB access or writes. Raw files ignored and owner-only.' });
  console.log(JSON.stringify({ run: RUN, batches: jobs.length }));
}

async function call(arm: Arm, job: any) {
  const a = ARMS[arm];
  const key = a.provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY;
  if (!key) throw Error('Missing credential for ' + arm);
  const request = requestFor(arm, job);
  const attempts: any[] = [];
  let raw: any = null;
  const started = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ts = Date.now();
    try {
      const res = await fetch(a.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(30_000) });
      const body = await res.text();
      let response: any; try { response = JSON.parse(body); } catch { response = { nonJson: body.slice(0, 2000) }; }
      attempts.push({ attempt, httpStatus: res.status, elapsedMs: Date.now() - ts, response });
      if (res.ok) { raw = response; break; }
      if (attempt === 1 && (res.status === 408 || res.status === 429 || res.status >= 500)) {
        const s = Number(res.headers.get('retry-after') || 1);
        await new Promise(r => setTimeout(r, Math.max(1000, Math.min(60_000, (Number.isFinite(s) ? s : 1) * 1000))));
        continue;
      }
      break;
    } catch (e) {
      attempts.push({ attempt, elapsedMs: Date.now() - ts, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    }
  }
  const parsed = raw ? parseDecisionBatch(a.provider, raw, job.roleIds) : { evaluations: [], errors: job.roleIds, invalid: [] };
  return { id: job.id, arm, model: a.model, resolvedModel: raw?.model ?? null, run_id: job.run_id, talent_id: job.talent_id,
    elapsedMs: Date.now() - started, okElapsedMs: raw ? attempts[attempts.length - 1].elapsedMs : null, attempts, usage: raw?.usage ?? null,
    failed: !raw, errors: parsed.errors,
    scores: Object.fromEntries(parsed.evaluations.map((e: any, i: number) => [job.recommendationIds[job.roleIds.indexOf(e.roleId)], { fit: e.fit, score: rankScore(e.fit) }])) };
}

async function probe() {
  const job = lines(path.join(RUN, 'jobs.jsonl'))[0];
  for (const arm of Object.keys(ARMS) as Arm[]) {
    const r = await call(arm, job);
    const last = r.attempts[r.attempts.length - 1];
    const answers = r.failed ? null : last.response?.answers;
    console.log(JSON.stringify({ arm, failed: r.failed, status: last.httpStatus ?? last.error, elapsedMs: r.elapsedMs, usage: r.usage,
      resolvedModel: r.resolvedModel, parsedRoles: Object.keys(r.scores).length, of: job.roleIds.length, errors: r.errors.length,
      answerShape: answers ? JSON.stringify(Array.isArray(answers) ? answers[0] : Object.entries(answers)[0]).slice(0, 300) : JSON.stringify(last.response ?? last.error).slice(0, 500) }));
  }
}

async function run(arm: Arm, concurrency: number) {
  if (!ARMS[arm]) throw Error('Unknown arm');
  const manifest = read(path.join(RUN, 'manifest.json'));
  if (sha(fs.readFileSync(path.join(RUN, 'jobs.jsonl'))) !== manifest.jobsSha256) throw Error('Jobs changed');
  const current = sourceState();
  for (const [f, h] of Object.entries(manifest.source.files)) if (current.files[f as keyof typeof current.files] !== h) throw Error('Source changed ' + f);
  const dir = path.join(RUN, 'receipts', arm); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const pending = lines(path.join(RUN, 'jobs.jsonl')).filter(j => !fs.existsSync(path.join(dir, j.id + '.json')));
  let index = 0, done = 0; const began = Date.now();
  console.log(JSON.stringify({ event: 'start', arm, pending: pending.length, concurrency }));
  const worker = async () => {
    while (index < pending.length) {
      const job = pending[index++];
      save(path.join(dir, job.id + '.json'), { ...(await call(arm, job)), finishedAt: new Date().toISOString() });
      if (++done % 50 === 0) console.log(JSON.stringify({ event: 'progress', arm, done, of: pending.length, seconds: Math.round((Date.now() - began) / 1000) }));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(JSON.stringify({ event: 'done', arm, seconds: Math.round((Date.now() - began) / 1000) }));
}

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

function report() {
  const pairs = lines(path.join(FROZEN, 'pairs.jsonl'));
  const jobs = lines(path.join(RUN, 'jobs.jsonl'));
  const out: any = { pairs: pairs.length, batches: jobs.length, arms: {} };
  const perPair: Record<string, number[]> = {};
  for (const arm of Object.keys(ARMS) as Arm[]) {
    const dir = path.join(RUN, 'receipts', arm);
    if (!fs.existsSync(dir)) continue;
    const receipts = jobs.map(j => path.join(dir, j.id + '.json')).filter(p => fs.existsSync(p)).map(read);
    const scores = new Map<string, number>();
    for (const r of receipts) for (const [id, v] of Object.entries<any>(r.scores)) scores.set(id, v.score);
    const credit = pairs.map(p => {
      const l = scores.get(p.like.recommendation_id), d = scores.get(p.dislike.recommendation_id);
      return l === undefined || d === undefined || l === d ? 0.5 : l > d ? 1 : 0;
    });
    perPair[arm] = credit;
    const lat = receipts.filter(r => !r.failed).map(r => r.okElapsedMs);
    const tokens = receipts.reduce((s, r) => s + (r.usage?.input_tokens ?? r.usage?.prompt_tokens ?? 0), 0);
    const reportedCost = receipts.reduce((s, r) => s + (typeof r.usage?.cost === 'number' ? r.usage.cost : 0), 0);
    out.arms[arm] = { model: ARMS[arm].model, receipts: receipts.length, failedCalls: receipts.filter(r => r.failed).length,
      retriedCalls: receipts.filter(r => r.attempts.length > 1).length,
      roleErrors: receipts.reduce((s, r) => s + (r.failed ? 0 : r.errors.length), 0), scoredRoles: scores.size,
      missingPairs: pairs.filter(p => !scores.has(p.like.recommendation_id) || !scores.has(p.dislike.recommendation_id)).length,
      tiedPairs: pairs.filter(p => scores.has(p.like.recommendation_id) && scores.get(p.like.recommendation_id) === scores.get(p.dislike.recommendation_id)).length,
      pairAccuracy: credit.reduce((a, b) => a + b, 0) / credit.length,
      latencyMs: { p50: pct(lat, .5), p95: pct(lat, .95), mean: Math.round(lat.reduce((a, b) => a + b, 0) / (lat.length || 1)) },
      inputTokens: tokens, listPriceUsd: tokens / 1e6 * ARMS[arm].usdPerMtok, providerReportedCostUsd: reportedCost || null };
  }
  // Paired talent-cluster bootstrap against luna.
  const talents = [...new Set(pairs.map(p => p.talent_id))];
  const byTalent = new Map(talents.map(t => [t, pairs.map((p, i) => p.talent_id === t ? i : -1).filter(i => i >= 0)]));
  let seed = 20261126; const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (const arm of Object.keys(perPair).filter(a => a !== 'luna')) {
    if (!perPair.luna) break;
    const diffs: number[] = [];
    for (let b = 0; b < 10000; b++) {
      let s = 0, n = 0;
      for (let k = 0; k < talents.length; k++) for (const i of byTalent.get(talents[Math.floor(rand() * talents.length)])!) { s += perPair[arm][i] - perPair.luna[i]; n++; }
      diffs.push(s / n);
    }
    out.arms[arm].deltaVsLuna = { point: out.arms[arm].pairAccuracy - out.arms.luna.pairAccuracy, ci95: [pct(diffs, .025), pct(diffs, .975)] };
  }
  fs.writeFileSync(path.join(RUN, 'report.json'), JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(out, null, 2));
}

process.umask(0o077);
const [command, arg, conc] = process.argv.slice(2);
Promise.resolve().then(() => command === 'prepare' ? prepare() : command === 'probe' ? probe()
  : command === 'run' ? run(arg as Arm, Number(conc || 6)) : command === 'report' ? report()
  : Promise.reject(Error('Use prepare, probe, run <arm> [concurrency], or report'))).catch(e => { console.error(e.message); process.exitCode = 1; });
