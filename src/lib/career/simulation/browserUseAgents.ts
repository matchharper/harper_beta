import { z } from "zod";
import type { StagehandFile } from "./applicationStagehandRuntime";

export const BROWSER_USE_APPLICATION_MODEL = "gpt-6-luna";
const uuid = z.string().uuid();
const runSchema = z.object({
  id: uuid,
  sessionId: uuid,
  status: z.string(),
  output: z.unknown().optional(),
  error: z.string().nullable().optional(),
  totalCostUsd: z.string().optional(),
  totalInputTokens: z.number().optional(),
  totalOutputTokens: z.number().optional(),
});
export const browserUseTerminal = (status: string) =>
  ["completed", "failed", "cancelled"].includes(status);

/** V4 transport. Never retry POST /runs: an ambiguous response can already be applying. */
export const browserUseAgents = {
  async request(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST"
  ) {
    const key = process.env.BROWSER_USE_API_KEY?.trim();
    if (!key)
      throw new Error(
        "BROWSER_USE_API_KEY is required for application browsing"
      );
    const response = await fetch(`https://api.browser-use.com/api/v4${path}`, {
      method,
      headers: {
        "X-Browser-Use-API-Key": key,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (method === "DELETE" && response.status === 404) return {};
    if (!response.ok)
      throw new Error(
        `Browser Use ${method} ${path.split("?")[0]} failed (HTTP ${response.status})`
      );
    return response.status === 204 ? {} : z.record(z.unknown()).parse(await response.json());
  },
  async createWorkspace() {
    return z
      .object({ id: uuid })
      .parse(await this.request("/workspaces", { name: "Harper application" }))
      .id;
  },
  async clearFiles(workspaceId: string) {
    const root = `/workspaces/${uuid.parse(workspaceId)}/files`;
    let cursor: string | undefined;
    const paths: string[] = [];
    do {
      const page = z
        .object({
          files: z.array(z.object({ path: z.string() })),
          nextCursor: z.string().nullable().optional(),
          hasMore: z.boolean().optional(),
        })
        .parse(
          await this.request(
            `${root}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
          )
        );
      paths.push(...page.files.map((file) => file.path));
      if (page.hasMore && !page.nextCursor)
        throw new Error("Browser Use file listing is incomplete");
      cursor = page.hasMore ? page.nextCursor! : undefined;
    } while (cursor);
    for (const path of paths)
      await this.request(
        `${root}?path=${encodeURIComponent(path)}`,
        undefined,
        "DELETE"
      );
  },
  async upload(workspaceId: string, files: StagehandFile[]) {
    const paths: { documentId: string; name: string; path: string }[] = [];
    // The provider accepts ten upload descriptors per request; sequential uploads
    // also detect same-basename collisions rather than silently replacing a resume.
    for (const file of files) {
      const bytes = Buffer.from(file.data, "base64");
      const contentType = file.mimeType ?? "application/octet-stream";
      const name = file.name ?? file.path.split("/").at(-1)!;
      const uploaded = z
        .object({
          files: z.array(
            z.object({
              name: z.string(),
              path: z.string(),
              uploadUrl: z.string().url(),
            })
          ),
        })
        .parse(
          await this.request(
            `/workspaces/${uuid.parse(workspaceId)}/files/upload`,
            {
              files: [{ name, contentType, size: bytes.byteLength }],
              allowOverrides: false,
            }
          )
        );
      const target = uploaded.files[0];
      if (!target)
        throw new Error("Browser Use did not return a file upload destination");
      const response = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(bytes.byteLength),
        },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(60_000),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(
          `Application attachment upload failed (HTTP ${response.status})`
        );
      paths.push({ documentId: file.documentId!, name, path: target.path });
    }
    return paths;
  },
  async createRun(
    task: string,
    outputSchema: Record<string, unknown>,
    workspaceId: string,
    sessionId?: string
  ) {
    return runSchema.parse(
      await this.request("/runs", {
        task,
        model: BROWSER_USE_APPLICATION_MODEL,
        outputSchema,
        workspaceId: uuid.parse(workspaceId),
        ...(sessionId ? { sessionId: uuid.parse(sessionId) } : {}),
        agentmail: false,
        browserSettings: { record: false },
      })
    );
  },
  async status(runId: string) {
    return z
      .object({ status: z.string() })
      .parse(await this.request(`/runs/${uuid.parse(runId)}/status`));
  },
  async result(runId: string) {
    return runSchema.parse(await this.request(`/runs/${uuid.parse(runId)}`));
  },
  async stop(
    state: {
      runId?: string;
      sessionId?: string;
      workspaceId?: string;
      dispatchStarted?: boolean;
    },
    deleteFiles = true
  ) {
    if (state.dispatchStarted && !state.runId)
      throw new Error(
        "Browser Use dispatch outcome is unknown; remote cleanup could not be confirmed"
      );
    if (state.runId) {
      let current = await this.status(state.runId);
      if (!browserUseTerminal(current.status)) {
        await this.request(
          `/runs/${uuid.parse(state.runId)}/cancel`,
          undefined,
          "POST"
        );
        const deadline = Date.now() + 20_000;
        do {
          current = await this.status(state.runId);
          if (browserUseTerminal(current.status)) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } while (Date.now() < deadline);
        if (!browserUseTerminal(current.status))
          throw new Error("Browser Use cancellation is not confirmed");
      }
    }
    if (state.sessionId) {
      let page = 1;
      while (true) {
        const browsers = z
          .object({
            items: z.array(z.object({ id: uuid, status: z.string() })),
            totalItems: z.number(),
          })
          .parse(
            await this.request(
              `/browsers?agentSessionId=${uuid.parse(state.sessionId)}&pageSize=100&pageNumber=${page}`
            )
          );
        for (const browser of browsers.items) {
          if (browser.status !== "stopped") {
            const result = await this.request(
              `/browsers/${browser.id}`,
              { action: "stop" },
              "PATCH"
            );
            if (result.status !== "stopped")
              throw new Error("Browser Use browser stop is not confirmed");
          }
        }
        if (page * 100 >= browsers.totalItems) break;
        page++;
      }
    }
    if (deleteFiles && state.workspaceId)
      await this.clearFiles(state.workspaceId);
  },
};
