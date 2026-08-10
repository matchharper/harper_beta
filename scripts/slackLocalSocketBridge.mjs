import { createHmac } from "node:crypto";
import { SocketModeClient } from "@slack/socket-mode";

const APP_ORIGIN =
  process.env.HARPER_LOCAL_APP_ORIGIN || "http://127.0.0.1:3000";
const INTERACTIVITY_PATH = "/api/internal/slack/interactivity";
const appToken = String(process.env.SLACK_HARPER_LOCAL_APP_TOKEN || "").trim();
const signingSecret = String(
  process.env.SLACK_HARPER_APP_SIGNING_SECRET || ""
).trim();

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

async function forwardInteraction(body) {
  const rawBody = `payload=${encodeURIComponent(JSON.stringify(body))}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex");
  const response = await fetch(`${APP_ORIGIN}${INTERACTIVITY_PATH}`, {
    body: rawBody,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": `v0=${digest}`,
    },
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

client.on("connected", () => {
  console.log("[slack-local-socket] connected to Slack");
});

client.on("error", (error) => {
  console.error("[slack-local-socket] socket error", error);
});

await client.start();
