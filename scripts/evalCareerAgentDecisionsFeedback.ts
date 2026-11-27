/** Career agent external recommendations: 👍/👎 pairs scored on the exact production scoring input.
 * capture  read-only production read of feedback + the evaluation each shown role was ranked by
 * run <arm> [concurrency]   score the frozen roles with one Decisions model (same input, rubric, parser, rank)
 * report   pair accuracy of each run arm and of the stored production scores
 * Raw inputs/outputs stay in the ignored private/ and runs/ folders of the task.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { buildDecisionRequest, parseDecisionBatch } from '../src/lib/externalRecommendationsV2/decisions';
import { buildScoringInputParts } from '../src/lib/externalRecommendationsV2/scoringInput';
import { PROMPT_VERSION, evaluatorKey, fitSchema, rankScore } from '../src/lib/externalRecommendationsV2/contract';
import { DEFAULT_ADMIN_EXCLUDED_EMAILS } from '../src/lib/adminEmailExclusions';
import { directUsageCost } from '../src/lib/externalRecommendationsV2/usage';

const TASK = path.resolve('docs/evaluation/career-agent-decisions-feedback');
const FROZEN = path.join(TASK, 'private/frozen-v1');
const RUNS = path.join(TASK, 'runs');
const OPENROUTER = 'https://openrouter.ai/api/alpha/decisions';
const ARMS = {
  pplx_v13: { provider: 'jev' as const, model: 'perplexity/pplx-decider-v1.3:free', endpoint: OPENROUTER, usdPerMtok: 0 },
  luna: { provider: 'openai' as const, model: 'gpt-6-luna', endpoint: 'https://api.openai.com/v1/decisions', usdPerMtok: 0.10 },
};
type Arm = keyof typeof ARMS;
// harper_eval labels.py pairs-v1, unchanged.
const FEEDBACK_DAYS = 7, ALREADY_APPLIED = '이미 지원했던 회사/역할입니다.', EXPIRED = '만료된 공고에요.';
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const lines = (p: string): any[] => fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(v => JSON.parse(v));
const save = (p: string, v: unknown) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { mode: 0o600, flag: 'wx' });

function label(r: any): 'like' | 'dislike' | null {
  if (!r.feedback_at || Date.parse(r.feedback_at) > Date.parse(r.created_at) + FEEDBACK_DAYS * 864e5) return null;
  if (r.feedback === 'like') return r.feedback_reason === ALREADY_APPLIED ? null : 'like';
  let reason: any = r.feedback_reason;
  if (typeof reason === 'string' && /^\s*\{/.test(reason)) try { reason = JSON.parse(reason); } catch { /* plain text */ }
  const opts = reason && typeof reason === 'object' ? reason.selectedOptions : null;
  const onlyExpiredOrApplied = Array.isArray(opts) && opts.length > 0 && !(reason.customReason ?? '') &&
    opts.filter((o: unknown) => o != null).every((o: unknown) => o === EXPIRED || o === ALREADY_APPLIED);
  return onlyExpiredOrApplied ? null : 'dislike';
}

