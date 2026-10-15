/** Frozen synthetic inspection through the shipped Luna + hosted browser path. */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  inspectApplicationForm,
  formInspectionInstructions,
  FORM_INSPECTION_MODEL,
  FORM_INSPECTION_TIMEOUT_MS,
} from "../src/lib/career/simulation/applicationFormInspection";
import { createApplicationBrowserRuntime } from "../src/lib/career/simulation/applicationBrowserRuntime";
import {
  agentsRequest,
  ApplicationBrowserApiError,
} from "../src/lib/career/simulation/agentsApi";

config({ path: ".env.local", quiet: true });
const task = "docs/evaluation/application-form-inspection";
const cases = JSON.parse(readFileSync(`${task}/cases-v1.json`, "utf8"));
const datasetFlag = process.argv.indexOf("--dataset");
const dataset =
  datasetFlag >= 0 ? process.argv[datasetFlag + 1] : "inventory-v2";
if (!["v1", "inventory-v2"].includes(dataset))
  throw new Error("Choose a registered synthetic dataset");
const gold = JSON.parse(readFileSync(`${task}/gold-${dataset}.json`, "utf8"));
const caseFlag = process.argv.indexOf("--case");
const caseId = caseFlag >= 0 ? process.argv[caseFlag + 1] : "plain";
const fixtureCase = cases.cases.find((c: { id: string }) => c.id === caseId);
assert.ok(fixtureCase, "Choose a frozen case: plain, iframe or login");
const expected = gold[caseId];
const runId = new Date().toISOString().replace(/[:.]/g, "-") + `-${caseId}`;
const out = `${task}/runs/${runId}`;
mkdirSync(out, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) =>
  writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const sourcePaths = [
  "src/lib/career/simulation/applicationFormInspection.ts",
  "src/lib/career/simulation/applicationForm.ts",
  "src/lib/career/simulation/ashbyFormInspection.ts",
  "src/lib/career/simulation/applicationEditsSchema.ts",
  "src/lib/career/simulation/applicationBrowserRuntime.ts",
  "src/lib/career/simulation/applicationBrowserDriver.ts",
  "src/lib/career/simulation/applicationBrowserHostedWorker.ts",
  "src/lib/career/simulation/applicationBrowserActions.ts",
  "src/lib/career/simulation/applicationBrowserRuntimeRef.ts",
  "src/lib/career/simulation/applicationBrowserResultStore.ts",
  "src/lib/career/simulation/applicationPlaywright.ts",
  "src/lib/career/simulation/browserAbort.ts",
  "scripts/evalApplicationFormInspection.ts",
  `${task}/cases-v1.json`,
  `${task}/gold-${dataset}.json`,
  `${task}/fixtures/server-v1.cjs`,
];
save("manifest", {
  runId,
  caseId,
  dataset,
  revision: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
  sourceHashes: Object.fromEntries(
    sourcePaths.map((path) => [path, hash(readFileSync(path))])
  ),
  promptHash: hash(formInspectionInstructions),
  model: process.env.APPLICATION_FORM_INSPECTION_MODEL || FORM_INSPECTION_MODEL,
  reasoning: "low",
  timeoutMs: FORM_INSPECTION_TIMEOUT_MS,
  fixtureOnlyLoopback: true,
  candidateData: false,
});
const resources: { sessionId: string; environmentId?: string }[] = [];
const operations: { path: string; method: string }[] = [];
const observations: unknown[] = [];
const request: typeof agentsRequest = async (path, body, method, signal) => {
  operations.push({ path, method: method ?? (body ? "POST" : "GET") });
  if (path === "sessions" && body) {
    const input = structuredClone(body) as any;
    const environment = input.environment;
    if (environment?.type === "openai_hosted") {
      // Test-only loopback fixture; all other product guards are preserved.
      const start = environment.files.find((file: any) =>
        file.path.endsWith("/start.py")
      );
      start.data = Buffer.from(
        Buffer.from(start.data, "base64")
          .toString()
          .replace(
            "HARPER_BROWSER_PUBLIC_NETWORK='1'",
            "HARPER_BROWSER_PUBLIC_NETWORK='0'"
          )
      ).toString("base64");
      const inline = (path: string, text: string) => ({
        type: "inline",
        path,
        data: Buffer.from(text).toString("base64"),
      });
      environment.files.push(
        inline(
          "/workspace/fixture.cjs",
          readFileSync(`${task}/fixtures/server-v1.cjs`, "utf8")
        ),
        inline(
          "/workspace/start-fixture.py",
          "import subprocess\nwith open('/workspace/fixture.log','ab') as log:\n subprocess.Popen(['node','/workspace/fixture.cjs'],start_new_session=True,stdin=subprocess.DEVNULL,stdout=log,stderr=log)\n"
        )
      );
      environment.setup_commands.splice(
        environment.setup_commands.length - 1,
        0,
        {
          command:
            "openssl req -x509 -newkey rsa:2048 -nodes -keyout /workspace/key.pem -out /workspace/cert.pem -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 && cp /workspace/cert.pem /usr/local/share/ca-certificates/harper-fixture.crt && update-ca-certificates && python3 /workspace/harper-browser/trust.py && python3 /workspace/start-fixture.py",
          cwd: "/workspace",
        }
      );
    }
    body = input;
  }
  const response = await agentsRequest<any>(path, body, method, signal);
  if (path === "sessions" && body)
    resources.push({
      sessionId: response.id,
      environmentId: response.environment?.id,
    });
  if (path.startsWith("sessions/") && (method ?? "GET") === "GET")
    observations.push({
      path,
      required_actions: response.required_actions,
      usage: response.usage,
      turns: response.data,
    });
  return response;
};
const core = createApplicationBrowserRuntime({ request });
let executorModelTurns: number | undefined;
let writeEvidenceCount: number | undefined;
let inspectionEvidenceError: string | undefined;
const runtime: typeof core = {
  ...core,
  async stop(ref, signal) {
    try {
      const evidence = await request<any>(
        `environments/${ref.environmentId}/files?path=/workspace/fixture-evidence`,
        undefined,
        "GET",
        signal
      );
      const turns = await request<any>(
        `sessions/${ref.sessionId}/turns?limit=100`,
        undefined,
        "GET",
        signal
      );
      assert.ok(
        Array.isArray(evidence.data),
        "Fixture evidence directory must be readable"
      );
      assert.ok(Array.isArray(turns.data), "Executor turns must be readable");
      writeEvidenceCount = evidence.data.length;
      executorModelTurns = turns.data.length;
      save("executor-evidence", { evidence, turns });
    } catch (error) {
      inspectionEvidenceError =
        error instanceof Error ? error.message : "Evidence read failed";
    } finally {
      await core.stop(ref, signal);
    }
  },
};
const started = Date.now();
let passed = false;
let failure: string | undefined;
let cleanup404 = false;
async function main() {
  try {
    const result = await inspectApplicationForm(
      `https://127.0.0.1${fixtureCase.path}`,
      undefined,
      { request, runtime }
    );
    save("result", result);
    const allowedStatus = expected.allowedStatus ?? [expected.status];
    assert.ok(
      allowedStatus.includes(result.status),
      `Expected ${allowedStatus.join("/")}, got ${result.status}`
    );
    const actualFields = result.fields
      .map(({ label, required, maxLength, fileTypes }) => ({
        label,
        required,
        maxLength,
        fileTypes,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const expectedFields = [...expected.fields].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    assert.deepEqual(actualFields, expectedFields);
    assert.ok(result.url.startsWith("https://127.0.0.1/"));
    if (expected.limitationsRequired) assert.ok(result.limitations.length > 0);
    assert.equal(inspectionEvidenceError, undefined);
    assert.equal(executorModelTurns, gold.all.executorModelTurns);
    assert.equal(writeEvidenceCount, gold.all.writeEvidenceCount);
    passed = true;
  } catch (error) {
    failure = error instanceof Error ? error.message : "Evaluation failed";
  } finally {
    // Verify the product cleanup; failed verification is not hidden by repairs.
    const checks = [];
    for (const resource of resources) {
      for (const path of [
        `sessions/${resource.sessionId}`,
        ...(resource.environmentId
          ? [`environments/${resource.environmentId}`]
          : []),
      ]) {
        try {
          await agentsRequest(path);
          checks.push({ path, removed: false });
        } catch (error) {
          checks.push({
            path,
            removed:
              error instanceof ApplicationBrowserApiError &&
              error.status === 404,
          });
        }
      }
    }
    cleanup404 = checks.length > 0 && checks.every((check) => check.removed);
    save("cleanup", checks);
    // A failed model run must still leave no test-owned compute or objects.
    if (!cleanup404) {
      for (const resource of resources) {
        await agentsRequest(`sessions/${resource.sessionId}/events`, {
          events: [{ type: "agent.session.input.cancel" }],
        }).catch(() => {});
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await agentsRequest(
              `sessions/${resource.sessionId}`,
              undefined,
              "DELETE"
            );
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }
    }
    save("operations", operations);
    save("model-observations", observations);
    save("summary", {
      passed: passed && cleanup404,
      failure,
      caseId,
      elapsedMs: Date.now() - started,
      executorModelTurns,
      writeEvidenceCount,
      cleanup404,
    });
    console.log(
      JSON.stringify({
        runId,
        passed: passed && cleanup404,
        failure,
        elapsedMs: Date.now() - started,
        executorModelTurns,
        writeEvidenceCount,
        cleanup404,
      })
    );
    if (!passed || !cleanup404) process.exitCode = 1;
  }
}
main().catch(() => {
  console.error("Synthetic inspection runner failed");
  process.exitCode = 1;
});
