import dotenv from "dotenv";
import path from "node:path";
import { readFile } from "node:fs/promises";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

const DEFAULT_CHANNEL = "C0A795ULXGF";

function flag(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function postSlackMessage(args: {
  blocks?: Array<Record<string, unknown>>;
  channel: string;
  text: string;
  threadTs?: string;
}) {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) throw new Error("SLACK_BOT_TOKEN is required");

  const joinChannel = async () => {
    const response = await fetch("https://slack.com/api/conversations.join", {
      body: JSON.stringify({ channel: args.channel }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      ok?: boolean;
    } | null;
    if (!response.ok || !payload?.ok) {
      throw new Error(
        `Slack conversations.join failed: ${payload?.error ?? response.status}`
      );
    }
  };

  const send = async (includeBlocks: boolean) => {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      body: JSON.stringify({
        channel: args.channel,
        text: args.text,
        unfurl_links: false,
        unfurl_media: false,
        ...(includeBlocks && args.blocks ? { blocks: args.blocks } : {}),
        ...(args.threadTs ? { thread_ts: args.threadTs } : {}),
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
      ok?: boolean;
      ts?: string;
    } | null;
    return { payload, response };
  };

  let result = await send(Boolean(args.blocks));
  if (result.payload?.error === "not_in_channel") {
    await joinChannel();
    result = await send(Boolean(args.blocks));
  }
  if (
    args.blocks &&
    (!result.response.ok || !result.payload?.ok) &&
    ["invalid_blocks", "invalid_blocks_format"].includes(
      result.payload?.error ?? ""
    )
  ) {
    result = await send(false);
  }
  if (!result.response.ok || !result.payload?.ok || !result.payload.ts) {
    throw new Error(
      `Slack chat.postMessage failed: ${
        result.payload?.error ?? result.response.status
      }`
    );
  }
  return result.payload.ts;
}

async function main() {
  const insightFile = flag("--insight-file");
  const insight = insightFile
    ? (await readFile(insightFile, "utf8")).trim()
    : undefined;
  if (!hasFlag("--dry-run") && !insight) {
    throw new Error(
      "Read the --dry-run report, write an insight, then pass --insight-file before sending."
    );
  }
  const { buildTalentGtmReport, formatTalentGtmSlackMessages } =
    await import("@/lib/growthTalentGtmReport");
  const excludedEmails = String(
    process.env.GROWTH_TALENT_GTM_EXCLUDED_EMAILS ?? ""
  )
    .split(/[\n,]/g)
    .map((value) => value.trim())
    .filter(Boolean);
  const report = await buildTalentGtmReport({
    date: flag("--date"),
    excludedEmails,
  });
  const messages = formatTalentGtmSlackMessages(report, { insight });

  if (hasFlag("--dry-run")) {
    process.stdout.write(
      [
        messages.main.text,
        "\n--- thread: jobs ---\n",
        messages.jobs.text,
        "\n--- thread: instagram/content ---\n",
        messages.content.text,
        "\n--- thread: other sources ---\n",
        messages.notes.text,
        "\n",
      ].join("\n")
    );
    return;
  }

  const channel =
    flag("--channel") ??
    process.env.GROWTH_TALENT_GTM_SLACK_CHANNEL?.trim() ??
    DEFAULT_CHANNEL;
  const threadTs = await postSlackMessage({
    blocks: messages.main.blocks as Array<Record<string, unknown>> | undefined,
    channel,
    text: messages.main.text,
  });
  for (const message of [messages.jobs, messages.content, messages.notes]) {
    await postSlackMessage({
      blocks: message.blocks as Array<Record<string, unknown>> | undefined,
      channel,
      text: message.text,
      threadTs,
    });
  }

  process.stdout.write(
    `${JSON.stringify({ channel, date: report.date, ok: true, threadTs })}\n`
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  );
  process.exitCode = 1;
});
