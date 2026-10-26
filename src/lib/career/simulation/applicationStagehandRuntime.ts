import { readFile } from "node:fs/promises";
import path from "node:path";
import { hostedBrowserStart } from "./applicationBrowserHostedWorker";
import { randomUUID } from "node:crypto";
import { provisionFiles } from "./applicationStagehand/files.mjs";
import { stopBrowserUseSession } from "./applicationStagehand/browserUseCloud.mjs";
import type { ApplicationBrowserRuntimeRef } from "./applicationBrowserRuntimeRef";
import type {
  BrowserPendingRequest,
  ControlledBrowserResult,
} from "./applicationBrowserActions";

export const APPLICATION_STAGEHAND_MODEL = "gpt-6-luna";
export const APPLICATION_STAGEHAND_MAX_STEPS = 100;
const directory = "/workspace/harper-browser";
export type StagehandFile = {
  path: string;
  data: string;
  documentId?: string;
  name?: string;
  contentHash?: string;
  mimeType?: string;
};
export type StagehandStatus = {
  status: string;
  sessionId: string;
  steps: number;
  maxSteps: number;
  required_actions: {
    type: string;
    name?: string;
    call_id?: string;
    turn_id?: string;
    arguments?: Record<string, unknown>;
  }[];
  pendingRequest?: BrowserPendingRequest;
  snapshot?: ControlledBrowserResult["snapshot"];
  report?: unknown;
  error?: string;
  usage?: { id?: string; model?: string; usage?: unknown }[];
  progress?: { id: string; text: string; at: string }[];
  timings?: {
    snapshots: { ms: number; detailed: boolean; frames: number }[];
    model: { ms: number; status: number }[];
    tools: { step: number; names: string[] }[];
  };
  startup?: { installMs?: number; browserMs?: number };
};
async function transport() {
  return (
    await import("./applicationBrowserRuntime")
  ).createApplicationBrowserRuntime();
}
function hosted(ref: ApplicationBrowserRuntimeRef) {
  return { ...ref, provider: "openai" as const };
}
async function command<T>(
  ref: ApplicationBrowserRuntimeRef,
  input: Record<string, unknown>
): Promise<T> {
  return (await (await transport()).command(hosted(ref), input)) as T;
}
function files(input: StagehandFile[]) {
  return input.map((f) => ({
    ...f,
    documentId: f.documentId ?? f.path.split("/").at(-3),
    name: f.name ?? path.basename(f.path),
  }));
}
export async function applicationBrowserbaseProject() {
  if (process.env.BROWSERBASE_PROJECT_ID)
    return process.env.BROWSERBASE_PROJECT_ID;
  const response = await fetch("https://api.browserbase.com/v1/projects", {
    headers: { "x-bb-api-key": process.env.BROWSERBASE_API_KEY! },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Browserbase projects could not be read");
  const projects = (await response.json()) as { id: string }[];
  if (projects.length !== 1 || !projects[0]?.id)
    throw new Error(
      "Set BROWSERBASE_PROJECT_ID to choose the application browser project"
    );
  return projects[0].id;
}
async function releaseSession(sessionId: string) {
  const response = await fetch(
    `https://api.browserbase.com/v1/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: {
        "x-bb-api-key": process.env.BROWSERBASE_API_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "REQUEST_RELEASE",
        projectId: await applicationBrowserbaseProject(),
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!response.ok && response.status !== 404)
    throw new Error(`Browser cleanup failed (${response.status})`);
}
export const applicationStagehandRuntime = {
  async create(
    input: StagehandFile[],
    url: string,
    options: {
      readOnly?: boolean;
      signal?: AbortSignal;
      browserProvider?: "browserbase" | "browser-use";
      /** Evaluation-only: restrict all writes and collect pre-submit evidence. */
      preSubmitTest?: { candidate: Record<string, unknown> };
    } = {}
  ): Promise<ApplicationBrowserRuntimeRef> {
    const attachments = provisionFiles(input, options.readOnly);
    const browserProvider = options.browserProvider ?? "browserbase";
    for (const key of [
      browserProvider === "browser-use"
        ? "BROWSER_USE_API_KEY"
        : "BROWSERBASE_API_KEY",
      "OPENAI_API_KEY",
    ])
      if (!process.env[key])
        throw new Error(`${key} is required for application browsing`);
    options.signal?.throwIfAborted();
    const source = path.join(
      process.cwd(),
      "src/lib/career/simulation/applicationStagehand"
    );
    const inline = (name: string, content: string | Buffer) => ({
      type: "inline",
      path: `${directory}/${name}`,
      data: Buffer.from(content).toString("base64"),
    });
    const workerFiles = await Promise.all(
      [
        "worker.mjs",
        "form.mjs",
        "gate.mjs",
        "browserUseCloud.mjs",
        "network.cjs",
        "package.json",
        "package-lock.json",
      ].map(async (name) =>
        inline(name, await readFile(path.join(source, name)))
      )
    );
    if (options.preSubmitTest) {
      if (options.readOnly) throw new Error("Pre-submit evaluation uses its own stricter write guard");
      for (const name of ["preSubmitTest.mjs", "preflight-guard.js"])
        workerFiles.push(inline(name, await readFile(path.join(process.cwd(), "scripts/experiments/application-browser-lab/lib", name))));
    }
    workerFiles.push(
      inline(
        "config.json",
        JSON.stringify({
          url,
          readOnly: options.readOnly,
          browserProvider,
          preSubmitTest: options.preSubmitTest,
          files: attachments.metadata,
        })
      )
    );
    workerFiles.push(...attachments.inline);
    workerFiles.push(
      inline(
        "secrets.json",
        JSON.stringify({
          ...(browserProvider === "browser-use"
            ? {
                BROWSER_USE_API_KEY: process.env.BROWSER_USE_API_KEY,
              }
            : {
                BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
                BROWSERBASE_PROJECT_ID: await applicationBrowserbaseProject(),
              }),
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        })
      )
    );
    workerFiles.push(
      inline(
        "server.cjs",
        `const fs=require('node:fs');require('./network.cjs');Object.assign(process.env,JSON.parse(fs.readFileSync('${directory}/secrets.json','utf8')));fs.unlinkSync('${directory}/secrets.json');import('./worker.mjs').then(({startWorker})=>{const config=JSON.parse(fs.readFileSync('${directory}/config.json','utf8'));fs.unlinkSync('${directory}/config.json');return startWorker(config,'${directory}');}).catch(e=>{console.error(e.name,e.code||'',e.message||'Browser worker failed',e.cause?.code||'');process.exitCode=1;});`
      )
    );
    const { createApplicationBrowserRuntime } =
      await import("./applicationBrowserRuntime");
    const executor = createApplicationBrowserRuntime({
      worker: {
        files: workerFiles,
        startScript: hostedBrowserStart
          .replace("for attempt in range(300):", "for attempt in range(900):")
          .replace(
            "raise RuntimeError('Controlled browser did not start')",
            "(directory / 'startup-error').write_text((directory / 'browser.log').read_text()[-4000:]+(directory / 'install.log').read_text()[-2000:]); break"
          )
          .replace(
            "raise RuntimeError('Controlled browser startup timed out')",
            "(directory / 'startup-error').write_text('Browser worker startup timed out')"
          ),
        setupCommands: [
          {
            command: `node -e 'require("node:fs").writeFileSync("${directory}/install-start",String(Date.now()))' && npm ci --prefix ${directory} --ignore-scripts --omit=dev --no-audit --no-fund >${directory}/install.log 2>&1; node -e 'const fs=require("node:fs");fs.writeFileSync("${directory}/install-ms",String(Date.now()-Number(fs.readFileSync("${directory}/install-start","utf8"))))'`,
            cwd: "/workspace",
          },
          {
            command: `mkdir -p ${directory}/commands ${directory}/chunks /workspace/attachments && NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt python3 ${directory}/start.py`,
            cwd: "/workspace",
          },
        ],
      },
    });
    // Reuse the application's existing server compute and encrypted result channel.
    // It receives no model task. Only the selected cloud provider launches a browser.
    const ref = await executor.create([], url, options);
    const result: ApplicationBrowserRuntimeRef = {
      ...ref,
      provider: browserProvider,
    };
    try {
      const state = await command<StagehandStatus>(result, {
        operation: "status",
        commandId: randomUUID(),
      });
      result.browserSessionId = state.sessionId;
      if (attachments.deferred.length)
        await this.upload(result, attachments.deferred);
      return result;
    } catch (error) {
      await this.stop(result).catch(() => {});
      throw error;
    }
  },
  async status(ref: ApplicationBrowserRuntimeRef) {
    return command<StagehandStatus>(ref, {
      operation: "status",
      commandId: randomUUID(),
    });
  },
  async start(ref: ApplicationBrowserRuntimeRef, instruction: string) {
    await command(ref, { operation: "start", commandId: "start", instruction });
  },
  async respond(
    ref: ApplicationBrowserRuntimeRef,
    callId: string,
    output: unknown
  ) {
    await command(ref, {
      operation: "answer",
      commandId: `answer:${callId}`,
      callId,
      output,
    });
  },
  async resolve(
    ref: ApplicationBrowserRuntimeRef,
    request: BrowserPendingRequest,
    approved: boolean
  ): Promise<ControlledBrowserResult> {
    if (ref.readOnly)
      throw new Error("Read-only browser cannot approve submissions");
    return command(ref, {
      operation: "resolve",
      commandId: `resolve:${request.id}:${approved}`,
      request,
      approved,
    });
  },
  async upload(ref: ApplicationBrowserRuntimeRef, input: StagehandFile[]) {
    if (ref.readOnly)
      throw new Error("Read-only browser cannot receive attachments");
    await (await transport()).upload(hosted(ref), input);
    await command(ref, {
      operation: "upload",
      commandId: randomUUID(),
      files: files(input).map(({ data, ...file }) => file),
    });
  },
  async stop(ref: ApplicationBrowserRuntimeRef) {
    // Release the billable browser immediately, even if the executor's command
    // channel is unavailable. These are independent, idempotent cleanup paths.
    const [, release] = await Promise.allSettled([
      command(ref, { operation: "stop", commandId: "stop" }),
      ref.browserSessionId
        ? ref.provider === "browser-use"
          ? stopBrowserUseSession(ref.browserSessionId)
          : releaseSession(ref.browserSessionId)
        : Promise.resolve(),
    ]);
    await (await transport()).stop(hosted(ref));
    if (release.status === "rejected") throw release.reason;
  },
};
