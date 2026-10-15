/** Replay actual hybrid retrieval with frozen plans; DB transaction is read-only. */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { buildHybridSql } from "../src/lib/externalRecommendationsV2/retrieval";

async function main() {
  const frozenPath = process.argv
    .find((v) => v.startsWith("--frozen="))
    ?.slice(9);
  if (!frozenPath) throw new Error("Expected --frozen=<private frozen inputs>");
  const count = Number(
    process.argv.find((v) => v.startsWith("--count="))?.slice(8) ?? 5
  );
  const rowsMode = process.argv.includes("--rows");
  const planOnly = process.argv.includes("--plan-only");
  const stage =
    process.argv.find((v) => v.startsWith("--stage="))?.slice(8) ?? "all";
  if (!["all", "semantic_pool", "lexical", "nearest_0"].includes(stage))
    throw new Error("Invalid diagnostic stage");
  const timeoutMs = Number(
    process.argv.find((v) => v.startsWith("--timeout-ms="))?.slice(13) ?? 30000
  );
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 5 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1000 ||
    timeoutMs > 120000
  )
    throw new Error("Invalid diagnostic bounds");
  const cases = JSON.parse(await readFile(frozenPath, "utf8")).slice(0, count);
  const output = `docs/evaluation/external-recommendations-v2/runs/retrieval-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(output, { recursive: true, mode: 0o700 });
  const save = (name: string, data: unknown) =>
    writeFile(`${output}/${name}.json`, JSON.stringify(data, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
  await save("manifest", {
    frozenPath,
    inputHash: createHash("sha256")
      .update(await readFile(frozenPath))
      .digest("hex"),
    sourceHash: createHash("sha256")
      .update(await readFile("src/lib/externalRecommendationsV2/retrieval.ts"))
      .digest("hex"),
    readOnly: true,
    statementTimeoutMs: timeoutMs,
    planOnly,
    stage,
    rowsMode,
  });
  for (const [i, example] of cases.entries()) {
    let sql = buildHybridSql({
      plan: example.input.plan.plan,
      vectors: example.input.plan.titleVectors,
      userId: example.userId,
      blockedCompanies: example.input.context.blockedCompanies,
      limit: 200,
    });
    if (stage !== "all")
      sql =
        sql.slice(0, sql.lastIndexOf("\nSELECT ")) +
        `\nSELECT count(*) FROM ${stage}`;
    await save(`case-${i + 1}-sql`, sql);
    const began = Date.now();
    try {
      const result: any = await new Promise((done, reject) => {
        const child = spawn(
          "python3",
          [
            resolve(
              "../harper_worker/llm_evals/external_recommendations_v2/read_only_capture.py"
            ),
          ],
          { cwd: resolve("../harper_worker"), stdio: ["pipe", "pipe", "pipe"] }
        );
        let output = "",
          error = "";
        child.stdout.on("data", (v) => {
          output += v;
        });
        child.stderr.on("data", (v) => {
          error += v;
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code ? reject(new Error(error)) : done(JSON.parse(output))
        );
        child.stdin.end(
          JSON.stringify({
            kind: "rpc",
            name: "search_external_roles_v2",
            params: { p_sql: sql },
            explain: !rowsMode,
            timeoutMs,
            planOnly,
          })
        );
      });
      await save(`case-${i + 1}-${rowsMode ? "rows" : "explain"}`, result);
      console.log(
        JSON.stringify({
          case: i + 1,
          elapsedMs: Date.now() - began,
          executionMs: rowsMode ? undefined : result[0]["Execution Time"],
          rows: rowsMode ? result.length : result[0].Plan["Actual Rows"],
          countries: rowsMode
            ? Object.fromEntries(
                [...new Set(result.map((r: any) => r.country_code))].map(
                  (code) => [
                    String(code),
                    result.filter((r: any) => r.country_code === code).length,
                  ]
                )
              )
            : undefined,
          nonRemoteUS: rowsMode
            ? result.filter(
                (r: any) => r.country_code === "US" && r.work_mode !== "remote"
              ).length
            : undefined,
        })
      );
    } catch (error) {
      await save(`case-${i + 1}-error`, {
        error: String(error),
        elapsedMs: Date.now() - began,
      });
      console.log(
        JSON.stringify({
          case: i + 1,
          failed: true,
          elapsedMs: Date.now() - began,
        })
      );
      process.exitCode = 1;
    }
  }
  console.log(`Saved ${output}`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