async function capture() {
  if (fs.existsSync(FROZEN)) throw Error('Frozen dataset exists; do not overwrite it');
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const staffExact = DEFAULT_ADMIN_EXCLUDED_EMAILS.filter(e => !e.startsWith('@'));
  const staffDomains = DEFAULT_ADMIN_EXCLUDED_EMAILS.filter(e => e.startsWith('@')).map(d => '%' + d);
  let rows: any[] = [], cutoff = '';
  await sql.begin('read only', async tx => {
    cutoff = (await tx`select now()::text as t`)[0].t;
    // The evaluation each recommendation was ranked by: the latest one for that talent and role at the time it was shown.
    rows = await tx`
      select rec.id::text rec_id, rec.talent_id::text, rec.role_id::text, rec.feedback, rec.feedback_reason,
        rec.feedback_at::text, rec.created_at::text, to_char(rec.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD') kst_day,
        ev.id::text eval_id, ev.evaluated_at::text, ev.input_snapshot, ev.assessment
      from public.talent_opportunity_recommendation rec
      join public.talent_users tu on tu.user_id = rec.talent_id
      cross join lateral (
        select e.id, e.evaluated_at, e.input_snapshot, e.assessment from public.talent_external_evaluations e
        where e.talent_id = rec.talent_id and e.role_id = rec.role_id and e.evaluated_at <= rec.created_at + interval '5 minutes'
        order by e.evaluated_at desc limit 1) ev
      where rec.kind = 'career_agent' and rec.opportunity_type = 'external_jd' and rec.feedback in ('like','dislike')
        and not exists (select 1 from public.talent_test_accounts t where t.user_id = rec.talent_id)
        and lower(coalesce(tu.email,'')) <> all(${staffExact}::text[])
        and not (lower(coalesce(tu.email,'')) like any(${staffDomains}::text[]))
      order by rec.talent_id, rec.created_at, rec.id`;
  });
  await sql.end();
  // A case is one talent's recommendations shown on one KST day; pairs stay inside a case.
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const l = label(r);
    if (!l || !r.input_snapshot?.candidate || !r.input_snapshot?.context) continue;
    const key = `${r.talent_id}:${r.kst_day}`;
    groups.set(key, [...(groups.get(key) ?? []), { ...r, label: l }]);
  }
  const cases: any[] = [], pairs: any[] = [];
  for (const [key, roles] of groups) {
    // One shown role per case: the first recommendation of it.
    const unique = [...new Map(roles.map(r => [r.role_id, r])).values()];
    const likes = unique.filter(r => r.label === 'like'), dislikes = unique.filter(r => r.label === 'dislike');
    if (!likes.length || !dislikes.length) continue;
    cases.push({ case_key: key, talent_id: unique[0].talent_id, kst_day: unique[0].kst_day, roles: unique });
    for (const l of likes) for (const d of dislikes) pairs.push({ case_key: key, talent_id: l.talent_id, like: l.rec_id, dislike: d.rec_id });
  }
  fs.mkdirSync(FROZEN, { recursive: true, mode: 0o700 });
  const files: Record<string, string> = {};
  for (const [name, values] of [['cases.jsonl', cases], ['pairs.jsonl', pairs]] as const) {
    const text = values.map(v => JSON.stringify(v)).join('\n') + '\n';
    fs.writeFileSync(path.join(FROZEN, name), text, { flag: 'wx', mode: 0o600 }); files[name] = sha(text);
  }
  const roles = cases.flatMap(c => c.roles);
  const evaluators: Record<string, number> = {};
  for (const r of roles) evaluators[r.input_snapshot.evaluator ?? 'unknown'] = (evaluators[r.input_snapshot.evaluator ?? 'unknown'] ?? 0) + 1;
  const manifest = { datasetVersion: 'career-agent-decisions-feedback-v1', cutoff, capturedAt: new Date().toISOString(),
    selection: 'talent_opportunity_recommendation kind=career_agent, external_jd, feedback like/dislike; test accounts and staff emails excluded; evaluation = latest talent_external_evaluations row for (talent, role) at or before the recommendation (+5 min)',
    labelRule: 'harper_eval pairs-v1: feedback within 7 days of the recommendation; 👍 marked already-applied and 👎 with only expired/applied options are not labels',
    caseRule: 'one talent and one KST day; a role counted once (first recommendation); pairs inside a case',
    cases: cases.length, talents: new Set(cases.map(c => c.talent_id)).size, roles: roles.length, pairs: pairs.length,
    days: [cases.map(c => c.kst_day).sort()[0], cases.map(c => c.kst_day).sort().at(-1)], evaluators, files,
    privacy: 'Read-only production transaction. Raw rows owner-only in ignored private/. Gold in the registry is de-identified.' };
  fs.writeFileSync(path.join(FROZEN, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  // De-identified gold for the registry.
  const alias = new Map<string, string>(), talentAlias = new Map<string, string>();
  cases.forEach((c, i) => { if (!talentAlias.has(c.talent_id)) talentAlias.set(c.talent_id, `T${String(talentAlias.size + 1).padStart(3, '0')}`);
    c.roles.forEach((r: any, j: number) => alias.set(r.rec_id, `C${String(i + 1).padStart(3, '0')}-R${String(j + 1).padStart(2, '0')}`)); });
  fs.writeFileSync(path.join(TASK, 'gold-v1.json'), JSON.stringify({ version: 'career-agent-pairs-v1', rule: manifest.labelRule,
    pairs: pairs.map(p => ({ like: alias.get(p.like), dislike: alias.get(p.dislike), talent: talentAlias.get(p.talent_id) })) }, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(TASK, 'manifest-v1.json'), JSON.stringify({ ...manifest, privacy: undefined,
    note: 'Aggregate only; raw cases/pairs are in ignored private/frozen-v1 with these hashes.' }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ cases: manifest.cases, talents: manifest.talents, roles: manifest.roles, pairs: manifest.pairs, days: manifest.days, evaluators }));
}

function jobs() {
  const out: any[] = [];
  for (const c of lines(path.join(FROZEN, 'cases.jsonl'))) {
    // Production batches share one scoring context; keep that, and at most ten roles a batch.
    const byContext = new Map<string, any[]>();
    for (const r of c.roles) {
      const context = { ...r.input_snapshot.context }; delete context.behavior_source_watermark;
      const k = sha(JSON.stringify(context));
      byContext.set(k, [...(byContext.get(k) ?? []), { ...r, scoringContext: context }]);
    }
    let b = 0;
    for (const group of byContext.values()) for (let i = 0; i < group.length; i += 10) {
      const roles = group.slice(i, i + 10);
      out.push({ id: `${sha(c.case_key).slice(0, 16)}-b${b++}`, case_key: c.case_key,
        recIds: roles.map(r => r.rec_id), roleIds: roles.map(r => r.input_snapshot.candidate.roleId ?? r.role_id),
        parts: buildScoringInputParts(roles[0].scoringContext, roles.map(r => r.input_snapshot.candidate)) });
    }
  }
  return out;
}

async function call(arm: Arm, job: any) {
  const a = ARMS[arm];
  const key = a.provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.OPENROUTER_API_KEY;
  if (!key) throw Error('Missing credential for ' + arm);
  const base = buildDecisionRequest(a.provider, job.parts, job.roleIds) as any;
  const request = a.provider === 'jev' ? { ...base, model: a.model } : base;
  const attempts: any[] = []; let raw: any = null; const started = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ts = Date.now();
    try {
      const res = await fetch(a.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(30_000) });
      const body = await res.text(); let response: any; try { response = JSON.parse(body); } catch { response = { nonJson: body.slice(0, 2000) }; }
      attempts.push({ attempt, httpStatus: res.status, elapsedMs: Date.now() - ts, response });
      if (res.ok) { raw = response; break; }
      if (attempt === 1 && (res.status === 408 || res.status === 429 || res.status >= 500)) {
        const s = Number(res.headers.get('retry-after') || 1);
        await new Promise(r => setTimeout(r, Math.max(1000, Math.min(60_000, (Number.isFinite(s) ? s : 1) * 1000)))); continue;
      }
      break;
    } catch (e) { attempts.push({ attempt, elapsedMs: Date.now() - ts, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }); }
  }
  const parsed = raw ? parseDecisionBatch(a.provider, raw, job.roleIds) : { evaluations: [], errors: job.roleIds };
  return { id: job.id, arm, model: a.model, resolvedModel: raw?.model ?? null, elapsedMs: Date.now() - started,
    okElapsedMs: raw ? attempts[attempts.length - 1].elapsedMs : null, attempts, usage: raw?.usage ?? null, failed: !raw, errors: parsed.errors,
    scores: Object.fromEntries(parsed.evaluations.map((e: any) => [job.recIds[job.roleIds.indexOf(e.roleId)], { fit: e.fit, score: rankScore(e.fit) }])) };
}

