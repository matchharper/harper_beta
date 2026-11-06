/** Read-only frozen-feedback Decisions experiment. No production DB calls. */
import { readFile, writeFile, mkdir, chmod, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { buildScoringInput, v2PromptCandidate } from "../src/lib/externalRecommendationsV2/scoringInput";
import { buildDecisionRequest, parseDecisionBatch } from "../src/lib/externalRecommendationsV2/decisions";
import { directUsageCost } from "../src/lib/externalRecommendationsV2/usage";
import { estimatedBaseSalaryText } from "../src/lib/companyRoles/publishedCompensation";
import currentRubric from "../src/lib/externalRecommendationsV2/fitQuestions.v4.json";

const task = resolve("docs/evaluation/external-company-value");
const version = process.argv[3] ?? "v1";
if (!["v1", "v2"].includes(version)) throw new Error("Unknown dataset version");
const arms = version === "v2" ? ["baseline", "salary", "prompt", "combined", "previousCombined"] : ["baseline", "salary", "prompt", "combined"];
const runsPath = resolve(task, version === "v1" ? "runs" : "runs/v2");
const sha = (x: string | Buffer) => createHash("sha256").update(x).digest("hex");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
async function save(path: string, value: unknown, exclusive = false) {
  await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: exclusive ? "wx" : "w" });
  await chmod(path, 0o600);
}
const fixturePath = resolve(task, `private/fixture-${version}.json`);
const ledgerPath = resolve(runsPath, `budget-${version}.json`);

async function prepare() {
  const captureBytes = await readFile(resolve(task, `private/capture-${version}.json`));
  const capture = JSON.parse(captureBytes.toString());
  const baseline = await json(resolve(task, "baseline-rubric-v6.json"));
  const previous = await json(resolve(task, "previous-rubric-v7.json"));
  const users = new Map<string, string>();
  const cases = capture.rows.map((row: any, i: number) => {
    if (!users.has(row.talent_id)) users.set(row.talent_id, `u${users.size + 1}`);
    const context = structuredClone(row.input_snapshot.context);
    delete context.behavior_source_watermark;
    const candidate = row.card ? v2PromptCandidate({ ...row.card, row: { description: row.card.roleDescription } }, row.locale)
      : structuredClone(row.input_snapshot.candidate);
    delete candidate.estimatedBaseSalary;
    return { id: `case${String(i + 1).padStart(3, "0")}`, user: users.get(row.talent_id),
      label: ["like", "positive"].includes(row.feedback) ? 1 : 0,
      context, candidate, stored: row.assessment?.fit ?? null,
      estimatedSalary: row.same_jd ? estimatedBaseSalaryText(row.salary) : null,
      sameJd: row.same_jd, runId: row.run_id, restoration: row.restoration ?? null };
  });
  const grouped = new Map<string, any[]>();
  for (const c of cases) {
    const key = sha(JSON.stringify([c.user, c.context]));
    grouped.set(key, [...(grouped.get(key) ?? []), c]);
  }
  const batches = [...grouped.values()].flatMap(group => {
    const chunks = [];
    for (let i = 0; i < group.length; i += 10) chunks.push(group.slice(i, i + 10));
    return chunks;
  });
  const jobs = batches.flatMap((batch, batchIndex) => {
    const rotated = [...arms.slice(batchIndex % arms.length), ...arms.slice(0, batchIndex % arms.length)];
    return rotated.map(arm => {
      const candidates = batch.map(c => ({ ...c.candidate,
        estimatedBaseSalary: arm === "combined" ? c.estimatedSalary
          : arm === "salary" || arm === "previousCombined" ? c.estimatedSalary?.replace("; rough prediction; may be substantially inaccurate", "") ?? null : null }));
      const input = buildScoringInput(batch[0].context, candidates);
      const roleIds = candidates.map(c => c.roleId);
      const request = buildDecisionRequest("openai", input, roleIds,
        arm === "baseline" || arm === "salary" ? baseline : arm === "previousCombined" ? previous : currentRubric);
      return { id: `${batchIndex}-${arm}`, arm, cases: batch.map(c => c.id), roleIds, request, hash: sha(JSON.stringify(request)) };
    });
  });
  const fixture = { version, cases, jobs };
  await save(fixturePath, fixture, true);
  await save(resolve(task, `gold-${version}.json`), cases.map(({ id, user, label }: any) => ({ id, user, label })), true);
  const files = ["src/lib/externalRecommendationsV2/decisions.ts", "src/lib/externalRecommendationsV2/scoringInput.ts",
    "src/lib/externalRecommendationsV2/fitQuestions.v4.json", "src/lib/companyRoles/publishedCompensation.ts",
    "scripts/evalExternalCompanyValue.ts"];
  const sourceHashes = Object.fromEntries(await Promise.all(files.map(async f => [f, sha(await readFile(f))])));
  const manifest = { task: "external-company-value", datasetVersion: version, capturedAt: capture.capturedAt,
    preparedAt: new Date().toISOString(), sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: true, sourceHashes, captureHash: sha(captureBytes), fixtureHash: sha(await readFile(fixturePath)),
    cases: cases.length, users: users.size, positive: cases.filter((c: any) => c.label === 1).length,
    negative: cases.filter((c: any) => c.label === 0).length,
    salaryCoverage: cases.filter((c: any) => c.estimatedSalary).length,
    sameJd: cases.filter((c: any) => c.sameJd).length,
    model: "gpt-6-luna", provider: "openai", endpoint: "https://api.openai.com/v1/decisions",
    arms, batches: batches.length, calls: jobs.length, retries: 0, timeoutMs: 45000,
    selection: capture.selection ?? null, historicalSource: capture.historicalSource ?? null,
    salaryCaptureHash: capture.salaryCaptureHash ?? null,
    firstRecommendation: capture.firstRecommendation ?? null, lastRecommendation: capture.lastRecommendation ?? null,
    priorRubricHash: sha(await readFile(resolve(task, "previous-rubric-v7.json"))),
    baselineRubricHash: sha(await readFile(resolve(task, "baseline-rubric-v6.json"))),
    requestHashes: jobs.map(j => ({ id: j.id, sha256: j.hash })),
    pricingSource: "https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability",
    budgetUsd: 1, operationalCeilingUsd: 0.9,
    limitations: ["Selected feedback cohort, not representative exposure", "Salary captured now without historical timestamp",
      "Historical v2 uses fixed restored context; rebuilt behavior is not an exact original request",
      "Historical inputs preserved; batch membership may differ from original production", "No independent holdout or online outcome", "Handbook behavior not evaluated"] };
  await save(resolve(task, `manifest-${version}.json`), manifest, true);
  console.log(JSON.stringify({ prepared: cases.length, users: users.size, calls: jobs.length, salaryCoverage: manifest.salaryCoverage }));
}

