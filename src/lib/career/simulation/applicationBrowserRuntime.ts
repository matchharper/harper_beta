import { Sandbox } from "@vercel/sandbox";
import { randomUUID } from "node:crypto";
import {
  applicationBrowserActionSchema,
  type ApplicationBrowserAction,
  type BrowserPendingRequest,
  type ControlledBrowserResult,
} from "./applicationBrowserActions";
import {
  controlledBrowserDriver,
  controlledBrowserClient,
} from "./applicationBrowserDriver";

export type ApplicationBrowserRuntimeRef = { name: string; expiresAt: string };
type BrowserFile = { documentId: string; path: string };
type InputFile = { path: string; data: string };
export interface ApplicationBrowserRuntime {
  create(
    files: InputFile[],
    initialUrl: string
  ): Promise<ApplicationBrowserRuntimeRef>;
  execute(
    ref: ApplicationBrowserRuntimeRef,
    input: ApplicationBrowserAction,
    files: BrowserFile[],
    commandId: string
  ): Promise<ControlledBrowserResult>;
  resolve(
    ref: ApplicationBrowserRuntimeRef,
    request: BrowserPendingRequest,
    approved: boolean
  ): Promise<ControlledBrowserResult>;
  upload(ref: ApplicationBrowserRuntimeRef, files: InputFile[]): Promise<void>;
  stop(ref: ApplicationBrowserRuntimeRef): Promise<void>;
}
const directory = "/vercel/sandbox/harper-browser";
function credentials() {
  const {
    VERCEL_TOKEN: token,
    VERCEL_TEAM_ID: teamId,
    VERCEL_PROJECT_ID: projectId,
  } = process.env;
  return token && teamId && projectId ? { token, teamId, projectId } : {};
}
async function current(ref: ApplicationBrowserRuntimeRef) {
  if (Date.parse(ref.expiresAt) <= Date.now())
    throw new Error(
      "Application browser expired; its page cannot be resumed or submitted again"
    );
  const sandbox = await Sandbox.get({
    name: ref.name,
    resume: false,
    ...credentials(),
  });
  if (sandbox.status !== "running")
    throw new Error(
      "Application browser was lost; do not restart or repeat submission"
    );
  return sandbox;
}
async function command(
  ref: ApplicationBrowserRuntimeRef,
  input: Record<string, unknown>
) {
  const sandbox = await current(ref);
  const file = `${directory}/commands/${randomUUID()}.json`;
  await sandbox.writeFiles([
    { path: file, content: JSON.stringify(input), mode: 0o600 },
  ]);
  const result = await sandbox.runCommand(
    "node",
    [`${directory}/client.cjs`, file],
    { timeoutMs: 35000 }
  );
  const value = JSON.parse(await result.stdout()) as ControlledBrowserResult;
  if (result.exitCode !== 0 || value.error)
    throw new Error(value.error ?? "Controlled browser command failed");
  return value;
}
export const applicationBrowserRuntime: ApplicationBrowserRuntime = {
  async create(files, initialUrl) {
    const sandbox = await Sandbox.create({
      ...credentials(),
      image: "vercel/sandbox/node:24",
      persistent: false,
      timeout: 30 * 60_000,
      // No model runs here. Private-network access is still denied for page content.
      networkPolicy: {
        allow: { "*": [] },
        subnets: {
          deny: [
            "10.0.0.0/8",
            "172.16.0.0/12",
            "192.168.0.0/16",
            "169.254.0.0/16",
            "127.0.0.0/8",
            "::1/128",
            "fc00::/7",
            "fe80::/10",
          ],
        },
      },
    });
    try {
      await sandbox.writeFiles([
        { path: `${directory}/server.cjs`, content: controlledBrowserDriver },
        { path: `${directory}/client.cjs`, content: controlledBrowserClient },
        { path: `${directory}/initial-url`, content: initialUrl, mode: 0o600 },
        ...files.map((file) => ({
          path: file.path,
          content: Buffer.from(file.data, "base64"),
          mode: 0o600,
        })),
      ]);
      const install = await sandbox.runCommand({
        cmd: "bash",
        args: [
          "-c",
          `npm install --prefix ${directory} playwright@1.64.0 && ${directory}/node_modules/.bin/playwright install --with-deps chromium`,
        ],
        sudo: true,
      });
      if (install.exitCode !== 0)
        throw new Error("Application browser setup failed");
      await sandbox.runCommand({
        cmd: "node",
        args: [`${directory}/server.cjs`],
        detached: true,
      });
      for (let attempt = 0; attempt < 30; attempt++) {
        if (await sandbox.readFileToBuffer({ path: `${directory}/port` }))
          return {
            name: sandbox.name,
            expiresAt: (
              sandbox.expiresAt ?? new Date(Date.now() + 30 * 60_000)
            ).toISOString(),
          };
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      throw new Error("Application browser did not start");
    } catch (error) {
      await sandbox.stop().catch(() => {});
      throw error;
    }
  },
  async execute(ref, raw, files, commandId) {
    const input = applicationBrowserActionSchema.parse(raw);
    if (input.action === "navigate") {
      const url = new URL(input.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443")
      )
        throw new Error("A public HTTPS browser destination is required");
    }
    const data: Record<string, unknown> = { ...input, commandId };
    if (input.action === "attach") {
      const file = files.find((file) => file.documentId === input.documentId);
      if (!file)
        throw new Error(
          "Only the user's verified application attachments can be uploaded"
        );
      data.path = file.path;
    }
    return command(ref, data);
  },
  async resolve(ref, request, approved) {
    // This method is called only from the authenticated answer executor, never a model tool.
    return command(ref, {
      operation: "resolve",
      commandId: `approval:${request.id}:${approved}`,
      id: request.id,
      bodyHash: request.bodyHash,
      formHash: request.formHash,
      approved,
    });
  },
  async upload(ref, files) {
    await (
      await current(ref)
    ).writeFiles(
      files.map((file) => ({
        path: file.path,
        content: Buffer.from(file.data, "base64"),
        mode: 0o600,
      }))
    );
  },
  async stop(ref) {
    try {
      await (
        await Sandbox.get({ name: ref.name, resume: false, ...credentials() })
      ).stop();
    } catch (error) {
      // Expired ephemeral browsers may already have been removed. Do not block
      // ending the activity, but keep real authorization/network failures visible.
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
  },
};
