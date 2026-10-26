/** Offline counterfactual over frozen production scores; no DB or model calls. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fitSchema, rankScore, type Fit } from "../src/lib/externalRecommendationsV2/contract";

process.umask(0o077);
const root = process.cwd();
const task = path.join(root, "docs/evaluation/external-v2-weight-replay");
const source = path.join(task, "private/frozen-v1/capture.json");
const capture = JSON.parse(readFileSync(source, "utf8"));
const variants = [
  { name: "기존", weights: [65, 15, 10, 10] },
  { name: "균등", weights: [25, 25, 25, 25] },
  { name: "후보자 관심 중심", weights: [30, 50, 10, 10] },
  { name: "직무 적합도 중심", weights: [30, 15, 10, 45] },
  { name: "관심·직무 균형", weights: [20, 40, 10, 30] },
  { name: "상호 적합도 제외", weights: [0, 60, 5, 35] },
];
function weighted(fit: Fit, weights: number[]) {
  const [m, c, e, r] = weights.map(w => w / 100);
  const base = m * fit.mutualFit + c * fit.candidateInterest + e * fit.companyInterest + r * fit.roleFit;
  return fit.constraintPass <= 50 ? base * 0.2 * (fit.constraintPass / 50) ** 2 : base;
}
const reasonCounts: Record<string, number> = {};
const rejected: any[] = [];
const included: any[] = [];
const outcomes: any[] = [];
const allUsers = [...new Set<string>(capture.runs.map((r: any) => r.talent_id))].sort();
for (const [runIndex, run] of capture.runs.entries()) {
  let reason: string | undefined;
  const pool = (run.pool ?? []).filter((p: any) => fitSchema.safeParse(p.evaluation).success);
  if (run.cache_hits !== "0") reason = "cached_pool_membership_unavailable";
  else if (run.overlapping_run) reason = "overlapping_run";
  else if (!pool.length || pool.length !== Number(run.scored_count)) reason = "incomplete_or_overwritten_pool";
  else if (new Set(pool.map((p: any) => p.evaluation.inputFingerprint)).size !== 1) reason = "mixed_input_fingerprint";
  else if (pool.length <= 25) reason = "pool_not_larger_than_25";
  else {
    for (const rec of run.recommendations ?? []) {
      const p = pool.find((p: any) => p.role_id === rec.roleId);
      if (!p) { reason = "recommended_role_missing"; break; }
      // Worker persists four decimal places on its normalized 0..1 score.
      if (Math.abs(rankScore(p.evaluation) / 100 - Number(rec.score)) > 0.000051) {
        reason = "historical_recommendation_score_mismatch"; break;
      }
    }
  }
  if (reason) {
    reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    rejected.push({ runId: run.id, reason, preserved: pool.length, expected: run.scored_count });
    continue;
  }
  const alias = `R${String(runIndex + 1).padStart(3, "0")}`;
  const talent = `U${String(allUsers.indexOf(run.talent_id) + 1).padStart(3, "0")}`;
  const ranks = variants.map(v => {
    const rows = pool.map((p: any) => {
      const fit = fitSchema.parse(p.evaluation);
      assert.ok(Math.abs(weighted(fit, variants[0].weights) - rankScore(fit)) < 1e-10);
      return { id: p.role_id, score: weighted(fit, v.weights) };
    }).sort((a: any, b: any) => b.score - a.score || a.id.localeCompare(b.id));
    return new Map(rows.map((p: any, i: number) => [p.id, { rank: i + 1, score: p.score,
      above: rows.filter((r: any) => r.score > p.score + 1e-10).length,
      tied: rows.filter((r: any) => Math.abs(r.score-p.score)<1e-10).length }]));
  });
  included.push({ alias, talent, surface: run.surface, poolSize: pool.length, runId: run.id });
  for (const [i, rec] of (run.recommendations ?? []).entries()) {
    const label = ["like", "positive"].includes(rec.feedback) ? "like"
      : ["dislike", "negative"].includes(rec.feedback) ? "dislike" : null;
    if (!label) continue;
    const p = pool.find((p: any) => p.role_id === rec.roleId);
    outcomes.push({ alias: `${alias}-P${i+1}`, talent, runAlias: alias, surface: run.surface,
      label, reason: rec.reason, poolSize: pool.length, fit: fitSchema.parse(p.evaluation),
      ranks: ranks.map((r: any) => r.get(rec.roleId)) });
  }
}
function metrics(rows: any[]) {
  const negative = rows.filter(r => r.label === "dislike");
  const positive = rows.filter(r => r.label === "like");
  const negIn = negative.filter(r => r.ranks[0].rank <= 25);
  const posIn = positive.filter(r => r.ranks[0].rank <= 25);
  return { dislikes: negative.length, likes: positive.length, baselineDislikesTop25: negIn.length,
    baselineLikesTop25: posIn.length,
    variants: variants.map((v, i) => ({ ...v,
      dislikesDropped: negIn.filter(r => r.ranks[i].rank > 25).length,
      dislikesDroppedBeyondTie: negIn.filter(r => r.ranks[i].above >= 25).length,
      dislikesTop25: negative.filter(r => r.ranks[i].rank <= 25).length,
      likesDropped: posIn.filter(r => r.ranks[i].rank > 25).length,
      likesTop25: positive.filter(r => r.ranks[i].rank <= 25).length,
      meanDislikeRankChange: negative.length ? negative.reduce((s,r) => s+r.ranks[i].rank-r.ranks[0].rank,0)/negative.length : null,
      affectedUsers: new Set(negIn.filter(r => r.ranks[i].rank>25).map(r=>r.talent)).size,
    })) };
}
const aggregate = { capturedAt: capture.capturedAt, sourceRuns: capture.runs.length,
  sourceDislikes: capture.runs.flatMap((r:any)=>r.recommendations??[]).filter((r:any)=>["dislike","negative"].includes(r.feedback)).length,
  includedRuns: included.length, includedUsers: new Set(included.map(r=>r.talent)).size,
  totalScoredRoles: included.reduce((s,r)=>s+r.poolSize,0), excluded: reasonCounts,
  ...metrics(outcomes), bySurface: Object.fromEntries(["worker","web","daily"].map(s=>[s,metrics(outcomes.filter(r=>r.surface===s))])) };
const runId = new Date().toISOString().replaceAll(":", "-");
const outDir = path.join(task, "runs", runId);
mkdirSync(outDir, { recursive: true, mode: 0o700 });
for (const [name, value] of Object.entries({ aggregate, included, rejected, outcomes }))
  writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(value,null,2)+"\n", { mode: 0o600 });
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const manifest = { task:"external-v2-weight-replay", datasetVersion:capture.datasetVersion,
  goldVersion:"observed-feedback-v1", runId, sourceRevision:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
  sourceFiles:Object.fromEntries(["scripts/captureExternalV2WeightReplay.py","scripts/reportExternalV2WeightReplay.ts",
    "src/lib/externalRecommendationsV2/contract.ts"].map(p=>[p,sha(path.join(root,p))])),
  captureSha256:sha(source), model:"stored gpt-6-luna Decisions scores; no new inference",
  measurementVersion:capture.measurementVersion, variants,
  metrics:aggregate, privacy:"IDs, scores, and raw feedback remain in ignored owner-only private/runs" };
writeFileSync(path.join(outDir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
const gold = { version:"observed-feedback-v1", unit:"run x recommended role", labels:outcomes.map(r=>({alias:r.alias,talent:r.talent,label:r.label})) };
const goldPath=path.join(task,"gold-v1.json");
if (!existsSync(goldPath)) writeFileSync(goldPath,JSON.stringify(gold,null,2)+"\n",{flag:"wx"});
else assert.deepEqual(JSON.parse(readFileSync(goldPath,"utf8")),gold);
writeFileSync(path.join(task,`manifest-${runId}.json`),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({ ...aggregate, runPath:outDir },null,2));
