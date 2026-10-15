/** Synthetic integration of the shipped executor; no LLM task, user data, or employer submission. */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  createApplicationBrowserRuntime,
  type ApplicationBrowserRuntimeRef,
} from "../src/lib/career/simulation/applicationBrowserRuntime";
import {
  agentsRequest,
  ApplicationBrowserApiError,
} from "../src/lib/career/simulation/agentsApi";
import { browserResultStore } from "../src/lib/career/simulation/applicationBrowserResultStore";
import type { ControlledBrowserResult } from "../src/lib/career/simulation/applicationBrowserActions";

config({ path: ".env.local", quiet: true });
const task = "docs/evaluation/agents-hosted-resume-upload";
const demo = process.argv.includes("--public-demo");
const runId =
  new Date().toISOString().replace(/[:.]/g, "-") +
  (demo ? "-runtime-demo" : "-runtime-owned");
const out = `${task}/runs/${runId}`;
mkdirSync(out, { recursive: true, mode: 0o700 });
const save = (name: string, data: unknown) =>
  writeFileSync(`${out}/${name}.json`, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
  });
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const sourcePaths = [
  "src/lib/career/simulation/applicationBrowserRuntime.ts",
  "src/lib/career/simulation/applicationBrowserDriver.ts",
  "src/lib/career/simulation/applicationBrowserHostedWorker.ts",
  "src/lib/career/simulation/applicationBrowserResultStore.ts",
  "src/lib/career/simulation/applicationPlaywright.ts",
  "src/lib/career/simulation/applicationFormInput.ts",
  "scripts/verifyAgentsHostedApplicationRuntime.ts",
];
const sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, hash(readFileSync(path))]));
const resume = readFileSync(`${task}/fixtures/synthetic-resume-v1.pdf`);
const url = demo
  ? "https://www.ashbyhq.com/job-board-embed-examples/application-form-only"
  : "https://127.0.0.1/application";
