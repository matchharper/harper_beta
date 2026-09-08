import { cleanGmailCareerInlineText } from "@/lib/integrations/gmailCareerHistoryCore";

export type GmailCareerSourceEmail = {
  cc: string | null;
  content?: string;
  from: string | null;
  messageId: string;
  receivedAt: string | null;
  snippet: string | null;
  subject: string | null;
  threadId: string | null;
  to: string | null;
};

export type GmailCareerAnalysisMessage = {
  at: string | null;
  body?: string;
  cc?: string;
  direction: "received" | "sent";
  from?: string;
  id: string;
  subject?: string;
  to?: string;
};

export type GmailCareerAnalysisThread = {
  messages: GmailCareerAnalysisMessage[];
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const QUOTED_REPLY_PATTERNS = [
  /\s-{2,}\s*(?:original message|원본 메시지)\s*-{2,}/i,
  /\son .{0,300}? wrote:\s/i,
  /\s20\d{2}년.{0,300}?님이 작성:\s/,
];

function extractEmailAddresses(value: string | null): string[] {
  if (!value) return [];
  return (
    value
      .toLowerCase()
      .match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []
  );
}

function shortenUrl(rawUrl: string) {
  const trailingPunctuation = rawUrl.match(/[),.;!?]+$/)?.[0] ?? "";
  const value = trailingPunctuation
    ? rawUrl.slice(0, -trailingPunctuation.length)
    : rawUrl;
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}${trailingPunctuation}`;
  } catch {
    return rawUrl;
  }
}

function removeQuotedReply(text: string) {
  const cutAt = QUOTED_REPLY_PATTERNS.reduce((earliest, pattern) => {
    const match = pattern.exec(text);
    return match && match.index < earliest ? match.index : earliest;
  }, text.length);
  return text.slice(0, cutAt).trim();
}

function removePreviouslySeenText(text: string, previousBodies: string[]) {
  let result = text;
  for (const previous of previousBodies) {
    if (previous.length < 120) continue;
    result = result.replace(previous, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

function compactBody(args: {
  email: GmailCareerSourceEmail;
  maxCharacters: number;
  previousBodies: string[];
}) {
  const raw = args.email.content ?? args.email.snippet;
  const normalized = cleanGmailCareerInlineText(raw, 12_000).replace(
    URL_PATTERN,
    shortenUrl
  );
  const withoutQuotedReply = removeQuotedReply(normalized);
  return cleanGmailCareerInlineText(
    removePreviouslySeenText(withoutQuotedReply, args.previousBodies),
    args.maxCharacters
  );
}

function optionalText(value: unknown, maxCharacters: number) {
  return cleanGmailCareerInlineText(value, maxCharacters) || undefined;
}

function compactDate(value: string | null) {
  const text = cleanGmailCareerInlineText(value, 120);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? text
    : parsed.toISOString().slice(0, 10);
}

export function compactGmailCareerThreads(args: {
  emails: GmailCareerSourceEmail[];
  mailboxEmail: string | null;
  maxBodyCharacters: number;
  maxMessages: number;
}) {
  const selectedEmails = [...args.emails]
    .sort((left, right) =>
      String(right.receivedAt ?? "").localeCompare(
        String(left.receivedAt ?? "")
      )
    )
    .slice(0, args.maxMessages)
    .sort((left, right) =>
      String(left.receivedAt ?? "").localeCompare(
        String(right.receivedAt ?? "")
      )
    );
  const byThread = new Map<string, GmailCareerSourceEmail[]>();

  for (const email of selectedEmails) {
    const key = email.threadId || `message:${email.messageId}`;
    const thread = byThread.get(key) ?? [];
    thread.push(email);
    byThread.set(key, thread);
  }

  const ownerEmail = args.mailboxEmail?.toLowerCase() ?? null;
  const threads = [...byThread.values()]
    .map((emails): GmailCareerAnalysisThread => {
      const previousBodies: string[] = [];
      const messages = emails.map((email): GmailCareerAnalysisMessage => {
        const body = compactBody({
          email,
          maxCharacters: args.maxBodyCharacters,
          previousBodies,
        });
        if (body) previousBodies.push(body);
        const direction =
          ownerEmail && extractEmailAddresses(email.from).includes(ownerEmail)
            ? "sent"
            : "received";
        const cc = optionalText(email.cc, 500);
        const from = optionalText(email.from, 300);
        const subject = optionalText(email.subject, 300);
        const to = optionalText(email.to, 500);
        return {
          at: compactDate(email.receivedAt),
          ...(body ? { body } : {}),
          ...(cc ? { cc } : {}),
          direction,
          ...(from ? { from } : {}),
          id: email.messageId,
          ...(subject ? { subject } : {}),
          ...(to ? { to } : {}),
        };
      });
      return { messages };
    })
    .sort((left, right) =>
      String(left.messages.at(-1)?.at ?? "").localeCompare(
        String(right.messages.at(-1)?.at ?? "")
      )
    );

  return {
    selectedMessageCount: selectedEmails.length,
    threads,
  };
}

function splitOversizedThread(
  thread: GmailCareerAnalysisThread,
  maxCharacters: number
) {
  const parts: GmailCareerAnalysisThread[] = [];
  let messages: GmailCareerAnalysisMessage[] = [];

  for (const message of thread.messages) {
    const candidate = { messages: [...messages, message] };
    if (messages.length && JSON.stringify([candidate]).length > maxCharacters) {
      parts.push({ messages });
      messages = [];
    }
    const singleCandidate = { messages: [...messages, message] };
    if (JSON.stringify([singleCandidate]).length > maxCharacters) {
      throw new Error("A compact Gmail message exceeds the analysis limit");
    }
    messages.push(message);
  }
  if (messages.length) parts.push({ messages });
  return parts;
}

export function chunkGmailCareerThreads(args: {
  maxCharacters: number;
  threads: GmailCareerAnalysisThread[];
}) {
  const units = args.threads.flatMap((thread) =>
    JSON.stringify([thread]).length <= args.maxCharacters
      ? [thread]
      : splitOversizedThread(thread, args.maxCharacters)
  );
  const chunks: GmailCareerAnalysisThread[][] = [];
  let current: GmailCareerAnalysisThread[] = [];

  for (const thread of units) {
    const candidate = [...current, thread];
    if (
      current.length &&
      JSON.stringify(candidate).length > args.maxCharacters
    ) {
      chunks.push(current);
      current = [];
    }
    current.push(thread);
  }
  if (current.length) chunks.push(current);
  return chunks;
}
