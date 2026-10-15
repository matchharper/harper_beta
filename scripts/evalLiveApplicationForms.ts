/** Public JD challenge through the actual read-only product path; no form input. */
import { config } from "dotenv";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
const datasetFlag = process.argv.indexOf("--dataset");
const dataset = datasetFlag >= 0 ? process.argv[datasetFlag + 1] : "live-v3";
if (!["live-v2", "live-v3"].includes(dataset))
  throw new Error("Choose a registered live dataset");
const caseId = process.argv[process.argv.indexOf("--case") + 1];
const cases = JSON.parse(readFileSync(`${task}/cases-${dataset}.json`, "utf8"));
const target = cases.cases.find((c: any) => c.id === caseId);
if (!target) throw new Error("Choose a registered live case");
const gold = JSON.parse(readFileSync(`${task}/gold-${dataset}.json`, "utf8"))[
  caseId
];
const runId =
  new Date().toISOString().replace(/[:.]/g, "-") + `-${dataset}-${caseId}`;
const out = `${task}/runs/${runId}`;
mkdirSync(out, { recursive: true, mode: 0o700 });
const save = (name: string, data: unknown) =>
  writeFileSync(`${out}/${name}.json`, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
const hash = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
save("manifest", {
  runId,
  caseId,
  dataset,
  createdAt: new Date().toISOString(),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
  sourceHashes: Object.fromEntries(
    [
      "applicationFormInspection.ts",
      "applicationForm.ts",
      "ashbyFormInspection.ts",
      "applicationEditsSchema.ts",
      "applicationBrowserRuntime.ts",
      "applicationBrowserDriver.ts",
      "applicationBrowserHostedWorker.ts",
      "applicationBrowserActions.ts",
      "applicationBrowserResultStore.ts",
      "browserAbort.ts",
    ].map((file) => [
      file,
      hash(readFileSync(`src/lib/career/simulation/${file}`)),
    ])
  ),
  runnerHash: hash(readFileSync("scripts/evalLiveApplicationForms.ts")),
  inputHash: hash(readFileSync(`${task}/cases-${dataset}.json`)),
  goldHash: hash(readFileSync(`${task}/gold-${dataset}.json`)),
  promptFingerprint: hash(formInspectionInstructions),
  model: process.env.APPLICATION_FORM_INSPECTION_MODEL || FORM_INSPECTION_MODEL,
  provider: "OpenAI Agents API",
  reasoning: "low",
  timeoutMs: FORM_INSPECTION_TIMEOUT_MS,
  sampling: "provider default",
  candidateData: false,
  fixtureInjection: false,
});
const resources: { sessionId: string; environmentId?: string }[] = [];
const operations: unknown[] = [],
  modelOutputs: unknown[] = [],
  commands: unknown[] = [],
  snapshots: any[] = [];
const request: typeof agentsRequest = async (path, body, method, signal) => {
  const response = await agentsRequest<any>(path, body, method, signal);
  operations.push({ path, method: method ?? (body ? "POST" : "GET") });
  if (path === "sessions" && body)
    resources.push({
      sessionId: response.id,
      environmentId: response.environment?.id,
    });
  if (path.startsWith("sessions/") && (method ?? "GET") === "GET")
    modelOutputs.push({
      path,
      actions: response.required_actions,
      usage: response.usage,
      turns: response.data,
    });
  return response;
};
const core = createApplicationBrowserRuntime({ request });
let executorModelTurns: number | undefined, evidenceError: string | undefined;
const runtime: typeof core = {
  ...core,
  async create(files, url, options) {
    if (files.length || !options?.readOnly)
      throw new Error("Live inspection must be read-only without attachments");
    return core.create(files, url, options);
  },
  async execute(ref, input, files, id, signal) {
    if (
      !ref.readOnly ||
      files.length ||
      !["inspect", "navigate", "click"].includes(input.action)
    )
      throw new Error("Unexpected mutation command");
    commands.push({ input, id });
    const result = await core.execute(ref, input, files, id, signal);
    if (result.snapshot) snapshots.push(result.snapshot);
    save("browser-snapshots", snapshots);
    save("commands", commands);
    return result;
  },
  async stop(ref, signal) {
    try {
      const turns = await request<any>(
        `sessions/${ref.sessionId}/turns?limit=100`,
        undefined,
        "GET",
        signal
      );
      executorModelTurns = Array.isArray(turns.data)
        ? turns.data.length
        : undefined;
    } catch (error) {
      evidenceError =
        error instanceof Error
          ? error.message
          : "Executor evidence unavailable";
    } finally {
      await core.stop(ref, signal);
    }
  },
};
const started = Date.now();
async function main() {
  let result: Awaited<ReturnType<typeof inspectApplicationForm>> | undefined,
    failure: string | undefined;
  const checks: unknown[] = [];
  try {
    result = await inspectApplicationForm(target.url, undefined, {
      request,
      runtime,
    });
    save("result", result);
  } catch (error) {
    failure = error instanceof Error ? error.message : "Inspection failed";
  } finally {
    for (const ref of resources)
      for (const path of [
        `sessions/${ref.sessionId}`,
        ...(ref.environmentId ? [`environments/${ref.environmentId}`] : []),
      ]) {
        let removed = false;
        try {
          await agentsRequest(path);
        } catch (error) {
          removed =
            error instanceof ApplicationBrowserApiError && error.status === 404;
        }
        checks.push({ path, removed });
        if (!removed && path.startsWith("sessions/")) {
          await agentsRequest(`${path}/events`, {
            events: [{ type: "agent.session.input.cancel" }],
          }).catch(() => {});
          for (let i = 0; i < 5; i++) {
            try {
              await agentsRequest(path, undefined, "DELETE");
              break;
            } catch {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        }
      }
    save("operations", operations);
    save("model-outputs", modelOutputs);
    save("cleanup", checks);
  }
  const cleanup404 =
    resources.length === 0 || checks.every((check: any) => check.removed);
  const resultUrl = new URL(result?.url || target.url);
  const reachedForm =
    result?.status !== "unavailable" &&
    resultUrl.hostname === target.expectedHost &&
    resultUrl.pathname === target.expectedPath;
  const source =
    snapshots.at(-1)?.text ??
    result?.fields.map((f) => f.label + "\n" + f.instructions).join("\n") ??
    "";
  const missingSourceTexts = gold.sourceTexts.filter(
    (text: string) => !source.includes(text)
  );
  const returnedSource =
    result?.fields.map((f) => f.label + "\n" + f.instructions).join("\n") ?? "";
  const missingReturnedSourceTexts = gold.sourceTexts.filter(
    (text: string) => !returnedSource.includes(text)
  );
  const completeInventory =
    (result?.fields.length ?? 0) >= gold.minimumReturnedFields;
  const passed =
    reachedForm &&
    completeInventory &&
    !missingSourceTexts.length &&
    !missingReturnedSourceTexts.length &&
    cleanup404 &&
    (resources.length === 0 || executorModelTurns === 0) &&
    !evidenceError;
  const summary = {
    runId,
    caseId,
    passed,
    reachedForm,
    completeInventory,
    returnedFields: result?.fields.length ?? 0,
    observedControls: snapshots
      .at(-1)
      ?.elements.filter((e: any) =>
        ["input", "textarea", "select"].includes(e.tag)
      ).length,
    missingSourceTexts,
    missingReturnedSourceTexts,
    status: result?.status,
    url: result?.url,
    elapsedMs: Date.now() - started,
    executorModelTurns,
    cleanup404,
    failure,
    evidenceError,
  };
  save("summary", summary);
  console.log(JSON.stringify(summary));
  if (!passed) process.exitCode = 1;
}
main().catch(() => {
  console.error("Live form inspection runner failed");
  process.exitCode = 1;
});
