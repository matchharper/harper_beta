import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { buildHybridSql } from "../src/lib/externalRecommendationsV2/retrieval";
import {
  annualSalaryKrw,
  salarySatisfaction,
  salaryRank,
} from "../src/lib/externalRecommendationsV2/salary";
import { countryQuotas } from "../src/lib/externalRecommendationsV2/countries";

const root = "docs/evaluation/external-role-salary-retrieval";
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const write = (path: string, data: unknown) =>
  writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600, flag: "wx" });
async function readOnly(sql: string) {
  return await new Promise<any[]>((done, reject) => {
    const child = spawn(
      resolve("../harper_worker/venv/bin/python"),
      [
        resolve(
          "../harper_worker/llm_evals/external_recommendations_v2/read_only_capture.py"
        ),
      ],
      { cwd: resolve("../harper_worker"), stdio: ["pipe", "pipe", "pipe"] }
    );
    let output = "",
      error = "";
    child.stdout.on("data", (v) => (output += v));
    child.stderr.on("data", (v) => (error += v));
    child.on("error", reject);
    child.on("close", (code) =>
      code ? reject(new Error(error)) : done(JSON.parse(output))
    );
    child.stdin.end(
      JSON.stringify({
        kind: "rpc",
        name: "search_external_roles_v2",
        params: { p_sql: sql },
      })
    );
  });
}
async function main() {
  const version = process.argv.includes("--dataset=v2") ? "v2" : "v1";
  const file = `${root}/private/pools-${version}.json`;
  if (process.argv.includes("--capture")) {
    const sourcePath =
      "docs/evaluation/external-recommendations-v2/private/country-quota-retrieval-v1/frozen-cases.json";
    const sourceText = await readFile(sourcePath, "utf8");
    const sources = JSON.parse(sourceText);
    const pools = [];
    const directions = [
      {
        vectors: sources[0].input.plan.titleVectors,
        plan: sources[0].input.plan.plan,
      },
    ];
    if (version === "v2")
      for (const titles of [
        ["Customer Support Specialist", "Customer Support Representative"],
        ["Account Executive", "Sales Manager"],
      ]) {
        const rows = await readOnly(
          `SELECT te.embedding::text AS embedding,te.title FROM public.external_role_title_embeddings te WHERE te.title_key IN (${titles.map((t) => `md5('${t}')`).join(",")}) AND te.embedding IS NOT NULL ORDER BY te.live_role_count DESC LIMIT 1`
        );
        if (!rows.length)
          throw new Error("Requested real title vector missing");
        directions.push({
          vectors: [JSON.parse(rows[0].embedding)],
          plan: {
            ...sources[0].input.plan.plan,
            roleTitles: [rows[0].title],
            ftsKeywords: [
              {
                terms: titles[0].startsWith("Customer")
                  ? ["customer", "support"]
                  : ["sales", "account"],
                weight: 1,
              },
            ],
          },
        });
      }

    // Use the same frozen semantic directions with the two explicit geographic
    // scenarios. No candidate salary facts are invented or stored.
    for (const [i, countries] of [
      [
        { countryCode: "KR", weight: 0.8, remoteOnly: false },
        { countryCode: "US", weight: 0.2, remoteOnly: true },
      ],
      [{ countryCode: "US", weight: 1, remoteOnly: false }],
    ].entries()) {
      const example = sources[0];
      const direction = directions[0];
      const plan = { ...direction.plan, countries };
      const sql = buildHybridSql({
        plan,
        vectors: direction.vectors,
        userId: example.userId,
        blockedCompanies: example.input.context.blockedCompanies,
        limit: 500,
        targetSalaryKrw: null,
      }).replace(/LIMIT 500$/, "LIMIT 6000");
      const began = Date.now();
      const rows = await readOnly(sql);
      pools.push({
        id: `pool-${i + 1}`,
        plan,
        rows,
        sql,
        elapsedMs: Date.now() - began,
      });
      console.log(
        JSON.stringify({
          pool: i + 1,
          rows: rows.length,
          elapsedMs: Date.now() - began,
        })
      );
    }
    if (version === "v2")
      for (const [j, direction] of directions.slice(1).entries()) {
        const example = sources[0];
        const plan = {
          ...direction.plan,
          countries: [{ countryCode: "US", weight: 1, remoteOnly: false }],
        };
        const sql = buildHybridSql({
          plan,
          vectors: direction.vectors,
          userId: example.userId,
          blockedCompanies: example.input.context.blockedCompanies,
          limit: 500,
          targetSalaryKrw: null,
        }).replace(/LIMIT 500$/, "LIMIT 6000");
        const began = Date.now();
        const rows = await readOnly(sql);
        pools.push({
          id: `pool-${j + 3}`,
          plan,
          rows,
          sql,
          elapsedMs: Date.now() - began,
        });
        console.log(
          JSON.stringify({
            pool: j + 3,
            rows: rows.length,
            elapsedMs: Date.now() - began,
          })
        );
      }
    await write(file, pools);
    await write(`${root}/manifest-${version}.json`, {
      datasetVersion: version,
      frozenAt: new Date().toISOString(),
      sourceHash: hash(sourceText),
      fixtureHash: hash(JSON.stringify(pools, null, 2)),
      countries: pools.map((p) => p.plan.countries),
      poolSizes: pools.map((p) => p.rows.length),
      readOnly: true,
      canonicalRunner: "scripts/evalExternalRoleSalaryRetrieval.ts",
      salaryTargetsKrw: [80e6, 120e6, 200e6, 300e6],
      model: null,
      independentHumanGold: false,
    });
    await write(`${root}/gold-${version}.json`, {
      version,
      author: "Codex before ranking comparison",
      source: "published structured salary",
      sufficient: "annual minimum >= target",
      materiallyShort: "annual maximum < 0.6 * target",
      mixed: "comparable annual band between these labels",
      unknown: "missing/invalid currency,period or endpoints",
      targetsKrw: [80e6, 120e6, 200e6, 300e6],
    });
    return;
  }
  const text = await readFile(file, "utf8");
  const pools = JSON.parse(text);
  const predictionPath = process.argv
    .find((v) => v.startsWith("--predictions="))
    ?.slice(14);
  let predictionHash: string | null = null,
    overlaid = 0;
  if (predictionPath) {
    const raw = await readFile(predictionPath, "utf8");
    predictionHash = hash(raw);
    const predictions = new Map(JSON.parse(raw).map((v: any) => [v.roleId, v]));
    const pg = (v: any): string =>
      Array.isArray(v)
        ? "[" + v.map(pg).join(", ") + "]"
        : JSON.stringify(v ?? null);
    for (const pool of pools)
      for (const row of pool.rows) {
        const prediction: any = predictions.get(row.role_id);
        const sourceHash = createHash("md5")
          .update(
            pg([
              row.role_name,
              row.description,
              row.company_workspace_id,
              row.location_text,
              row.country_code,
              row.type,
            ])
          )
          .digest("hex");
        if (
          prediction &&
          prediction.sourceHash === sourceHash &&
          row.salary_min == null &&
          row.salary_max == null &&
          !String(row.salary_range ?? "").trim()
        ) {
          Object.assign(row, {
            salary_min: prediction.min,
            salary_max: prediction.max,
            salary_currency: "KRW",
            salary_period: "year",
            salary_is_predicted: true,
          });
          overlaid++;
        }
      }
  }
  const output = `${root}/runs/rank-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(output, { recursive: true, mode: 0o700 });
  const results = [];
  for (const pool of pools) {
    const allocate = (rows: any[]) => {
      const quotas = new Map(
        countryQuotas(pool.plan.countries, 500).map((c) => [
          c.countryCode,
          c.quota,
        ])
      );
      const seen = new Map();
      return rows
        .map((row) => {
          const index = (seen.get(row.country_code) ?? 0) + 1;
          seen.set(row.country_code, index);
          return {
            ...row,
            quotaMet: index <= (quotas.get(row.country_code) ?? 0),
          };
        })
        .sort(
          (a, b) =>
            Number(b.quotaMet) - Number(a.quotaMet) ||
            b.rank - a.rank ||
            a.role_id.localeCompare(b.role_id)
        )
        .slice(0, 500);
    };
    const baseline = new Map(
      pool.rows.map((r: any, i: number) => [r.role_id, i + 1])
    );
    for (const target of [80e6, 120e6, 200e6, 300e6])
      for (const weight of [0, 0.2, 0.35, 0.5, 1]) {
        const ranked = pool.rows
          .map((row: any) => {
            const pay = annualSalaryKrw(row);
            const utility = salarySatisfaction(pay.min, pay.max, target);
            return {
              ...row,
              pay,
              utility,
              rank: salaryRank(Number(row.search_rank), utility, weight),
            };
          })
          .sort(
            (a: any, b: any) =>
              b.rank - a.rank || a.role_id.localeCompare(b.role_id)
          );
        const selected = allocate(ranked);
        const comparable = selected.filter(
          (r) =>
            !r.salary_is_predicted && r.pay.min != null && r.pay.max != null
        );
        const minBaseRanks = selected
          .map((r) => Number(baseline.get(r.role_id)))
          .sort((a, b) => a - b);
        const result = {
          pool: pool.id,
          targetKrw: target,
          weight,
          selected: selected.length,
          comparable: comparable.length,
          predicted: selected.filter((r) => r.salary_is_predicted).length,
          predictedSufficient: selected.filter(
            (r) => r.salary_is_predicted && r.pay.min >= target
          ).length,
          predictedShort: selected.filter(
            (r) => r.salary_is_predicted && r.pay.max < target * 0.6
          ).length,
          unknown: selected.filter(
            (r) => r.pay.min == null && r.pay.max == null
          ).length,
          sufficient: comparable.filter((r) => r.pay.min >= target).length,
          materiallyShort: comparable.filter((r) => r.pay.max < target * 0.6)
            .length,
          baselineTop500Retained: selected.filter(
            (r) => Number(baseline.get(r.role_id)) <= 500
          ).length,
          medianTopicalRank: minBaseRanks[Math.floor(minBaseRanks.length / 2)],
          countries: Object.fromEntries(
            [...new Set(selected.map((r) => r.country_code))].map((c) => [
              c,
              selected.filter((r) => r.country_code === c).length,
            ])
          ),
        };
        results.push(result);
        await write(`${output}/${pool.id}-${target}-${weight}.json`, {
          result,
          selected: selected.map((r) => ({
            id: r.role_id,
            rank: r.rank,
            pay: r.pay,
            utility: r.utility,
          })),
        });
      }
  }
  await write(`${output}/summary.json`, {
    fixtureHash: hash(text),
    datasetVersion: predictionPath ? "v3-derived-predictions" : version,
    predictionHash,
    overlaid,
    sourceHash: hash(
      await readFile("src/lib/externalRecommendationsV2/salary.ts", "utf8")
    ),
    results,
  });
  console.log(JSON.stringify({ output, results }));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
