import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SocketModeClient } from "@slack/socket-mode";

const APP_ORIGIN =
  process.env.HARPER_LOCAL_APP_ORIGIN || "http://127.0.0.1:3000";
const EVENTS_PATH = "/api/internal/slack/events";
const INTERACTIVITY_PATH = "/api/internal/slack/interactivity";
const appToken = String(process.env.SLACK_HARPER_LOCAL_APP_TOKEN || "").trim();
const signingSecret = String(
  process.env.SLACK_HARPER_APP_SIGNING_SECRET || ""
).trim();
const useVercelCliBypass =
  String(process.env.HARPER_LOCAL_VERCEL_CLI_BYPASS || "").trim() === "1";
const onlyMessageTs = String(
  process.env.HARPER_LOCAL_ONLY_MESSAGE_TS || ""
).trim();
const onlyMessageTextPrefix = String(
  process.env.HARPER_LOCAL_ONLY_TEXT_PREFIX || ""
).trim();
const onlyChannelId = String(
  process.env.HARPER_LOCAL_ONLY_CHANNEL_ID || ""
).trim();
const forwardDelayMs = Math.min(
  5_000,
  Math.max(0, Number(process.env.HARPER_LOCAL_FORWARD_DELAY_MS || 0) || 0)
);
const execFileAsync = promisify(execFile);

if (!appToken.startsWith("xapp-")) {
  throw new Error("SLACK_HARPER_LOCAL_APP_TOKEN is required");
}
if (
  !String(process.env.SLACK_HARPER_LOCAL_BOT_TOKEN || "").startsWith("xoxb-")
) {
  throw new Error("SLACK_HARPER_LOCAL_BOT_TOKEN is required");
}
if (!String(process.env.SLACK_HARPER_LOCAL_APP_ID || "").trim()) {
  throw new Error("SLACK_HARPER_LOCAL_APP_ID is required");
}
if (!signingSecret) {
  throw new Error("SLACK_HARPER_APP_SIGNING_SECRET is required");
}

function signedSlackHeaders(rawBody, contentType) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");
  return {
    "content-type": contentType,
    "x-slack-request-timestamp": timestamp,
    "x-slack-signature": `v0=${digest}`,
  };
}

async function forwardSlackPayload(args) {
  if (useVercelCliBypass) {
    // Preview deployments can be protected by Vercel Authentication. For a
    // local Socket Mode test, let `vercel curl` mint and attach its scoped
    // automation-bypass header instead of weakening Preview protection or
    // copying a bypass secret into this workspace.
    const origin = new URL(APP_ORIGIN).origin;
    const headers = signedSlackHeaders(args.rawBody, args.contentType);
    const { stdout } = await execFileAsync(
      "npx",
      [
        "--yes",
        "vercel@54.15.0",
        "curl",
        args.path,
        "--deployment",
        origin,
        "--fail",
        "--silent",
        "--show-error",
        "--request",
        "POST",
        "--header",
        `content-type: ${headers["content-type"]}`,
        "--header",
        `x-slack-request-timestamp: ${headers["x-slack-request-timestamp"]}`,
        "--header",
        `x-slack-signature: ${headers["x-slack-signature"]}`,
        "--data-binary",
        args.rawBody,
      ],
      { maxBuffer: 1024 * 1024 }
    );
    const output = stdout.trim();
    try {
      return output ? JSON.parse(output) : {};
    } catch {
      // `vercel curl` may prepend CLI diagnostics. A successful `--fail`
      // invocation is enough for an event acknowledgement.
      return { ok: true };
    }
  }

  const response = await fetch(`${APP_ORIGIN}${args.path}`, {
    body: args.rawBody,
    headers: signedSlackHeaders(args.rawBody, args.contentType),
    method: "POST",
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || "invalid_local_response" };
  }
  if (!response.ok) {
    throw new Error(
      `Local interactivity route failed (${response.status}): ${JSON.stringify(payload)}`
    );
  }
  return payload;
}

async function forwardInteraction(body) {
  const rawBody = `payload=${encodeURIComponent(JSON.stringify(body))}`;
  return forwardSlackPayload({
    contentType: "application/x-www-form-urlencoded",
    path: INTERACTIVITY_PATH,
    rawBody,
  });
}

async function forwardEvent(body) {
  return forwardSlackPayload({
    contentType: "application/json",
    path: EVENTS_PATH,
    rawBody: JSON.stringify(body),
  });
}

const client = new SocketModeClient({ appToken });

client.on("interactive", async ({ ack, body }) => {
  try {
    const response = await forwardInteraction(body);
    await ack(body?.type === "view_submission" ? response : undefined);
    const actionId = String(body?.actions?.[0]?.action_id || "").trim();
    const routeStatus = String(response?.status || "ok").trim();
    console.log(
      `[slack-local-socket] handled ${body?.type || "interactive"}${actionId ? ` action=${actionId}` : ""} status=${routeStatus}`
    );
  } catch (error) {
    console.error("[slack-local-socket] interaction failed", error);
    await ack();
  }
});

async function handleSlackEvent({ ack, body }) {
  try {
    if (
      (onlyMessageTs && String(body?.event?.ts || "").trim() !== onlyMessageTs) ||
      (onlyMessageTextPrefix &&
        !String(body?.event?.text || "").includes(onlyMessageTextPrefix)) ||
      (onlyChannelId && String(body?.event?.channel || "").trim() !== onlyChannelId)
    ) {
      await ack();
      console.log("[slack-local-socket] skipped event outside the requested test message");
      return;
    }
    if (forwardDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, forwardDelayMs));
    }
    await forwardEvent(body);
    await ack();
    console.log(
      `[slack-local-socket] handled event=${String(body?.event?.type || "unknown").trim()} id=${String(body?.event_id || "unknown").trim()}`
    );
  } catch (error) {
    // Do not ACK a failed forward. Slack Socket Mode will redeliver the event,
    // while the Preview Queue's event idempotency key protects a retry after a
    // successful publish whose acknowledgement was interrupted.
    console.error("[slack-local-socket] event forward failed", error);
  }
}

client.on("app_mention", handleSlackEvent);
client.on("message", handleSlackEvent);

client.on("connected", () => {
  console.log("[slack-local-socket] connected to Slack");
});

client.on("error", (error) => {
  console.error("[slack-local-socket] socket error", error);
});

await client.start();