const filename = "Harper Test Resume.pdf";
const file = {
  documentId: "synthetic-resume",
  path: `/workspace/attachments/synthetic/${hash(resume)}/${filename}`,
};
const operations: { method: string; path: string }[] = [];
let executorEnvironment: string | undefined;
const request: typeof agentsRequest = async (path, body, method, signal) => {
  operations.push({
    method: method ?? (body === undefined ? "GET" : "POST"),
    path,
  });
  if (!demo && path === "sessions" && body) {
    const input = structuredClone(body) as any;
    const environment = input.environment;
    if (environment?.type === "openai_hosted") {
      // The fixture alone uses loopback HTTPS. Production setup is otherwise
      // imported verbatim; there is no runtime fixture flag or employer write.
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
      const fixture = readFileSync(
        `${task}/fixtures/receipt-server-v1.cjs`,
        "utf8"
      )
        .replace(
          "http.createServer(",
          "require('node:https').createServer({key:fs.readFileSync('/workspace/key.pem'),cert:fs.readFileSync('/workspace/cert.pem')},"
        )
        .replace(".listen(8765,", ".listen(443,");
      environment.files.push({
        type: "inline",
        path: "/workspace/fixture.cjs",
        data: Buffer.from(fixture).toString("base64"),
      });
      environment.files.push({
        type: "inline",
        path: "/workspace/start-fixture.py",
        data: Buffer.from(
          "import subprocess\nwith open('/workspace/fixture.log','ab') as log:\n subprocess.Popen(['node','/workspace/fixture.cjs'],start_new_session=True,stdin=subprocess.DEVNULL,stdout=log,stderr=log)\n"
        ).toString("base64"),
      });
      environment.setup_commands.splice(
        environment.setup_commands.length - 1,
        0,
        {
          command:
            "openssl req -x509 -newkey rsa:2048 -nodes -keyout /workspace/key.pem -out /workspace/cert.pem -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 && cp /workspace/cert.pem /usr/local/share/ca-certificates/harper-fixture.crt && update-ca-certificates && python3 /workspace/harper-browser/trust.py && python3 /workspace/start-fixture.py",
          cwd: "/workspace",
        }
      );
      body = input;
    }
  }
  if (method === "DELETE" && executorEnvironment) {
    const files = await agentsRequest(
      `environments/${executorEnvironment}/files?path=/workspace/harper-browser`
    ).catch(() => null);
    save("executor-file-metadata", files);
  }
  const response = await agentsRequest<any>(path, body, method, signal);
  if (path === "sessions" && response.environment?.id)
    executorEnvironment = response.environment.id;
  return response;
};
const runtime = createApplicationBrowserRuntime({ request });
let ref: ApplicationBrowserRuntimeRef | undefined;
let id = 0;
const step = async (action: Parameters<typeof runtime.execute>[1]) => {
  const result = await runtime.execute(
    ref!,
    action,
    [file],
    `synthetic-${++id}`
  );
  save(`step-${id}`, result);
  return result;
};
function element(
  result: ControlledBrowserResult,
  predicate: (element: any) => boolean
): string {
  const found = result.snapshot?.elements.find(predicate) as
    | { ref: string }
    | undefined;
  assert.ok(found, "Observed form element required");
  return found.ref;
}
const started = Date.now();
async function main() {
  let error: string | undefined,
    passed = false,
    cleanup = false;
  try {
    ref = await runtime.create(
      [{ path: file.path, data: resume.toString("base64") }],
      url
    );
    save("resource", ref);
    let result = await step({ action: "navigate", url });
    if (demo) {
      for (
        let passive = 0;
        passive < 3 &&
        !result.snapshot?.elements.some((e: any) => e.type === "file");
        passive++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        result = await step({ action: "inspect" });
      }
      // The official demo lazy-loads its nested iframe below the fold.
      if (!result.snapshot?.elements.some((e: any) => e.type === "file")) {
        const jump = result.snapshot?.elements.find(
          (e: any) => e.href === url + "#example"
        ) as { ref: string } | undefined;
        if (jump) result = await step({ action: "click", ref: jump.ref });
      }
      if (result.pendingRequest) {
        result = await runtime.resolve(
          ref,
          result.pendingRequest,
          result.pendingRequest.method === "GET"
        );
      }
      for (
        let wait = 0;
        wait < 15 &&
        !result.snapshot?.elements.some((e: any) => e.type === "file");
        wait++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        result = await step({ action: "inspect" });
        if (result.pendingRequest)
          result = await runtime.resolve(
            ref,
            result.pendingRequest,
            result.pendingRequest.method === "GET"
          );
      }
    }
    if (!demo) {
      result = await step({
        action: "fill",
        ref: element(result, (e) => e.label === "Name"),
        value: "Harper Test Candidate",
      });
      // Simulate the human answering a question in another request, while the
      // same hosted page must retain the already entered name.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      result = await step({ action: "inspect" });
      assert.ok(
        result.snapshot?.elements.some(
          (e: any) => e.value === "Harper Test Candidate"
        )
      );
      result = await step({
        action: "fill",
        ref: element(result, (e) => e.label === "Email"),
        value: "test-candidate@example.com",
      });
    }
    result = await step({
      action: "attach",
      ref: element(result, (e) => e.type === "file"),
      documentId: file.documentId,
    });
    if (demo) {
      // Some ATS upload bytes immediately. That request is held by the shipped
      // approval guard; this run never authorizes any third-party transmission.
      if (result.pendingRequest)
        result = await runtime.resolve(ref, result.pendingRequest, false);
      assert.ok(
        result.snapshot?.elements.some(
          (e: any) => e.type === "file" && e.value === filename
        )
      );
      save("proof", {
        selectedFilename: filename,
        fileSha256: hash(resume),
        submitted: false,
      });
    } else {
      assert.ok(
        result.snapshot?.elements.some(
          (e: any) => e.type === "file" && e.value === filename
        )
      );
      result = await step({
        action: "click",
        ref: element(result, (e) => e.tag === "button"),
      });
      assert.ok(result.pendingRequest, "Submission must remain held");
      const held = result.pendingRequest;
      const files = await agentsRequest<{ data: unknown[] }>(
        `environments/${ref.environmentId}/files?path=/workspace/outputs`
      );
      assert.equal(
        files.data.length,
        0,
        "No receipt may exist before approval"
      );
      await assert.rejects(
        runtime.resolve(ref, { ...held, id: "forged-scope" }, true),
        /no longer current/
      );
      const approved = await runtime.resolve(ref, held, true);
      save("approved", approved);
      const text = approved.snapshot?.text ?? "";
      const receipt = JSON.parse(text.slice(text.indexOf("{")));
      assert.equal(receipt.count, 1);
      assert.equal(receipt.name, filename);
      assert.equal(receipt.size, resume.length);
      assert.equal(receipt.sha256, hash(resume));
      const duplicate = await runtime.resolve(ref, held, true);
      assert.equal(duplicate.executed, true);
      save("proof", {
        receipt,
        duplicateDidNotResubmit: true,
        heldBeforeApproval: true,
      });
    }
    const turns = await agentsRequest<{ data: unknown[] }>(
      `sessions/${ref.sessionId}/turns`
    );
    assert.equal(
      turns.data.length,
      0,
      "The executor must never run a model turn"
    );
    passed = true;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Verification failed";
  } finally {
    if (ref) {
      try {
        await runtime.stop(ref);
        await assert.rejects(
          agentsRequest(`sessions/${ref.sessionId}`),
          (e) => e instanceof ApplicationBrowserApiError && e.status === 404
        );
        await assert.rejects(
          agentsRequest(`environments/${ref.environmentId}`),
          (e) => e instanceof ApplicationBrowserApiError && e.status === 404
        );
        await browserResultStore.clear(`_application-browser/${ref.name}`);
        cleanup = true;
      } catch {
        error = (error ?? "") + " Resource cleanup could not be verified";
      }
    }
    const manifest = {
      task: "agents-hosted-resume-upload",
      datasetVersion: "runtime-v2",
      runId,
      createdAt: new Date().toISOString(),
      model: null,
      modelTurns: 0,
      sourceHashes,
      resumeSha256: hash(resume),
      case: demo ? "ashby_demo" : "owned_fixture",
      metrics: {
        passed,
        cleanup,
        error,
        elapsedSeconds: (Date.now() - started) / 1000,
      },
      operations,
    };
    save("manifest", manifest);
    console.log(JSON.stringify({ runId, ...manifest.metrics }));
    process.exitCode = passed && cleanup ? 0 : 1;
  }
}
void main();
