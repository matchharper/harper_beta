import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  applicationBrowserActionSchema,
  applicationBrowserReadActionSchema,
  type ApplicationBrowserAction,
  type BrowserPendingRequest,
  type ControlledBrowserResult,
} from "./applicationBrowserActions";
import { controlledBrowserDriver } from "./applicationBrowserDriver";
import { agentsRequest, ApplicationBrowserApiError } from "./agentsApi";
import { playwrightTrustSetup, playwrightSetup } from "./applicationPlaywright";
import {
  hostedBrowserStart,
  hostedBrowserWorker,
  hostedBrowserPublish,
} from "./applicationBrowserHostedWorker";
import {
  browserResultStore,
  type BrowserResultStore,
  type BrowserResultTarget,
} from "./applicationBrowserResultStore";
import { type ApplicationBrowserRuntimeRef } from "./applicationBrowserRuntimeRef";
import { withBrowserAbort } from "./browserAbort";
export type { ApplicationBrowserRuntimeRef } from "./applicationBrowserRuntimeRef";

type BrowserFile = { documentId: string; path: string };
type InputFile = { path: string; data: string };
export interface ApplicationBrowserRuntime {
  create(
    files: InputFile[],
    initialUrl: string,
    options?: { readOnly?: boolean; signal?: AbortSignal }
  ): Promise<ApplicationBrowserRuntimeRef>;
  execute(
    ref: ApplicationBrowserRuntimeRef,
    input: ApplicationBrowserAction,
    files: BrowserFile[],
    commandId: string,
    signal?: AbortSignal
  ): Promise<ControlledBrowserResult>;
  resolve(
    ref: ApplicationBrowserRuntimeRef,
    request: BrowserPendingRequest,
    approved: boolean
  ): Promise<ControlledBrowserResult>;
  upload(ref: ApplicationBrowserRuntimeRef, files: InputFile[]): Promise<void>;
  stop(ref: ApplicationBrowserRuntimeRef, signal?: AbortSignal): Promise<void>;
}
const directory = "/workspace/harper-browser";
const inline = (path: string, value: string) => ({
  type: "inline",
  path,
  data: Buffer.from(value).toString("base64"),
});
const prefix = (ref: ApplicationBrowserRuntimeRef) => {
  if (!z.string().uuid().safeParse(ref.name).success)
    throw new Error("Invalid browser resource identifier");
  return `_application-browser/${ref.name}`;
};
function destination(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("A public HTTPS browser destination is required");
}
function hosted(ref: ApplicationBrowserRuntimeRef) {
  if (ref.provider !== "openai" || !ref.sessionId || !ref.environmentId)
    throw new Error(
      "This legacy application browser must be ended before starting another"
    );
  return { sessionId: ref.sessionId, environmentId: ref.environmentId };
}

/** This session provisions compute only and NEVER receives agent input. The
 * separate planner stays environment:none, without shell or file access. */