async function run() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const fixture = await json(fixturePath);
  const manifest = await json(resolve(task, `manifest-${version}.json`));
  if (sha(await readFile(fixturePath)) !== manifest.fixtureHash) throw new Error("Frozen fixture changed");
  const lockPath = resolve(task, "runs/runner.lock");
  await mkdir(runsPath, { recursive: true, mode: 0o700 });
  const lock = await open(lockPath, "wx", 0o600);
  let ledger: any;
  try {
    try { ledger = await json(ledgerPath); }
    catch (e: any) { if (e.code !== "ENOENT") throw e; ledger = { fixtureHash: manifest.fixtureHash, calls: [] }; }
    if (ledger.fixtureHash !== manifest.fixtureHash) throw new Error("Budget belongs to different fixture");
    let priorCommittedUsd = 0;
    for (const other of [resolve(task, "runs/budget-v1.json"), resolve(task, "runs/v2/budget-v2.json")]) {
      if (other === ledgerPath) continue;
      try { const previous = await json(other); priorCommittedUsd += previous.calls.reduce((s: number,c: any) => s+(c.budgetChargeUsd ?? c.reserveUsd),0); }
      catch (error: any) { if (error.code !== "ENOENT") throw error; }
    }
    ledger.priorCommittedUsd = priorCommittedUsd;
    for (const job of fixture.jobs) {
      // In-flight/unknown-cost receipts are never retried on resume.
      if (ledger.calls.some((c: any) => c.id === job.id)) continue;
      const body = JSON.stringify(job.request);
      if (sha(body) !== job.hash) throw new Error("Request changed");
      // UTF-8 bytes bound text tokens; padding covers message/question framing.
      // USD 1/M is above documented long-context/cache-write rates and regional premiums.
      const reserveUsd = (Buffer.byteLength(body) + 4096 + job.request.questions.length * 128) / 1e6;
      const committed = ledger.calls.reduce((s: number, c: any) => s + (c.budgetChargeUsd ?? c.reserveUsd), 0);
      if (priorCommittedUsd + committed + reserveUsd > 0.9) throw new Error("Cumulative budget ceiling reached before dispatch");
      const receipt: any = { id: job.id, arm: job.arm, reserveUsd, status: "reserved", startedAt: new Date().toISOString() };
      ledger.calls.push(receipt);
      await save(ledgerPath, ledger);
      const began = performance.now();
      try {
        const response = await fetch("https://api.openai.com/v1/decisions", {
          method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body, signal: AbortSignal.timeout(45000), redirect: "error" });
        if (!response.ok) { await response.body?.cancel(); throw new Error(`Decisions HTTP ${response.status}`); }
        const raw = await response.json();
        const parsed = parseDecisionBatch("openai", raw, job.roleIds);
        const cost = directUsageCost("openai_decisions", raw.usage);
        const result = { id: job.id, arm: job.arm, cases: job.cases, roleIds: job.roleIds,
          requestHash: job.hash, raw, parsed, cost, elapsedMs: performance.now() - began };
        await save(resolve(runsPath, `${job.id}.json`), result, true);
        Object.assign(receipt, { status: "completed", costUsd: cost.usd, usage: raw.usage,
          budgetChargeUsd: cost.usd === null ? reserveUsd : cost.usd * 1.25, invalid: parsed.errors.length,
          elapsedMs: result.elapsedMs });
        if ((receipt.budgetChargeUsd ?? reserveUsd) > reserveUsd) throw new Error("Observed charge exceeds reservation; halt");
      } catch (error) {
        receipt.status = "failed";
        receipt.error = error instanceof Error ? error.message : String(error);
        await save(ledgerPath, ledger);
        throw error;
      }
      await save(ledgerPath, ledger);
      console.log(JSON.stringify({ completed: ledger.calls.length, total: fixture.jobs.length, last: job.id,
        costUsd: ledger.calls.reduce((s: number, c: any) => s + (c.costUsd ?? 0), 0) }));
    }
  } finally {
    await lock.close();
    const { unlink } = await import("node:fs/promises");
    await unlink(lockPath);
  }
}