async function run(arm: Arm, concurrency: number) {
  if (!ARMS[arm]) throw Error('Unknown arm');
  const frozen = read(path.join(FROZEN, 'manifest.json'));
  for (const [name, hash] of Object.entries(frozen.files)) if (sha(fs.readFileSync(path.join(FROZEN, name))) !== hash) throw Error('Frozen input changed');
  const dir = path.join(RUNS, `v1-${arm}`, 'receipts'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const manifestPath = path.join(RUNS, `v1-${arm}`, 'manifest.json');
  const all = jobs();
  if (!fs.existsSync(manifestPath)) save(manifestPath, { arm: ARMS[arm], promptVersion: PROMPT_VERSION, createdAt: new Date().toISOString(),
    batches: all.length, frozen: frozen.files, scriptSha256: sha(fs.readFileSync('scripts/evalCareerAgentDecisionsFeedback.ts')) });
  const pending = all.filter(j => !fs.existsSync(path.join(dir, j.id + '.json')));
  let index = 0, done = 0; const began = Date.now();
  console.log(JSON.stringify({ event: 'start', arm, batches: all.length, pending: pending.length, concurrency }));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (index < pending.length) {
      const job = pending[index++];
      save(path.join(dir, job.id + '.json'), { ...(await call(arm, job)), finishedAt: new Date().toISOString() });
      if (++done % 50 === 0) console.log(JSON.stringify({ event: 'progress', arm, done, of: pending.length, seconds: Math.round((Date.now() - began) / 1000) }));
    }
  }));
  console.log(JSON.stringify({ event: 'done', arm, seconds: Math.round((Date.now() - began) / 1000) }));
}

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

