/** Product planner + owned hosted executor. No production application/message rows. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { applicationBrowserAgent } from "../src/lib/career/simulation/applicationBrowserServer";
import { createApplicationBrowserRuntime, type ApplicationBrowserRuntimeRef } from "../src/lib/career/simulation/applicationBrowserRuntime";
import { APPLICATION_BROWSER_ACTION, type ControlledBrowserResult } from "../src/lib/career/simulation/applicationBrowserActions";
import { agentsRequest, ApplicationBrowserApiError, browserEvent, cancelBrowserSession } from "../src/lib/career/simulation/agentsApi";
import { extractLlmTokenUsage, estimateLlmUsageCost } from "../src/lib/llm/usageLogging";
import { ownedApplicationFixtureRequest } from "./lib/agentsHostedApplicationFixture";

const task = "docs/evaluation/agents-hosted-resume-upload";
const fixture = JSON.parse(readFileSync(`${task}/cases-v5.json`, "utf8"));
const gold = JSON.parse(readFileSync(`${task}/gold-v5.json`, "utf8"));
const frozen = JSON.parse(readFileSync(`${task}/manifest-v5.json`, "utf8"));
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
for (const [path, expected] of Object.entries(frozen.fileHashes))
  assert.equal(hash(readFileSync(`${task}/${path}`)), expected, "Frozen input/gold changed");
const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-product-submission-v5";
const out = `${task}/runs/${runId}`;
mkdirSync(out, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) => writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
const agent = applicationBrowserAgent();
const sourcePaths = [
  "src/lib/career/simulation/applicationBrowserServer.ts",
  "src/lib/career/simulation/applicationBrowserActions.ts",
  "src/lib/career/simulation/applicationBrowserRuntime.ts",
  "src/lib/career/simulation/applicationBrowserDriver.ts",
  "src/lib/career/simulation/applicationBrowserHostedWorker.ts",
  "src/lib/career/simulation/applicationFormInput.ts",
  "src/lib/career/simulation/applicationPlaywright.ts",
  "src/lib/career/simulation/applicationBrowserResultStore.ts",
  "scripts/evalApplicationBrowserSubmission.ts",
  "scripts/lib/agentsHostedApplicationFixture.ts",
];
const sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))]));
const runtime = createApplicationBrowserRuntime({ request: ownedApplicationFixtureRequest(`${task}/fixtures/receipt-server-v5.cjs`) });
const bytes = readFileSync(`${task}/${fixture.resume}`);
const file = { documentId: "synthetic-resume", path: `/workspace/attachments/synthetic/${hash(bytes)}/${fixture.filename}` };
const started = Date.now(), signal = AbortSignal.timeout(420_000);
let ref: ApplicationBrowserRuntimeRef | undefined, plannerId: string | undefined;
let lastSession: any, receipt: any, outcome: any;
let submissionApproved = false, cleanup = false, passed = false, workFinished = 0;
let error: string | undefined;
const calls: { elapsedSeconds: number; name: string; arguments: unknown; result: unknown }[] = [];
async function main() {
  try {
    ref = await runtime.create([{ path: file.path, data: bytes.toString("base64") }], fixture.url, { signal });
    save("resource", ref);
    const initial = await runtime.execute(ref, { action: "navigate", url: fixture.url }, [file], "initial", signal);
    assert.ok(initial.snapshot && !initial.pendingRequest);
    const input = [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({
      role: "Synthetic application automation engineer", language: "ko", url: fixture.url,
      purpose: "Complete the owned synthetic application using confirmed details and approved answers.",
      facts: fixture.profile,
      contact: { name: fixture.profile.name, email: fixture.profile.email, phone: fixture.profile.phone, links: [fixture.profile.portfolio] },
      approvedMaterials: fixture.approvedMaterials,
      answers: [{ batchId: "synthetic-confirmed", status: "submitted", purpose: "Confirmed application facts", questions: [
        { question: "Country", response: { decision: "answer", text: "South Korea (KR)" } },
        { question: "Availability", response: { decision: "answer", text: "In two weeks (two_weeks)" } },
        { question: "Synthetic processing consent", response: { decision: "answer", text: "I agree to the required synthetic test processing. It has no legal effect." } },
      ] }],
      finalResumeDocumentId: file.documentId,
      attachments: [{ documentId: file.documentId, name: fixture.filename }], snapshot: initial.snapshot,
    }) }] }];
    save("request", { agent, environment: { type: "none" }, input });
    const created = await agentsRequest<any>("sessions", { agent, environment: { type: "none" }, input }, "POST", signal);
    plannerId = created.id;
    save("planner", created);
    const handled = new Set<string>();
    while (!outcome) {
      lastSession = await agentsRequest<any>(`sessions/${plannerId}`, undefined, "GET", signal);
      let actions = lastSession.required_actions ?? [];
      if (!actions.length) {
        const turns = await agentsRequest<any>(`sessions/${plannerId}/turns?order=desc&limit=20`, undefined, "GET", signal);
        const turn = turns.data?.find((t: any) => !t.subagent_id);
        if (turn && ["completed", "failed", "cancelled"].includes(turn.status)) {
          lastSession = await agentsRequest<any>(`sessions/${plannerId}`, undefined, "GET", signal);
          actions = lastSession.required_actions ?? [];
          assert.ok(actions.length, "Planner ended without a verified outcome");
        }
      }
      for (const action of actions) {
        assert.equal(action.type, "function_call");
        if (handled.has(action.call_id)) continue;
        handled.add(action.call_id);
        const args = typeof action.arguments === "string" ? JSON.parse(action.arguments) : action.arguments;
        let result: unknown;
        if (action.name === APPLICATION_BROWSER_ACTION) {
          assert.ok(!submissionApproved || args.action === "inspect", "No repeated submission or edits after approval");
          let observed: ControlledBrowserResult = await runtime.execute(ref, args, [file], `action:${action.call_id}`, signal);
          if (observed.pendingRequest) {
            const held = observed.pendingRequest;
            assert.equal(submissionApproved, false);
            assert.equal(held.method, "POST");
            assert.equal(held.url, "https://127.0.0.1/submit");
            const outputs: { data: unknown[] } = await agentsRequest(`environments/${ref.environmentId}/files?path=/workspace/outputs`, undefined, "GET", signal);
            assert.equal(outputs.data.length, 0, "Nothing reaches the owned receiver before approval");
            for (const value of [...Object.values(fixture.profile), ...fixture.approvedMaterials.map((m: any) => m.text), "true", fixture.filename])
              assert.ok(held.fields.some(field => field.value === value), "Final review must show every confirmed field/file value");
            save("review", held);
            await assert.rejects(runtime.resolve(ref, { ...held, id: "forged-scope" }, true), /no longer current/);
            // Explicit synthetic user actor approves this exact request. Never
            // authorize a different site, upload, navigation or real employer.
            observed = await runtime.resolve(ref, held, true);
            submissionApproved = true;
            assert.equal(observed.executed, true);
            const text = observed.snapshot?.text ?? "";
            receipt = JSON.parse(text.slice(text.indexOf("{")));
            assert.equal(receipt.count, 1);
            assert.equal(receipt.postAttempts, 1);
            assert.equal(receipt.name, gold.file.name);
            assert.equal(receipt.size, gold.file.size);
            assert.equal(receipt.sha256, gold.file.sha256);
            assert.deepEqual(receipt.fields, gold.fields);
            save("receipt", receipt);
            assert.equal((await runtime.resolve(ref, held, true)).executed, true);
            save("approved", observed);
          }
          result = observed;
        } else if (action.name === "report_application_outcome") {
          assert.equal(submissionApproved, true);
          assert.equal(args.status, "succeeded");
          assert.ok(args.evidence?.trim());
          assert.equal(args.url, "https://127.0.0.1/submit");
          outcome = args;
          result = "Outcome recorded. Stop the browser task now.";
        } else {
          save("unexpected-question", { action, args });
          throw new Error("Planner asked for information already supplied in the frozen context");
        }
        calls.push({ elapsedSeconds: (Date.now() - started) / 1000, name: action.name, arguments: args, result });
        save("calls", calls);
        await browserEvent(plannerId!, { type: "agent.session.input.tool_result", turn_id: action.turn_id, call_id: action.call_id, success: true, output: JSON.stringify(result) });
      }
      if (!outcome) await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const executorTurns = await agentsRequest<any>(`sessions/${ref.sessionId}/turns`, undefined, "GET", signal);
    assert.equal(executorTurns.data.length, 0);
    save("outcome", outcome);
    workFinished = Date.now();
    passed = true;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    if (plannerId) {
      lastSession = await agentsRequest<any>(`sessions/${plannerId}`).catch(() => lastSession);
      save("session", lastSession);
      save("turns", await agentsRequest(`sessions/${plannerId}/turns`).catch(() => null));
      await cancelBrowserSession(plannerId).catch(() => {});
      await agentsRequest(`sessions/${plannerId}`, undefined, "DELETE").catch(() => {});
    }
    try {
      if (ref) await runtime.stop(ref);
      for (const path of [
        ...(plannerId ? [`sessions/${plannerId}`] : []),
        ...(ref ? [`sessions/${ref.sessionId}`, `environments/${ref.environmentId}`] : []),
      ]) await assert.rejects(agentsRequest(path), e => e instanceof ApplicationBrowserApiError && e.status === 404);
      cleanup = true;
    } catch (caught) {
      error = `${error ?? ""} Cleanup: ${caught instanceof Error ? caught.message : String(caught)}`;
    }
    const usage = extractLlmTokenUsage(lastSession ?? {});
    const cost = usage.inputTokens !== null && usage.outputTokens !== null ? estimateLlmUsageCost(agent.model, usage, { useStandardRates: true }) : null;
    const metrics = {
      passed, cleanup, error, workSeconds: workFinished ? (workFinished - started) / 1000 : null,
      elapsedSeconds: (Date.now() - started) / 1000, toolCalls: calls.length,
      batchFieldCounts: calls.filter(c => (c.arguments as any)?.action === "fill_fields").map(c => (c.arguments as any).fields.length),
      partialModelCostUsd: cost?.estimatedCostUsd ?? null,
    };
    save("manifest", {
      task: "agents-hosted-resume-upload", datasetVersion: "product-submission-v5", goldVersion: gold.goldVersion,
      runId, createdAt: new Date().toISOString(), sourceRevision: execFileSync("git", ["rev-parse", "HEAD"]).toString().trim(),
      dirtySourceHashes: sourceHashes, fixtureHashes: frozen.fileHashes, promptFingerprint: hash(JSON.stringify(agent)),
      provider: "https://api.openai.com/v1/agents", model: agent.model, reasoning: agent.reasoning,
      sampling: "provider defaults", timeoutSeconds: 420, executorModelTurns: 0,
      privacy: fixture.authorization, rawArtifacts: out, usage, cost,
      costScope: "Best-effort session aggregate; standard short-context token estimate excludes cache writes and hosted container charges.", metrics,
    });
    console.log(JSON.stringify({ runId, ...metrics }));
    process.exitCode = passed && cleanup ? 0 : 1;
  }
}
void main();
