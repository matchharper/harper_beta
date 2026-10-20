import type {
  OpsCompanyConversationItem,
  OpsCompanyThreadSummary,
} from "./company";

export function chronologicalMessages(items: OpsCompanyConversationItem[]) {
  const unique = new Map<string, OpsCompanyConversationItem>();
  for (const item of items) {
    const thread = item.slackThread;
    const key = thread?.messageTs
      ? `${thread.id}:${thread.messageTs}`
      : `message:${item.messageId}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => {
    const at = a.slackThread?.messageTs
      ? Number(a.slackThread.messageTs) * 1000
      : Date.parse(a.occurredAt);
    const bt = b.slackThread?.messageTs
      ? Number(b.slackThread.messageTs) * 1000
      : Date.parse(b.occurredAt);
    return at - bt || a.messageId - b.messageId;
  });
}

export function conversationTimeline(
  items: OpsCompanyConversationItem[],
  summaries: OpsCompanyThreadSummary[],
  order: "activity" | "message" = "activity"
) {
  const threads = new Map(
    summaries.map((summary) => [summary.thread.id, summary])
  );
  const entries = new Map<
    string,
    {
      key: string;
      message: OpsCompanyConversationItem;
      summary: OpsCompanyThreadSummary | null;
    }
  >();
  for (const message of chronologicalMessages(items)) {
    const summary = message.slackThread
      ? (threads.get(message.slackThread.id) ?? null)
      : null;
    const key = summary
      ? `thread:${summary.thread.id}`
      : `message:${message.messageId}`;
    // Reinsert on each later reply so active threads appear at their latest message.
    entries.delete(key);
    entries.set(key, { key, message, summary });
  }
  const timeline = [...entries.values()];
  return order === "message"
    ? timeline.sort(
        (a, b) =>
          conversationMessageTime(a.summary?.root ?? a.message) -
          conversationMessageTime(b.summary?.root ?? b.message)
      )
    : timeline;
}

export function conversationMessageTime(item: OpsCompanyConversationItem) {
  const slackTime = Number(item.slackThread?.messageTs) * 1000;
  return slackTime > 0 && Number.isFinite(slackTime)
    ? slackTime
    : Date.parse(item.occurredAt);
}

export function conversationScope(item: OpsCompanyConversationItem) {
  return item.slackThread
    ? `slack:${item.slackThread.channelId}`
    : `${item.source}:${item.conversationId}`;
}

export function continuesConversationMessage(
  previous: OpsCompanyConversationItem | undefined,
  item: OpsCompanyConversationItem
) {
  if (!previous || conversationScope(previous) !== conversationScope(item))
    return false;
  const author = (message: OpsCompanyConversationItem) =>
    message.role === "assistant"
      ? "harper"
      : message.user.slackUserId || message.user.email;
  const identity = author(item);
  const elapsed =
    conversationMessageTime(item) - conversationMessageTime(previous);
  const day = (time: number) =>
    new Date(time + 9 * 3600_000).toISOString().slice(0, 10);
  return (
    Boolean(identity) &&
    author(previous) === identity &&
    elapsed >= 0 &&
    elapsed < 5 * 60_000 &&
    day(conversationMessageTime(item)) ===
      day(conversationMessageTime(previous))
  );
}

export function slackThreadUrl(thread: OpsCompanyThreadSummary["thread"]) {
  return `https://slack.com/archives/${encodeURIComponent(thread.channelId)}/p${(thread.messageTs || thread.rootTs).replace(".", "")}?thread_ts=${encodeURIComponent(thread.rootTs)}`;
}

/** Decode Slack's structured mentions, leaving code and the saved source intact. */
export function displaySlackMentions(
  content: string,
  names: ReadonlyMap<string, string>
) {
  return content
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part) =>
      part.startsWith("`")
        ? part
        : part
            .replace(
              /<@([A-Z0-9]+)>/g,
              (_match, id: string) =>
                `[@${(names.get(id) || id).replace(/[\\[\]]/g, "\\$&")}](https://slack.com/team/${id})`
            )
            .replace(
              /<#([A-Z0-9]+)\|([^>]+)>/g,
              (_match, id: string, name: string) =>
                `[#${name.replace(/[\\[\]]/g, "\\$&")}](https://slack.com/archives/${id})`
            )
    )
    .join("");
}