function report() {
  const pairs = lines(path.join(FROZEN, 'pairs.jsonl'));
  const cases = lines(path.join(FROZEN, 'cases.jsonl'));
  const roleOf = new Map(cases.flatMap(c => c.roles.map((r: any) => [r.rec_id, r])));
  const credit = (scores: Map<string, number>, subset = pairs) => subset.map(p => {
    const l = scores.get(p.like), d = scores.get(p.dislike);
    return l === undefined || d === undefined || l === d ? 0.5 : l > d ? 1 : 0;
  });
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  // Stored production scores, by the evaluator each role was ranked with.
  const stored = new Map<string, number>(), storedEvaluator = new Map<string, string>();
  for (const [id, r] of roleOf) {
    const fit = fitSchema.safeParse(r.assessment?.fit);
    if (fit.success) stored.set(id, rankScore(fit.data));
    storedEvaluator.set(id, r.input_snapshot.evaluator ?? 'unknown');
  }
  const current = evaluatorKey('openai');
  const sameEvaluator = pairs.filter(p => storedEvaluator.get(p.like) === current && storedEvaluator.get(p.dislike) === current);
  const out: any = { pairs: pairs.length, cases: cases.length, talents: new Set(cases.map(c => c.talent_id)).size,
    storedProduction: { note: 'Scores production stored for these roles (rank formula of today applied to the stored fit)',
      scoredRoles: stored.size, pairAccuracy: mean(credit(stored)),
      currentEvaluator: current, currentEvaluatorPairs: sameEvaluator.length, currentEvaluatorAccuracy: mean(credit(stored, sameEvaluator)) },
    arms: {} };
  const all = jobs();
  const armCredits: Partial<Record<Arm, number[]>> = {};
  const talents = [...new Set(pairs.map(p => p.talent_id))];
  const idx = new Map(talents.map(t => [t, pairs.flatMap((p, i) => p.talent_id === t ? [i] : [])]));
  // Paired talent-cluster bootstrap of a − b.
  const bootstrap = (a: number[], b: number[]) => {
    let seed = 20261126; const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const diffs: number[] = [];
    for (let k = 0; k < 10000; k++) { let s = 0, n = 0;
      for (let t = 0; t < talents.length; t++) for (const i of idx.get(talents[Math.floor(rand() * talents.length)])!) { s += a[i] - b[i]; n++; }
      diffs.push(s / n); }
    return { point: mean(a) - mean(b), ci95: [pct(diffs, .025), pct(diffs, .975)] };
  };
  for (const arm of Object.keys(ARMS) as Arm[]) {
    const dir = path.join(RUNS, `v1-${arm}`, 'receipts');
    if (!fs.existsSync(dir)) continue;
    const receipts = all.map(j => path.join(dir, j.id + '.json')).filter(p => fs.existsSync(p)).map(read);
    const scores = new Map<string, number>();
    for (const r of receipts) for (const [id, v] of Object.entries<any>(r.scores)) scores.set(id, v.score);
    const lat = receipts.filter(r => !r.failed).map(r => r.okElapsedMs);
    const tokens = receipts.reduce((s, r) => s + (r.usage?.input_tokens ?? 0), 0);
    const armCredit = credit(scores);
    armCredits[arm] = armCredit;
    // OpenRouter reports cost; OpenAI Decisions uses the production estimate (cache reads/writes priced).
    const cost = receipts.reduce((s, r) => s + (r.usage ? directUsageCost(ARMS[arm].provider === 'openai' ? 'openai_decisions' : 'jev_decisions', r.usage).usd ?? 0 : 0), 0);
    out.arms[arm] = { model: ARMS[arm].model, batches: all.length, receipts: receipts.length, failedCalls: receipts.filter(r => r.failed).length,
      retriedCalls: receipts.filter(r => r.attempts.length > 1).length, roleErrors: receipts.reduce((s, r) => s + (r.failed ? 0 : r.errors.length), 0),
      scoredRoles: scores.size, tiedPairs: pairs.filter(p => scores.has(p.like) && scores.get(p.like) === scores.get(p.dislike)).length,
      pairAccuracy: mean(armCredit),
      currentEvaluatorSubsetAccuracy: mean(credit(scores, sameEvaluator)),
      deltaVsStoredProduction: bootstrap(armCredit, credit(stored)),
      latencyMs: { p50: pct(lat, .5), p95: pct(lat, .95), mean: Math.round(mean(lat)) },
      inputTokens: tokens, costUsd: cost };
  }
  if (armCredits.pplx_v13 && armCredits.luna) out.pplxMinusLuna = bootstrap(armCredits.pplx_v13, armCredits.luna);
  fs.writeFileSync(path.join(RUNS, 'report-v1.json'), JSON.stringify(out, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(out, null, 2));
}

process.umask(0o077);
const [command, arg, conc] = process.argv.slice(2);
Promise.resolve().then(() => command === 'capture' ? capture() : command === 'run' ? run(arg as Arm, Number(conc || 3))
  : command === 'report' ? report() : Promise.reject(Error('Use capture, run <arm> [concurrency], or report')))
  .catch(e => { console.error(e.message); process.exitCode = 1; });
