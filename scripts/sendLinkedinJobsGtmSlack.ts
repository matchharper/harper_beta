import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const CHANNEL = "C0B2TFPUS6P";
const SCOUTER_USER_ID = "U0A7HLQU9FC";
const RECEIPT_DIR = path.resolve(process.cwd(), ".local/linkedin-jobs-gtm-slack");

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function slackApi(
  method: string,
  token: string,
  body: Record<string, unknown>
) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as {
    channel?: string;
    error?: string;
    ok?: boolean;
    ts?: string;
    user_id?: string;
  } | null;
  if (!response.ok || !result?.ok) {
    throw new Error(`Slack ${method} failed: ${result?.error ?? response.status}`);
  }
  return result;
}

async function main() {
  const messageFile = flag("--message-file");
  const runKey = flag("--run-key")?.trim();
  const send = process.argv.includes("--send");
  if (!messageFile || !runKey) {
    throw new Error("--message-file and --run-key are required");
  }
  const message = (await readFile(messageFile, "utf8")).trim();
  if (!message || message.length > 4000) {
    throw new Error("Message must contain 1-4000 characters");
  }
  if (!send) {
    process.stdout.write(`${message}\n`);
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) throw new Error("SLACK_BOT_TOKEN is required");

  await mkdir(RECEIPT_DIR, { recursive: true, mode: 0o700 });
  const receiptPath = path.join(
    RECEIPT_DIR,
    `${createHash("sha256").update(runKey).digest("hex")}.json`
  );
  const receipt = await open(receiptPath, "wx", 0o600).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Run key already attempted; inspect receipt before retrying: ${runKey}`);
    }
    throw error;
  });
  await receipt.close();

  try {
    const identity = await slackApi("auth.test", token, {});
    if (identity.user_id !== SCOUTER_USER_ID) {
      throw new Error("SLACK_BOT_TOKEN does not belong to Harper Scouter");
    }
    const postBody = {
      channel: CHANNEL,
      text: message,
      unfurl_links: false,
      unfurl_media: false,
    };
    let posted;
    try {
      posted = await slackApi("chat.postMessage", token, postBody);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("not_in_channel")) {
        throw error;
      }
      await slackApi("conversations.join", token, { channel: CHANNEL });
      posted = await slackApi("chat.postMessage", token, postBody);
    }
    if (!posted.ts || posted.channel !== CHANNEL) {
      throw new Error("Slack did not return the expected channel and message timestamp");
    }
    const slackUrl = `https://app.slack.com/archives/${CHANNEL}/p${posted.ts.replace(".", "")}`;
    await writeFile(
      receiptPath,
      JSON.stringify({ runKey, channel: CHANNEL, ts: posted.ts, slackUrl }) + "\n",
      { mode: 0o600 }
    );
    process.stdout.write(`${JSON.stringify({ ok: true, slackUrl })}\n`);
  } catch (error) {
    await writeFile(
      receiptPath,
      JSON.stringify({ runKey, status: "needs_reconciliation" }) + "\n",
      { mode: 0o600 }
    );
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
