/** Frozen-input salary probe using the exact Ops builder, prompts, and decoder. */
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  buildSalaryModelRole,
  type SalaryRoleRow,
} from "../src/lib/ops/roleSalaryEstimationServer";
import {
  buildSalaryDecisionRequest,
  decodeSalaryEstimate,
} from "../src/lib/ops/roleSalaryEstimation";
import { directUsageCost } from "../src/lib/externalRecommendationsV2/usage";

const registry = resolve("docs/evaluation/company-role-salary-estimation");
const version = "v7-search50";
const fixturePath = resolve(registry, `private/fixture-${version}.json`);
const ledgerPath = resolve(registry, "runs/decisions-budget-20261015.json");
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
async function save(path: string, value: unknown) {
  await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await chmod(path, 0o600);
}
async function prepare() {
  try {
    await readFile(fixturePath);
    throw new Error("Frozen fixture already exists");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const capture = JSON.parse(
    await readFile(resolve(registry, `private/capture-${version}.json`), "utf8")
  );
  const cases = capture.rows.map((row: SalaryRoleRow, i: number) => ({
    caseId: `${row.country}${String((i % 25) + 1).padStart(2, "0")}`,
    row,
    request: buildSalaryDecisionRequest(
      [buildSalaryModelRole(row)],
      "market_reasoning"
    ),
  }));
  const fixture = {
    datasetVersion: version,
    createdAt: new Date().toISOString(),
    cases,
  };
  await save(fixturePath, fixture);
  const manifestPath = resolve(registry, `manifest-${version}.json`);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  Object.assign(manifest, {
    fixtureHash: hash(await readFile(fixturePath)),
    promptFingerprint: hash(
      await readFile("src/lib/ops/roleSalaryEstimation.prompts.json")
    ),
    builderFingerprint: hash(
      await readFile("src/lib/ops/roleSalaryEstimationServer.ts")
    ),
    runner: "scripts/evalRoleSalarySearch50.ts",
    model: cases[0].request.model,
    provider: "openai_decisions",
    endpoint: "https://api.openai.com/v1/decisions",
    method: "market_reasoning",
    batchSize: 1,
    calls: 50,
    timeoutMs: 40000,
    retries: 0,
  });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    JSON.stringify({
      prepared: cases.length,
      fixtureHash: manifest.fixtureHash,
    })
  );
}
async function run() {
  const methodArg = process.argv[process.argv.indexOf("--method") + 1];
  const method = process.argv.includes("--method")
    ? methodArg
    : "market_reasoning";
  if (!["market_reasoning", "baseline", "mapping"].includes(method))
    throw new Error("Invalid method");
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const bytes = await readFile(fixturePath);
  const fixture = JSON.parse(bytes.toString());
  const runId =
    new Date().toISOString().replace(/[:.]/g, "-") + `-search50-${method}`;
  const out = resolve(registry, "runs", runId);
  await mkdir(out, { mode: 0o700 });
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  // The earlier Ops verification was outside the old Worker ledger: include it once.
  if (!ledger.calls.some((c: { id: string }) => c.id === "ops-ui-20261015")) {
    const proof = JSON.parse(
      await readFile(
        resolve(registry, "runs/ops-ui-20261015/ui-verification.json"),
        "utf8"
      )
    );
    const cost = proof.costUsd ?? proof.costUSD ?? 0.0005005;
    ledger.calls.push({
      id: "ops-ui-20261015",
      costUSD: cost,
      reservedUSD: cost,
      note: "Prior UI verification",
    });
    await save(ledgerPath, ledger);
  }
  const calls: unknown[] = [];
  await save(resolve(out, "manifest.json"), {
    task: "company-role-salary-estimation",
    datasetVersion: version,
    runId,
    createdAt: new Date().toISOString(),
    fixtureHash: hash(bytes),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: true,
    promptFingerprint: hash(
      await readFile("src/lib/ops/roleSalaryEstimation.prompts.json")
    ),
    runnerFingerprint: hash(
      await readFile("scripts/evalRoleSalarySearch50.ts")
    ),
    model: fixture.cases[0].request.model,
    provider: "openai_decisions",
    reasoning: "endpoint default",
    method,
    batchSize: 1,
    timeoutMs: 40000,
    retries: 0,
    budgetUSD: 1,
    rawArtifacts: out,
    timingBoundary:
      "provider fetch + response JSON; excludes DB capture and web research",
  });
  for (const item of fixture.cases) {
    const projected = buildSalaryModelRole(item.row);
    const frozen = buildSalaryDecisionRequest([projected], "market_reasoning");
    if (JSON.stringify(frozen) !== JSON.stringify(item.request))
      throw new Error("Frozen prompt/input drift");
    const request = buildSalaryDecisionRequest(
      [projected],
      method as "market_reasoning" | "baseline" | "mapping"
    );
    const body = JSON.stringify(request);
    const reserve = directUsageCost("openai_decisions", {
      input_tokens: (Buffer.byteLength(body) + 8192) * 10,
    }).usd;
    const spent = ledger.calls.reduce(
      (sum: number, c: { costUSD?: number; reservedUSD: number }) =>
        sum + (c.costUSD ?? c.reservedUSD),
      0
    );
    if (reserve === null || spent + reserve > 1)
      throw new Error("USD 1 budget would be exceeded");
    const entry = { id: `${runId}-${item.caseId}`, reservedUSD: reserve } as {
      id: string;
      reservedUSD: number;
      costUSD?: number;
      inputTokens?: number;
    };
    ledger.calls.push(entry);
    await save(ledgerPath, ledger);
    const began = performance.now();
    const response = await fetch("https://api.openai.com/v1/decisions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(40000),
    });
    if (!response.ok) {
      await save(resolve(out, `${item.caseId}-failure.json`), {
        status: response.status,
        durationMs: performance.now() - began,
      });
      throw new Error(
        `No automatic retries: ${item.caseId} HTTP ${response.status}`
      );
    }
    const raw = await response.json();
    const durationMs = performance.now() - began;
    const costUsd = directUsageCost("openai_decisions", raw.usage).usd;
    await save(resolve(out, `${item.caseId}-raw.json`), raw);
    if (costUsd === null)
      throw new Error("Missing actual usage: budget reserve retained");
    Object.assign(entry, {
      costUSD: costUsd,
      inputTokens: raw.usage.input_tokens,
    });
    await save(ledgerPath, ledger);
    const estimate = decodeSalaryEstimate(
      raw,
      0,
      item.row.country === "KR" ? "KRW" : "USD"
    );
    const result = {
      caseId: item.caseId,
      roleId: item.row.id,
      company: item.row.company,
      title: item.row.title,
      country: item.row.country,
      location: item.row.location,
      estimate,
      durationMs,
      costUsd,
      inputTokens: raw.usage.input_tokens,
      requestHash: hash(body),
    };
    calls.push(result);
    await save(resolve(out, "results.json"), {
      datasetVersion: version,
      runId,
      calls,
    });
    console.log(
      JSON.stringify({
        caseId: item.caseId,
        estimate,
        durationMs: Math.round(durationMs),
        costUsd,
      })
    );
  }
  const managedSpend = ledger.calls.reduce(
    (sum: number, c: { costUSD?: number; reservedUSD: number }) =>
      sum + (c.costUSD ?? c.reservedUSD),
    0
  );
  console.log(
    JSON.stringify({ completed: calls.length, runDirectory: out, managedSpend })
  );
}
async function main() {
  if (process.argv.includes("--prepare")) await prepare();
  else if (process.argv.includes("--run")) await run();
  else
    throw new Error(
      "Use --prepare or --run; capture with Worker search50_capture.py first"
    );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
