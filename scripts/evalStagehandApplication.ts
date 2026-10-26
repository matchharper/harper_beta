/** Owned synthetic fixture only. Never accepts a third-party destination. */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { applicationStagehandRuntime as runtime } from "../src/lib/career/simulation/applicationStagehandRuntime";
import { applicationStagehandInstructions } from "../src/lib/career/simulation/applicationBrowserServer";
import {
  stagehandInspectionInstructions,
  observedApplicationForm,
} from "../src/lib/career/simulation/applicationFormInspection";
import {
  sign,
  verify,
  candidate,
  documents,
} from "./experiments/application-browser-lab/lib/fixture.js";
const sha = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const mode = process.argv[2] || "submit";
  assert(["inspect", "submit"].includes(mode));
  const browserProvider = process.argv[3] || "browserbase";
  assert(
    browserProvider === "browserbase" || browserProvider === "browser-use"
  );
  const runId = `product-stagehand-${browserProvider}-${mode}-${randomUUID()}`,
    started = Date.now();
  const output = path.join(
    process.cwd(),
    "docs/evaluation/application-browser-server/runs",
    runId
  );
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  const write = (name: string, value: unknown) =>
    fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2), {
      mode: 0o600,
    });
  const sourceFiles = [
    "applicationStagehandRuntime.ts",
    "applicationBrowserServer.ts",
    "applicationFormInspection.ts",
    "applicationStagehand/worker.mjs",
    "applicationStagehand/gate.mjs",
    "applicationStagehand/form.mjs",
    "applicationStagehand/files.mjs",
    "applicationStagehand/browserUseCloud.mjs",
    "applicationStagehand/network.cjs",
    "applicationBrowserRuntimeRef.ts",
    "applicationStagehand/package-lock.json",
  ];
  await write("manifest.json", {
    runId,
    mode,
    startedAt: new Date(started).toISOString(),
    dataset: "synthetic-v1",
    gold: "gold-v1.json",
    model: "gpt-6-luna",
    reasoning: "medium",
    maxSteps: 100,
    browser: browserProvider,
    executor: "Existing hosted server worker; local trusted test caller",
    productionDeployed: false,
    proxy: false,
    runnerHash: sha(
      await fs.readFile(
        path.join(process.cwd(), "scripts/evalStagehandApplication.ts")
      )
    ),
    sourceHashes: Object.fromEntries(
      await Promise.all(
        sourceFiles.map(async (f) => [
          f,
          sha(
            await fs.readFile(
              path.join(process.cwd(), "src/lib/career/simulation", f)
            )
          ),
        ])
      )
    ),
  });
  const url =
    "https://harper-apply-browser-lab-20261022.vercel.app/?run=" +
    encodeURIComponent(
      sign({ type: "run", runId, expires: Date.now() + 30 * 60_000 })
    );
  let ref: Awaited<ReturnType<typeof runtime.create>> | undefined,
    final: any,
    approvals = 0,
    waited = false,
    readySeconds = 0,
    phase = "provision";
  try {
    const files =
      mode === "inspect"
        ? []
        : Object.entries(documents).map(([id, d]) => ({
            documentId: id,
            path: `/workspace/attachments/${id}/${sha(d.buffer)}/${d.name}`,
            name: d.name,
            mimeType: d.mimeType,
            contentHash: sha(d.buffer),
            data: d.buffer.toString("base64"),
          }));
    ref = await runtime.create(files, url, {
      readOnly: mode === "inspect",
      browserProvider,
    });
    readySeconds = (Date.now() - started) / 1000;
    await write("resource.json", ref);
    console.log(
      JSON.stringify({
        event: "worker_ready",
        mode,
        seconds: (Date.now() - started) / 1000,
      })
    );
    const instruction =
      mode === "inspect"
        ? stagehandInspectionInstructions
        : applicationStagehandInstructions +
          "\nApplication data:\n" +
          JSON.stringify({
            role: "Synthetic Software Engineer",
            language: "en",
            url,
            purpose:
              "Submit the synthetic test application to this owned site only.",
            facts: candidate,
            contact: {
              name: candidate.name,
              email: candidate.email,
              phone: candidate.phone,
            },
            approvedMaterials: [
              { field: "Why are you interested?", text: candidate.answer },
            ],
            answers: [],
            finalResumeDocumentId: "resume",
            attachments: files.map((f) => ({
              documentId: f.documentId,
              name: f.name,
            })),
            syntheticConsentConfirmed: true,
          });
    phase = "start";
    await runtime.start(ref, instruction);
    let last = "";
    while (Date.now() - started < 25 * 60_000) {
      phase = "status";
      const state = await runtime.status(ref);
      await write("latest.json", state);
      const label = `${state.status}:${state.steps}:${state.required_actions.map((a) => a.name).join(",")}`;
      if (label !== last) {
        console.log(
          JSON.stringify({
            event: "progress",
            mode,
            status: state.status,
            steps: state.steps,
            action: state.required_actions[0]?.name,
            seconds: Math.round((Date.now() - started) / 1000),
          })
        );
        last = label;
      }
      if (state.report && state.snapshot) {
        final = observedApplicationForm(
          state.snapshot,
          state.report,
          new Date().toISOString()
        );
        assert(final.fields.length >= 5);
        assert.equal(final.submission?.status, "supported");
        break;
      }
      if (state.pendingRequest) {
        const request = state.pendingRequest;
        assert.equal(
          new URL(request.url).origin,
          new URL(url).origin,
          "Never approve another origin"
        );
        if (!waited) {
          await sleep(10000);
          phase = "approval-reconnect";
          const resumed = await runtime.status(JSON.parse(JSON.stringify(ref)));
          assert.equal(resumed.pendingRequest?.id, request.id);
          assert.equal(resumed.pendingRequest?.bodyHash, request.bodyHash);
          waited = true;
        }
        await write(`approval-${approvals + 1}.json`, request);
        phase = "approval-resolve";
        assert.equal(
          (await runtime.resolve(ref, request, true)).executed,
          true
        );
        phase = "approval-duplicate";
        assert.equal(
          (await runtime.resolve(ref, request, true)).executed,
          true,
          "Delivery retry must return same receipt"
        );
        approvals++;
      } else
        for (const action of state.required_actions) {
          if (action.name === "request_application_information")
            await runtime.respond(ref, action.call_id!, {
              confirmedFacts: candidate,
              approvedMaterials: [
                { field: "Why are you interested?", text: candidate.answer },
              ],
              syntheticConsentConfirmed: true,
            });
          else if (action.name === "report_application_outcome") {
            assert.equal(
              action.arguments?.status,
              "succeeded",
              "Application did not report success; inspect the preserved outcome evidence"
            );
            const matches = [
              ...(state.snapshot?.text || "").matchAll(
                /"signature":\s*"([^"]+)"/g
              ),
            ];
            assert(
              matches.length,
              "A model success claim alone is not a receipt"
            );
            const receipt = verify(matches.at(-1)![1]);
            assert.equal(receipt.type, "submission");
            assert.equal(receipt.runId, runId);
            for (const [key, value] of Object.entries(candidate))
              assert.equal(receipt.fields[key], value);
            for (const [k, d] of Object.entries(documents)) {
              assert.equal(receipt.files[k].sha256, sha(d.buffer));
              assert.equal(receipt.files[k].name, d.name);
            }
            assert.equal(receipt.fields.consent, true);
            assert(!receipt.fields.newsletter);
            assert.equal(action.arguments?.status, "succeeded");
            final = { outcome: action.arguments, receipt };
            break;
          }
        }
      if (final) break;
      if (["error", "completed"].includes(state.status))
        throw Error(state.error || "No verified outcome");
      await sleep(1500);
    }
    assert(final, "Run deadline reached without verified receipt");
    await write("result.json", {
      ok: true,
      mode,
      seconds: (Date.now() - started) / 1000,
      approvals,
      readySeconds,
      final,
    });
    console.log(
      JSON.stringify({
        event: "passed",
        mode,
        seconds: (Date.now() - started) / 1000,
        approvals,
        output,
      })
    );
  } catch (error) {
    await write("result.json", {
      ok: false,
      mode,
      seconds: (Date.now() - started) / 1000,
      approvals,
      error: String(error),
      phase,
      cause: error instanceof Error ? String(error.cause ?? "") : undefined,
    });
    throw error;
  } finally {
    if (ref) {
      await runtime.stop(ref);
      await write("stopped.json", { at: new Date().toISOString() });
      if (browserProvider === "browser-use" && ref.browserSessionId) {
        const response = await fetch(
          `https://api.browser-use.com/api/v4/browsers/${encodeURIComponent(ref.browserSessionId)}`,
          {
            headers: {
              "X-Browser-Use-API-Key": process.env.BROWSER_USE_API_KEY!,
            },
            signal: AbortSignal.timeout(15000),
          }
        );
        assert(response.ok, "Browser Use cleanup status could not be verified");
        const session = await response.json();
        await write("browser-usage.json", {
          id: session.id,
          status: session.status,
          startedAt: session.startedAt,
          finishedAt: session.finishedAt,
          browserCost: session.browserCost,
          proxyCost: session.proxyCost,
          proxyUsedMb: session.proxyUsedMb,
        });
        assert.equal(
          session.status,
          "stopped",
          "Cloud browser must be stopped after the test"
        );
      }
    }
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