const weights: Record<string, number[]> = { current: [.3,.5,.1,.1], former: [.65,.15,.1,.1], moderate: [.45,.35,.1,.1], equal: [.25,.25,.25,.25], mutualOnly: [1,0,0,0] };
const score = (fit: any, w: number[]) => [fit.mutualFit,fit.candidateInterest,fit.companyInterest,fit.roleFit].reduce((sum,n,i) => sum+n*w[i],0);
function auc(rows: any[], value: (r: any) => number) {
  const positive = rows.filter(r => r.label === 1), negative = rows.filter(r => r.label === 0);
  if (!positive.length || !negative.length) return null;
  let wins = 0;
  for (const p of positive) for (const n of negative) wins += value(p)>value(n) ? 1 : value(p)===value(n) ? .5 : 0;
  return wins / (positive.length*negative.length);
}
const mean = (v: number[]) => v.reduce((s,x)=>s+x,0)/v.length;
async function report() {
  const fixture = await json(fixturePath), ledger = await json(ledgerPath);
  const allArms = fixture.cases.every((c: any) => c.stored) ? ["stored", ...arms] : arms;
  const data = fixture.cases.map((c: any) => ({ ...c, fits: { stored: c.stored } }));
  for (const receipt of ledger.calls.filter((r: any) => r.status === "completed")) {
    const result = await json(resolve(runsPath, `${receipt.id}.json`));
    result.cases.forEach((id: string, i: number) => {
      const found = result.parsed.evaluations.find((e: any) => e.roleId === result.roleIds[i]);
      if (found) data.find((c: any) => c.id === id).fits[result.arm] = found.fit;
    });
  }
  const complete = data.filter((c: any) => allArms.every(a => c.fits[a]));
  const users = [...new Set(complete.map((c: any) => c.user))];
  const metrics = allArms.map(arm => {
    const value = (c: any) => score(c.fits[arm],weights.current);
    const userAucs = users.map(u => auc(complete.filter((c: any) => c.user === u),value)).filter((v): v is number=>v!==null);
    const axisMeans = Object.fromEntries([0,1].map(label => [label,Object.fromEntries(["candidateInterest","mutualFit","companyInterest","roleFit","constraintPass"].map(metric => [metric,mean(complete.filter((c: any)=>c.label===label).map((c: any)=>c.fits[arm][metric]))]))]));
    return { arm, candidateAuc: auc(complete,c=>c.fits[arm].candidateInterest), rankingAuc: auc(complete,value),
      withinUserAuc: userAucs.length ? mean(userAucs) : null, mixedUsers: userAucs.length, axisMeans,
      weights: Object.fromEntries(Object.entries(weights).map(([name,w])=>[name,auc(complete,c=>score(c.fits[arm],w))])),
      withinUserWeights: Object.fromEntries(Object.entries(weights).map(([name,w])=>{
        const values=users.map(user=>auc(complete.filter((c:any)=>c.user===user),c=>score(c.fits[arm],w))).filter((v):v is number=>v!==null);
        return [name,values.length ? mean(values) : null];
      })),
      salarySubsetAuc: auc(complete.filter((c:any)=>c.estimatedSalary),value),
      constraintFailures: complete.filter((c:any)=>c.fits[arm].constraintPass<=50).length };
  });
  const userPairResults = users.map(user => {
    const rows = complete.filter((c: any) => c.user === user);
    const pairs = rows.filter((c: any) => c.label === 1).length * rows.filter((c: any) => c.label === 0).length;
    return { user, pairs, values: Object.fromEntries(allArms.map(arm => [arm, auc(rows, c=>score(c.fits[arm],weights.current))])) };
  }).filter(row=>row.pairs>0);
  const pairCount = userPairResults.reduce((s,row)=>s+row.pairs,0);
  const pooledWithinUserPairAccuracy = Object.fromEntries(allArms.map(arm=>[arm,
    pairCount ? userPairResults.reduce((s,row)=>s+row.pairs*row.values[arm]!,0)/pairCount : null]));
  const macroComparisons: Record<string, unknown> = {};
  for (const reference of ["baseline", ...(arms.includes("previousCombined") ? ["previousCombined"] : [])]) {
    for (const arm of arms.filter(a=>a!==reference)) {
      const changes = userPairResults.map(row=>row.values[arm]!-row.values[reference]!);
      let bootstrapSeed = 20261106;
      const replicates: number[] = [];
      for (let i=0;i<2000 && changes.length;i++) {
        let sum=0;
        for(let j=0;j<changes.length;j++) {
          bootstrapSeed=(1664525*bootstrapSeed+1013904223)>>>0;
          sum+=changes[Math.floor(bootstrapSeed/4294967296*changes.length)];
        }
        replicates.push(sum/changes.length);
      }
      replicates.sort((a,b)=>a-b);
      macroComparisons[`${arm}-vs-${reference}`]={delta:changes.length ? mean(changes) : null,
        lower:replicates[Math.floor(replicates.length*.025)],upper:replicates[Math.floor(replicates.length*.975)],
        users:changes.length,improvedUsers:changes.filter(x=>x>0).length,worseUsers:changes.filter(x=>x<0).length,
        tiedUsers:changes.filter(x=>x===0).length};
    }
  }
  let state = 20261105;
  const random = () => ((state = (1664525*state+1013904223)>>>0)/4294967296);
  const deltas: Record<string,number[]> = Object.fromEntries(arms.filter(a=>a!=="baseline").map(a=>[a,[]]));
  for(let i=0;i<2000;i++) {
    const sample=users.flatMap(()=>{const u=users[Math.floor(random()*users.length)];return complete.filter((c:any)=>c.user===u);});
    const baseline=auc(sample,c=>score(c.fits.baseline,weights.current));
    if(baseline===null)continue;
    for(const arm of Object.keys(deltas)) {
      const result=auc(sample,c=>score(c.fits[arm],weights.current));
      if(result!==null)deltas[arm].push(result-baseline);
    }
  }
  const intervals=Object.fromEntries(Object.entries(deltas).map(([arm,values])=>{values.sort((a,b)=>a-b);return [arm,{replicates:values.length,lower:values[Math.floor(values.length*.025)],upper:values[Math.floor(values.length*.975)]}];}));
  const summary={ cases:complete.length,excludedIncomplete:data.length-complete.length,users:users.length,
    positive:complete.filter((c:any)=>c.label===1).length,negative:complete.filter((c:any)=>c.label===0).length,
    negativeUsers:new Set(complete.filter((c:any)=>c.label===0).map((c:any)=>c.user)).size,
    metrics,rankingAucDeltaUserBootstrap95:intervals,
    withinUserPairCount:pairCount,pooledWithinUserPairAccuracy,withinUserMacroDeltaBootstrap95:macroComparisons,
    calls:ledger.calls.length,completedCalls:ledger.calls.filter((c:any)=>c.status==="completed").length,
    costUsd:ledger.calls.reduce((s:number,c:any)=>s+(c.costUsd??0),0),
    budgetCommittedUsd:ledger.calls.reduce((s:number,c:any)=>s+(c.budgetChargeUsd??c.reserveUsd),0),
    priorCommittedUsd:ledger.priorCommittedUsd ?? 0,
    validEvaluations:data.reduce((s:number,c:any)=>s+arms.filter(arm=>c.fits[arm]).length,0),
    reportSourceHash:sha(await readFile("scripts/evalExternalCompanyValue.ts")) };
  await save(resolve(runsPath,"paired-results.json"),data);
  await save(resolve(task,`reports/summary-${version}.json`),summary);
  console.log(JSON.stringify(summary,null,2));
}
async function main() {
  const command=process.argv[2];
  if(command==="prepare") await prepare();
  else if(command==="run") await run();
  else if(command==="report") await report();
  else throw new Error("Usage: evalExternalCompanyValue.ts prepare|run|report");
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode=1; });
