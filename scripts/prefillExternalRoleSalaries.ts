/** Resumable ten-role Decisions prefill. Private artifacts first; persistence is
 * a separate --persist pass AFTER all production role readers are upgraded. */
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  open,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { getSupabaseAdmin } from "../src/lib/server/candidateAccess";
import { buildSalaryDecisionRequest } from "../src/lib/ops/roleSalaryEstimation";
import { directUsageCost } from "../src/lib/externalRecommendationsV2/usage";
import { mapConcurrent } from "../src/lib/externalRecommendationsV2/contract";
import {
  salaryCompanyBatches,
  productionSalaryRequest,
  estimateSalaryBatch,
  saveSalaryBatch,
  SALARY_ESTIMATION_VERSION,
  type SalaryFillRow,
} from "../src/lib/externalRecommendationsV2/salaryEstimation.server";

const arg = (key: string) =>
  process.argv.find((v) => v.startsWith(`--${key}=`))?.slice(key.length + 3);
async function main() {
  const input = arg("input"),
    directory = arg("run");
  if (!input || !directory)
    throw new Error(
      "Expected --input=<frozen jsonl> --run=<private run directory>"
    );
  const dir = resolve(directory);
  if (!dir.includes("/private/") && !dir.includes("/runs/"))
    throw new Error("Prefill artifacts must be private");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = await open(`${dir}/.lock`, "wx", 0o600);
  await lock.writeFile(String(process.pid));
  try {
    const digest = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    const text = await readFile(input, "utf8");
    const rows = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)) as SalaryFillRow[];
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw new Error("Duplicate captured roles");
    const batchSize = Number(arg("batch-size") ?? 10);
    const batches = salaryCompanyBatches(rows, batchSize);
    const hash = digest(text);
    const write = (name: string, data: unknown) =>
      writeFile(`${dir}/${name}.json`, JSON.stringify(data, null, 2), {
        mode: 0o600,
      });
    const files = await readdir(dir);
    if (files.includes("manifest.json")) {
      const old = JSON.parse(await readFile(`${dir}/manifest.json`, "utf8"));
      if (
        old.inputHash !== hash ||
        old.version !== SALARY_ESTIMATION_VERSION ||
        old.batchSize !== batchSize
      )
        throw new Error("Frozen prefill contract changed; create another run");
    } else
      await write("manifest", {
        inputHash: hash,
        roleCount: rows.length,
        batches: batches.length,
        version: SALARY_ESTIMATION_VERSION,
        createdAt: new Date().toISOString(),
        model: "gpt-6-luna",
        endpoint: "/v1/decisions",
        batchSize,
        publicCompanyRoleOnly: true,
      });
    if (process.argv.includes("--persist")) {
      // This explicit acknowledgement is supplied only after deployment verification.
      if (!process.argv.includes("--readers-upgraded"))
        throw new Error(
          "All production salary readers must hide predictions before persistence"
        );
      const admin = getSupabaseAdmin();
      let saved = 0,
        skipped = 0;
      for (let i = 0; i < batches.length; i++) {
        const name = `batch-${i}`;
        if (!files.includes(`${name}.json`)) {
          skipped += batches[i].length;
          continue;
        }
        const result = JSON.parse(
          await readFile(`${dir}/${name}.json`, "utf8")
        );
        if (result.requestHash !== requestHash(batches[i]))
          throw new Error("Stored salary request changed");
        const written = await saveSalaryBatch(admin, result.values);
        saved += written.length;
        skipped += result.values.length - written.length;
        await write(`persist-${i}`, {
          savedRoleIds: written.map((r) => r.role_id),
          attempted: result.values.length,
          at: new Date().toISOString(),
        });
        if (i % 100 === 0)
          console.log(
            JSON.stringify({
              persisted: saved,
              sourceChangedOrAlreadyFilled: skipped,
            })
          );
      }
      await write("persistence-summary", {
        saved,
        skipped,
        completedAt: new Date().toISOString(),
      });
      return;
    }
    const max = Number(arg("max-cost-usd"));
    if (!Number.isFinite(max) || max <= 0)
      throw new Error("Explicit positive maximum cost required");
    const take = Number(arg("max-batches") ?? batches.length);
    let spent = 0,
      reserved = 0,
      unknownReserve = 0,
      completed = 0,
      estimated = 0,
      invalid = 0;
    const timings: number[] = [];
    const failed: number[] = [];
    for (const file of files.filter((f) => /^batch-\d+\.json$/.test(f))) {
      const result = JSON.parse(await readFile(`${dir}/${file}`, "utf8"));
      if (result.costUsd == null) unknownReserve += result.reserve;
      else spent += result.costUsd;
      completed++;
      estimated += result.values.length;
      invalid += result.invalid.length;
      timings.push(result.durationMs);
    }
    for (const file of files.filter((f) => /^error-\d+-\d+\.json$/.test(f)))
      unknownReserve += JSON.parse(
        await readFile(`${dir}/${file}`, "utf8")
      ).reserve;
    const began = Date.now();
    await mapConcurrent(
      batches.slice(0, take).map((batch, i) => ({ batch, i })),
      4,
      async ({ batch, i }) => {
        if (files.includes(`batch-${i}.json`)) {
          const old = JSON.parse(
            await readFile(`${dir}/batch-${i}.json`, "utf8")
          );
          if (old.requestHash !== requestHash(batch))
            throw new Error("Request changed across resume");
          return;
        }
        const { roles, contract } = productionSalaryRequest(batch);
        const request = buildSalaryDecisionRequest(roles, "mapping", contract);
        const reserve = directUsageCost("openai_decisions", {
          input_tokens:
            (Buffer.byteLength(JSON.stringify(request)) + 8192) * 10,
        }).usd!;
        if (spent + unknownReserve + reserved + reserve > max)
          throw new Error("Prefill budget limit reached before paid call");
        reserved += reserve;
        try {
          const result = await estimateSalaryBatch(batch);
          // A full raw receipt is saved before another request can depend on it.
          await write(`batch-${i}`, {
            ...result,
            requestHash: requestHash(batch),
            reserve,
          });
          if (result.costUsd == null) unknownReserve += reserve;
          else spent += result.costUsd;
          completed++;
          estimated += result.values.length;
          invalid += result.invalid.length;
          timings.push(result.durationMs);
        } catch (error) {
          unknownReserve += reserve;
          failed.push(i);
          // Keep each possibly billed failure receipt; a retry never erases its reserve.
          await write(`error-${i}-${Date.now()}`, {
            reserve,
            error: error instanceof Error ? error.message : String(error),
            requestHash: requestHash(batch),
          });
        } finally {
          reserved -= reserve;
        }
        if (completed % 100 === 0)
          console.log(
            JSON.stringify({
              completed,
              total: batches.length,
              estimated,
              invalid,
              costUsd: spent,
              unknownReserve,
              elapsedSeconds: (Date.now() - began) / 1000,
            })
          );
      }
    );
    timings.sort((a, b) => a - b);
    const summary = {
      roles: rows.length,
      totalBatches: batches.length,
      completed,
      estimated,
      invalid,
      failed,
      costUsd: spent,
      unknownReserve,
      budgetManagedUsd: spent + unknownReserve,
      meanCallMs: timings.reduce((a, b) => a + b, 0) / timings.length,
      p50CallMs: timings[Math.floor(timings.length * 0.5)],
      p95CallMs: timings[Math.floor(timings.length * 0.95)],
      elapsedSeconds: (Date.now() - began) / 1000,
      persisted: false,
    };
    await write("summary", summary);
    console.log(JSON.stringify(summary));
  } finally {
    await lock.close();
    await rm(`${dir}/.lock`);
  }
}
function requestHash(batch: SalaryFillRow[]) {
  const { roles, contract } = productionSalaryRequest(batch);
  return createHash("sha256")
    .update(
      JSON.stringify(buildSalaryDecisionRequest(roles, "mapping", contract))
    )
    .digest("hex");
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
