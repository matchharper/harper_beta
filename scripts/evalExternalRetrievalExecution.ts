/** Fixed-plan retrieval comparison. No LLM calls or production writes. */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildHybridSql } from "../src/lib/externalRecommendationsV2/retrieval";
import {
  annualSalaryKrw,
  salarySatisfaction,
  salaryRank,
} from "../src/lib/externalRecommendationsV2/salary";

const task = "docs/evaluation/external-role-salary-retrieval";
const combined = process.argv.includes("--combined-titles");
const executionVersion = combined ? "v7-execution" : "v6-execution";
const frozen = `${task}/private/execution-${combined ? "v7" : "v6"}`;
const planRun = `${task}/runs/users-2026-10-15T02-52-02-897Z`;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const save = (p: string, v: unknown) =>
  writeFile(p, JSON.stringify(v, null, 2) + "\n", { mode: 0o600, flag: "wx" });

async function query(sql: string, explain = false) {
  return new Promise<any>((done, reject) => {
    const child = spawn(
      resolve("../harper_worker/venv/bin/python"),
      [
        resolve(
          "../harper_worker/llm_evals/external_recommendations_v2/read_only_capture.py"
        ),
      ],
      {
        cwd: resolve("../harper_worker"),
        stdio: ["pipe", "pipe", "pipe"],
      }
    );
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error("Read-only capture exceeded 55 seconds including connection")
      );
    }, 55_000);
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code) reject(new Error(err));
      else {
        try {
          done(JSON.parse(out));
        } catch (e) {
          reject(e);
        }
      }
    });
    child.stdin.end(
      JSON.stringify({
        kind: "rpc",
        name: "search_external_roles_v2",
        params: { p_sql: sql },
        explain,
        planOnly: process.argv.includes("--query-plan"),
        timeoutMs: 30000,
      })
    );
  });
}
function metrics(rows: any[], target: number) {
  const utility = (r: any) => {
    const p = annualSalaryKrw(r);
    return salarySatisfaction(p.min, p.max, target);
  };
  const top = rows.slice(0, 50);
  return {
    count: rows.length,
    uniqueRoles: new Set(rows.map((r) => r.role_id)).size,
    companies: new Set(rows.map((r) => r.company_name)).size,
    unknown: rows.filter((r) => {
      const p = annualSalaryKrw(r);
      return p.min === null && p.max === null;
    }).length,
    sufficient: rows.filter((r) => (annualSalaryKrw(r).min ?? -1) >= target)
      .length,
    short: rows.filter((r) => {
      const p = annualSalaryKrw(r);
      return p.max !== null && p.max < target * 0.6;
    }).length,
    top50MeanSalaryUtility: top.length
      ? top.reduce((n, r) => n + utility(r), 0) / top.length
      : null,
  };
}
async function main() {
  const inputs = JSON.parse(
    await readFile(`${task}/private/users-v4.json`, "utf8")
  );
  const combinedRun = process.argv.find((a) => a.startsWith("--freeze-combined="))?.slice("--freeze-combined=".length);
  if (combinedRun) {
    if (!combined) throw new Error("Use --combined-titles when freezing combined input");
    await mkdir(frozen, { recursive: true, mode: 0o700 });
    const parent = JSON.parse(await readFile(`${task}/manifest-v6-execution.json`, "utf8"));
    const hashes: Record<string, string> = {};
    for (const c of inputs) {
      const original = await readFile(`${task}/private/execution-v6/${c.caseId}.json`, "utf8");
      if (sha(original) !== parent.caseHashes[c.caseId]) throw new Error("Parent fixture changed");
      const snapshot = JSON.parse(original);
      const plan = JSON.parse(await readFile(`${combinedRun}/${c.caseId}-plan.json`, "utf8"));
      if (plan.titleVectors.length !== 1) throw new Error("Expected one combined embedding");
      snapshot.args.plan.roleTitles = plan.plan.roleTitles;
      snapshot.args.vectors = plan.titleVectors;
      await save(`${frozen}/${c.caseId}.json`, snapshot);
      hashes[c.caseId] = sha(await readFile(`${frozen}/${c.caseId}.json`, "utf8"));
    }
    await save(`${task}/manifest-${executionVersion}.json`, {
      ...parent, datasetVersion: executionVersion, parentInput: "v6-execution + v7-users-combined-titles",
      caseHashes: hashes, combinedPlanRun: combinedRun, capturedAt: new Date().toISOString(),
      changedInputs: "Only roleTitles and their one combined vector; original scalar salary targets, countries, FTS, filters and baseline SQL remain frozen",
    });
    console.log("Frozen combined-title inputs without changing the original dataset");
    return;
  }
  if (process.argv.includes("--freeze")) {
    await mkdir(frozen, { recursive: true, mode: 0o700 });
    const hashes: Record<string, string> = {};
    for (const c of inputs) {
      const plan = JSON.parse(
        await readFile(`${planRun}/${c.caseId}-plan.json`, "utf8")
      );
      const args = {
        plan: plan.plan,
        vectors: plan.titleVectors,
        userId: c.userId,
        blockedCompanies: c.loaded.blockedCompanies,
        targetSalaryKrw: plan.targetSalaryKrw,
        limit: 500 as const,
        listOnly: true,
      };
      const snapshot = {
        caseId: c.caseId,
        args,
        baselineSql: buildHybridSql(args),
      };
      await save(`${frozen}/${c.caseId}.json`, snapshot);
      hashes[c.caseId] = sha(
        await readFile(`${frozen}/${c.caseId}.json`, "utf8")
      );
    }
    await save(`${task}/manifest-v6-execution.json`, {
      datasetVersion: "v6-execution",
      parentInput: "v5-users-market-value",
      caseHashes: hashes,
      canonicalRunner: "scripts/evalExternalRetrievalExecution.ts",
      capturedAt: new Date().toISOString(),
      baselineSourceHash: sha(
        await readFile("src/lib/externalRecommendationsV2/retrieval.ts", "utf8")
      ),
      frozenBeforeComparisons: true,
      privacy: "owner-only private/runs; no model calls or production writes",
    });
    console.log(
      "Frozen three plans, vectors, targets, filters and baseline SQL"
    );
    return;
  }
  const manifest = JSON.parse(
    await readFile(`${task}/manifest-${executionVersion}.json`, "utf8")
  );
  const only = process.argv.find((a) => a.startsWith("--case="))?.slice(7);
  const mode =
    process.argv.find((a) => a.startsWith("--variant="))?.slice(10) ?? "both";
  if (!["both", "baseline", "updated"].includes(mode))
    throw new Error("Invalid variant");
  const rounds = process.argv.includes("--two-rounds") ? 2 : 1;
  const explain = process.argv.includes("--explain");
  const salaryReplay = process.argv.includes("--salary-replay");
  if (salaryReplay && (!only || explain || rounds !== 1))
    throw new Error(
      "Salary replay needs one named case, one round, no EXPLAIN"
    );
  const predictionText = salaryReplay
    ? await readFile(
        "docs/evaluation/company-role-salary-estimation/runs/prefill-reviewed-v8-final-20261015/predictions.json",
        "utf8"
      )
    : "[]";
  const predictions = new Map<string, any>(
    JSON.parse(predictionText).map((p: any) => [p.roleId, p])
  );
  const dir = `${task}/runs/execution-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await save(`${dir}/manifest.json`, {
    ...manifest,
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirtyWorktree: true,
    currentSourceHash: sha(
      await readFile("src/lib/externalRecommendationsV2/retrieval.ts", "utf8")
    ),
    sourceHashes: Object.fromEntries(await Promise.all([
      "src/lib/externalRecommendationsV2/retrieval.ts",
      "src/lib/externalRecommendationsV2/searchTitles.ts",
      "src/lib/externalRecommendationsV2/engine.ts",
      "src/lib/externalRecommendationsV2/prompts.ts",
      "src/lib/talentOnboarding/jobPostingRecommendations.ts",
    ].map(async (path) => [path, sha(await readFile(path, "utf8"))]))),
    createdAt: new Date().toISOString(),
    rounds,
    mode,
    explain,
    salaryReplay,
    predictionHash: salaryReplay ? sha(predictionText) : null,
    timeoutMs: 30000,
    weight: 0.35,
    modelCalls: 0,
  });
  const results: any[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const c of inputs.filter((c: any) => !only || c.caseId === only)) {
      const raw = await readFile(`${frozen}/${c.caseId}.json`, "utf8");
      if (sha(raw) !== manifest.caseHashes[c.caseId])
        throw new Error("Frozen case changed");
      const frozenCase = JSON.parse(raw);
      const variants =
        mode === "both"
          ? round % 2
            ? ["updated", "baseline"]
            : ["baseline", "updated"]
          : [mode];
      for (const variant of variants) {
        let sql =
          variant === "baseline"
            ? frozenCase.baselineSql
            : buildHybridSql(frozenCase.args);
        if (salaryReplay) {
          if (frozenCase.args.plan.countries.length !== 1)
            throw new Error(
              "Replay supports only this frozen single-country slice"
            );
          sql =
            sql.slice(0, sql.indexOf("salary_ranked AS")).replace(/,\s*$/, "") +
            `
SELECT f.role_id::text,f.search_rank,cr.name AS role_name,cw.company_name,cr.country_code,cr.posted_at,
cr.salary_min,cr.salary_max,cr.salary_currency,cr.salary_period,cr.salary_range,cr.salary_is_predicted,
md5(jsonb_build_array(cr.name,cr.description,cr.company_workspace_id,cr.location_text,cr.country_code,cr.type)::text) AS source_hash
FROM fused f JOIN public.company_roles cr ON cr.role_id=f.role_id JOIN public.company_workspace cw ON cw.company_workspace_id=cr.company_workspace_id`;
        }
        const prefix = `${c.caseId}-${round}-${variant}`;
        await writeFile(`${dir}/${prefix}.sql`, sql, {
          mode: 0o600,
          flag: "wx",
        });
        const start = performance.now();
        try {
          let rows = await query(sql, explain);
          const wallMs = performance.now() - start;
          let replay: Record<string, unknown> = {};
          if (salaryReplay) {
            await save(`${dir}/${prefix}-pool.json`, rows);
            let overlaid = 0;
            const poolCount = rows.length;
            const began = performance.now();
            rows = rows
              .map((row: any) => {
                const p = predictions.get(row.role_id);
                if (
                  p &&
                  p.sourceHash === row.source_hash &&
                  row.salary_min == null &&
                  row.salary_max == null &&
                  !String(row.salary_range ?? "").trim()
                ) {
                  row = {
                    ...row,
                    salary_min: p.min,
                    salary_max: p.max,
                    salary_currency: "KRW",
                    salary_period: "year",
                    salary_is_predicted: true,
                  };
                  overlaid++;
                }
                const pay = annualSalaryKrw(row);
                return {
                  ...row,
                  search_rank: salaryRank(
                    Number(row.search_rank),
                    salarySatisfaction(
                      pay.min,
                      pay.max,
                      frozenCase.args.targetSalaryKrw
                    ),
                    0.35
                  ),
                };
              })
              .sort(
                (a: any, b: any) =>
                  b.search_rank - a.search_rank ||
                  (Date.parse(b.posted_at) || -Infinity) -
                    (Date.parse(a.posted_at) || -Infinity) ||
                  a.role_id.localeCompare(b.role_id)
              )
              .slice(0, 500);
            replay = {
              poolCount,
              overlaid,
              localSortMs: performance.now() - began,
            };
          }
          await save(`${dir}/${prefix}-rows.json`, rows);
          const result = {
            caseId: c.caseId,
            round,
            variant,
            wallMs,
            ...replay,
            ...(explain
              ? {
                  executionMs: rows[0]["Execution Time"],
                  planningMs: rows[0]["Planning Time"],
                }
              : metrics(rows, frozenCase.args.targetSalaryKrw)),
          };
          results.push(result);
          console.log(JSON.stringify(result));
        } catch (error) {
          const result = {
            caseId: c.caseId,
            round,
            variant,
            wallMs: performance.now() - start,
            error: String(error),
          };
          await save(`${dir}/${prefix}-error.json`, result);
          results.push(result);
          console.log(
            JSON.stringify({ ...result, error: result.error.slice(-500) })
          );
        }
      }
    }
  }
  await save(`${dir}/summary.json`, results);
  console.log(JSON.stringify({ output: dir }));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
