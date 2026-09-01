import type { OrgAgentMessageRow } from "@/lib/org/agent/store";

export const RECENT_RAW_MESSAGE_LIMIT = 24;
export const MAX_SUMMARY_SOURCE_CHARS = 18_000;
const MAX_MESSAGE_CHARS = 2_000;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function messageSourceContent(message: OrgAgentMessageRow) {
  const metadata = record(message.metadata);
  const attachments = Array.isArray(metadata.slackFileAttachments)
    ? metadata.slackFileAttachments
        .slice(0, 3)
        .map((value: unknown) => record(value))
        .map((attachment: Record<string, any>) => {
          const name = text(attachment.name) || "Slack file";
          const content = text(attachment.text).slice(0, 1_000);
          return content ? `[attachment: ${name}] ${content}` : "";
        })
        .filter(Boolean)
        .join("\n")
    : "";
  return [text(message.content), attachments]
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_MESSAGE_CHARS);
}

/**
 * Fits a prefix of source rows into the summarizer request. The caller advances
 * the rolling cursor only through includedRows, never through rows omitted by
 * the character budget.
 */
export function formatOrgAgentSummarySource(messages: OrgAgentMessageRow[]) {
  let totalChars = 0;
  const lines: string[] = [];
  const includedRows: OrgAgentMessageRow[] = [];
  for (const message of messages) {
    const content = messageSourceContent(message);
    if (!content) continue;
    const line = `[${message.id}] ${message.role}: ${content}`;
    const separatorChars = lines.length > 0 ? 1 : 0;
    if (totalChars + separatorChars + line.length > MAX_SUMMARY_SOURCE_CHARS)
      break;
    totalChars += separatorChars + line.length;
    lines.push(line);
    includedRows.push(message);
  }
  return { includedRows, source: lines.join("\n") };
}