export function createApplicationBrowserRuntime(
  options: {
    request?: typeof agentsRequest;
    results?: BrowserResultStore;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): ApplicationBrowserRuntime {
  const request = options.request ?? agentsRequest;
  const results = options.results ?? browserResultStore;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  async function current(
    ref: ApplicationBrowserRuntimeRef,
    signal?: AbortSignal
  ) {
    if (
      Date.parse(ref.expiresAt) <= Date.now() ||
      !Number.isFinite(Date.parse(ref.expiresAt))
    )
      throw new Error(
        "Application browser expired; its page cannot be resumed or submitted again"
      );
    const ids = hosted(ref);
    const env = await withBrowserAbort(
      () =>
        request<{ status: string }>(
          `environments/${encodeURIComponent(ids.environmentId)}`,
          undefined,
          "GET",
          signal
        ),
      signal
    );
    if (env.status !== "connected")
      throw new Error(
        "Application browser was lost; do not restart or repeat submission"
      );
    return ids;
  }
  async function wait(
    target: BrowserResultTarget,
    timeout: number,
    signal?: AbortSignal
  ) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const value = await withBrowserAbort(() => results.read(target), signal);
      if (value !== null) {
        await withBrowserAbort(() => results.remove(target.path), signal);
        return value;
      }
      await withBrowserAbort(() => sleep(500), signal);
    }
    throw new Error(
      "Application browser result timed out; do not repeat submission"
    );
  }
  async function command(
    ref: ApplicationBrowserRuntimeRef,
    input: Record<string, unknown>,
    signal?: AbortSignal
  ) {
    const ids = await current(ref, signal);
    const target = await withBrowserAbort(
      () => results.target(prefix(ref)),
      signal
    );
    await withBrowserAbort(
      () =>
        request(
          `environments/${encodeURIComponent(ids.environmentId)}/files`,
          inline(
            `${directory}/commands/${randomUUID()}.json`,
            JSON.stringify({ input, target })
          ),
          "POST",
          signal
        ),
      signal
    );
    const receipt = z
      .object({ commandId: z.string(), result: z.record(z.unknown()) })
      .parse(await wait(target, 45_000, signal));
    if (receipt.commandId !== input.commandId)
      throw new Error("Application browser result identifier differs");
    if (receipt.result.error) throw new Error(String(receipt.result.error));
    return receipt.result;
  }
  async function upload(ref: ApplicationBrowserRuntimeRef, files: InputFile[]) {
    if (ref.readOnly)
      throw new Error("Read-only browser cannot receive attachments");
    const ids = await current(ref);
    for (const file of files) {
      if (
        !file.path.startsWith("/workspace/attachments/") ||
        file.path.split("/").includes("..")
      )
        throw new Error("Invalid application attachment path");
      const bytes = Buffer.from(file.data, "base64");
      if (!bytes.length || bytes.length > 10 * 1024 * 1024)
        throw new Error("Attachment transfer limit exceeded");
      // Live inline files have a 5 MiB limit. Verified chunks retain the current
      // 10 MiB document contract without a Files API or model-driven transfer.
      const chunks: string[] = [],
        transferId = randomUUID();
      for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) {
        const path = `${directory}/chunks/${transferId}-${chunks.length}`;
        await request(
          `environments/${encodeURIComponent(ids.environmentId)}/files`,
          {
            type: "inline",
            path,
            data: bytes
              .subarray(offset, offset + 1024 * 1024)
              .toString("base64"),
          }
        );
        chunks.push(path);
      }
      const result = await command(ref, {
        operation: "install_file",
        commandId: `file:${transferId}`,
        path: file.path,
        chunks,
        hash: createHash("sha256").update(bytes).digest("hex"),
      });
      if (result.installed !== true)
        throw new Error("Application attachment was not installed");
    }
  }
  async function removeSession(sessionId: string, signal?: AbortSignal) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await withBrowserAbort(
          () =>
            request(
              `sessions/${encodeURIComponent(sessionId)}`,
              undefined,
              "DELETE",
              signal
            ),
          signal
        );
        return;
      } catch (error) {
        if (error instanceof ApplicationBrowserApiError && error.status === 404)
          return;
        if (
          !(
            error instanceof ApplicationBrowserApiError && error.status === 409
          ) ||
          attempt === 3
        )
          throw error;
        await withBrowserAbort(() => sleep(1000 * (attempt + 1)), signal);
      }
    }
  }
  const runtime: ApplicationBrowserRuntime = {
    async create(files, initialUrl, configuration = {}) {
      const signal = configuration.signal;
      signal?.throwIfAborted();
      if (configuration.readOnly && files.length)
        throw new Error("Read-only browser cannot receive attachments");
      destination(initialUrl);
      if (
        files.reduce(
          (sum, file) => sum + Buffer.byteLength(file.data, "base64"),
          0
        ) >
        10 * 1024 * 1024
      )
        throw new Error("Attachments exceed the 10 MiB browser transfer limit");
      await withBrowserAbort(() => results.check(), signal);
      let ref: ApplicationBrowserRuntimeRef = {
        name: randomUUID(),
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        provider: "openai",
        ...(configuration.readOnly ? { readOnly: true } : {}),
      };
      const ready = await withBrowserAbort(
        () => results.target(prefix(ref)),
        signal
      );
      try {
        const created = await withBrowserAbort(
          () =>
            request<{
              id: string;
              environment: { id: string };
            }>(
              "sessions",
              {
                agent: {
                  model: "gpt-6-luna",
                  instructions:
                    "Compute provisioning only. This session receives no agent task.",
                },
                environment: {
                  type: "openai_hosted",
                  container_size: "medium",
                  network: { access: "enabled" },
                  files: [
                    inline(`${directory}/server.cjs`, controlledBrowserDriver),
                    inline(`${directory}/worker.cjs`, hostedBrowserWorker),
                    inline(`${directory}/publish.py`, hostedBrowserPublish),
                    inline(`${directory}/start.py`, hostedBrowserStart),
                    inline(`${directory}/trust.py`, playwrightTrustSetup),
                    inline(`${directory}/initial-url`, initialUrl),
                    inline(
                      `${directory}/configuration.json`,
                      JSON.stringify({
                        ready,
                        expiresAt: ref.expiresAt,
                        readOnly: !!configuration.readOnly,
                      })
                    ),
                  ],
                  setup_commands: [
                    ...playwrightSetup,
                    {
                      command: `mkdir -p ${directory}/commands ${directory}/chunks /workspace/attachments && python3 ${directory}/start.py`,
                      cwd: "/workspace",
                    },
                  ],
                },
                // No input and no model turn. Page content cannot reach sandbox code.
              },
              "POST",
              signal
            ),
          signal
        );
        ref = {
          ...ref,
          sessionId: created.id,
          environmentId: created.environment.id,
        };
        const deadline = Date.now() + 150_000;
        while (Date.now() < deadline) {
          const env = await withBrowserAbort(
            () =>
              request<{ status: string }>(
                `environments/${encodeURIComponent(ref.environmentId!)}`,
                undefined,
                "GET",
                signal
              ),
            signal
          );
          if (env.status === "connected") break;
          if (
            ["failed", "expired", "disconnected", "suspended"].includes(
              env.status
            )
          )
            throw new Error("Application browser setup failed");
          await withBrowserAbort(() => sleep(1000), signal);
        }
        await current(ref, signal);
        if (
          !z
            .object({ ready: z.literal(true) })
            .safeParse(await wait(ready, 15_000, signal)).success
        )
          throw new Error("Application browser did not start");
        if (files.length) await upload(ref, files);
        return ref;
      } catch (error) {
        const cleanup = AbortSignal.timeout(10_000);
        if (ref.sessionId)
          await removeSession(ref.sessionId, cleanup).catch(() => {});
        await withBrowserAbort(() => results.clear(prefix(ref)), cleanup).catch(
          () => {}
        );
        throw error;
      }
    },
    async execute(ref, raw, files, commandId, signal) {
      const input = (
        ref.readOnly
          ? applicationBrowserReadActionSchema
          : applicationBrowserActionSchema
      ).parse(raw);
      if (input.action === "navigate") destination(input.url);
      const data: Record<string, unknown> = { ...input, commandId };
      const attachPath = (field: { documentId: string }) => {
        const file = files.find((file) => file.documentId === field.documentId);
        if (!file)
          throw new Error(
            "Only the user's verified application attachments can be uploaded"
          );
        return { ...field, path: file.path };
      };
      if (input.action === "attach") Object.assign(data, attachPath(input));
      if (input.action === "fill_fields")
        data.fields = input.fields.map(field => field.action === "attach" ? attachPath(field) : field);
      return (await command(ref, data, signal)) as ControlledBrowserResult;
    },
    async resolve(ref, held, approved) {
      if (ref.readOnly)
        throw new Error("Read-only browser cannot approve submissions");
      // Only the authenticated answer executor calls this, never a model tool.
      return (await command(ref, {
        operation: "resolve",
        commandId: `approval:${held.id}:${approved}`,
        id: held.id,
        bodyHash: held.bodyHash,
        formHash: held.formHash,
        approved,
      })) as ControlledBrowserResult;
    },
    upload,
    async stop(ref, signal) {
      if (ref.provider !== "openai") {
        // Cleanup of pre-migration activities only; no legacy creation or resume.
        const { Sandbox } = await import("@vercel/sandbox");
        try {
          const {
            VERCEL_TOKEN: token,
            VERCEL_TEAM_ID: teamId,
            VERCEL_PROJECT_ID: projectId,
          } = process.env;
          await (
            await Sandbox.get({
              name: ref.name,
              resume: false,
              ...(token && teamId && projectId
                ? { token, teamId, projectId }
                : {}),
            })
          ).stop();
        } catch (error) {
          if (
            !(
              error &&
              typeof error === "object" &&
              "status" in error &&
              error.status === 404
            )
          )
            throw error;
        }
        return;
      }
      await removeSession(hosted(ref).sessionId, signal);
      await withBrowserAbort(() => results.clear(prefix(ref)), signal);
    },
  };
  return runtime;
}
export const applicationBrowserRuntime = createApplicationBrowserRuntime();
