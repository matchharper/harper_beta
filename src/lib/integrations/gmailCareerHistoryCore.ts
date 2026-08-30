export const GMAIL_CAREER_HISTORY_ORIGIN_TYPE = "gmail_career_history";
export const GMAIL_CAREER_HISTORY_ORIGIN_ID = "singleton";
export const GMAIL_CAREER_HISTORY_FILE_NAME = "Gmail Career History.md";

export function dedupGmailEmailsByThread<
  T extends {
    messageId: string;
    receivedAt: string | null;
    threadId: string | null;
  },
>(emails: T[]): T[] {
  const byThread = new Map<string, T>();
  const noThread: T[] = [];

  for (const email of emails) {
    const threadKey = (email.threadId ?? "").trim();
    if (!threadKey) {
      noThread.push(email);
      continue;
    }
    const existing = byThread.get(threadKey);
    if (
      !existing ||
      String(email.receivedAt ?? "") > String(existing.receivedAt ?? "")
    ) {
      byThread.set(threadKey, email);
    }
  }

  const combined = [...byThread.values(), ...noThread];
  combined.sort((left, right) =>
    String(right.receivedAt ?? "").localeCompare(String(left.receivedAt ?? ""))
  );
  return combined;
}

export const GMAIL_CAREER_STAGES = [
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "unknown",
] as const;
export const GMAIL_CAREER_CONFIDENCE_LEVELS = [
  "high",
  "medium",
  "low",
] as const;

export type GmailCareerStage = (typeof GMAIL_CAREER_STAGES)[number];
export type GmailCareerConfidence =
  (typeof GMAIL_CAREER_CONFIDENCE_LEVELS)[number];

export type GmailCareerEntry = {
  company: string;
  role: string | null;
  stage: GmailCareerStage;
  lastActivityAt: string | null;
  evidenceSummary: string;
  confidence: GmailCareerConfidence;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function cleanGmailCareerInlineText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeNullableDate(value: unknown) {
  const text = cleanGmailCareerInlineText(value, 100);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isCareerStage(value: string): value is GmailCareerStage {
  return GMAIL_CAREER_STAGES.some((candidate) => candidate === value);
}

function isConfidence(value: string): value is GmailCareerConfidence {
  return GMAIL_CAREER_CONFIDENCE_LEVELS.some(
    (candidate) => candidate === value
  );
}

export function normalizeGmailCareerEntries(
  value: unknown
): GmailCareerEntry[] {
  const root = asRecord(value);
  const rawEntries = Array.isArray(root?.entries) ? root.entries : [];
  const byApplication = new Map<string, GmailCareerEntry>();

  for (const rawEntry of rawEntries.slice(0, 100)) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;
    const company = cleanGmailCareerInlineText(entry.company, 200);
    const evidenceSummary = cleanGmailCareerInlineText(
      entry.evidenceSummary,
      600
    );
    if (!company || !evidenceSummary) continue;
    const role = cleanGmailCareerInlineText(entry.role, 240) || null;
    const rawStage = cleanGmailCareerInlineText(entry.stage, 40).toLowerCase();
    const rawConfidence = cleanGmailCareerInlineText(
      entry.confidence,
      40
    ).toLowerCase();
    const normalized: GmailCareerEntry = {
      company,
      confidence: isConfidence(rawConfidence) ? rawConfidence : "low",
      evidenceSummary,
      lastActivityAt: normalizeNullableDate(entry.lastActivityAt),
      role,
      stage: isCareerStage(rawStage) ? rawStage : "unknown",
    };
    const key = `${company.toLocaleLowerCase()}\u0000${(role ?? "").toLocaleLowerCase()}`;
    const previous = byApplication.get(key);
    if (
      !previous ||
      String(normalized.lastActivityAt ?? "") >
        String(previous.lastActivityAt ?? "")
    ) {
      byApplication.set(key, normalized);
    }
  }

  return [...byApplication.values()].sort((left, right) => {
    const dateOrder = String(right.lastActivityAt ?? "").localeCompare(
      String(left.lastActivityAt ?? "")
    );
    return dateOrder || left.company.localeCompare(right.company);
  });
}

const STAGE_LABELS: Record<GmailCareerStage, string> = {
  applied: "Applied",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  unknown: "Unknown",
};

const CONFIDENCE_LABELS: Record<GmailCareerConfidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function renderGmailCareerHistoryMarkdown(args: {
  analyzedAt: string;
  entries: GmailCareerEntry[];
}) {
  const lines = [
    "# Career history from Gmail",
    "",
    `Last analyzed: ${args.analyzedAt}`,
    "",
    "This document was generated from hiring-related email evidence. It does not contain raw email bodies or attachments.",
  ];

  if (args.entries.length === 0) {
    lines.push(
      "",
      "## No reliable application history found",
      "",
      "Harper did not find enough evidence in the reviewed hiring-related emails to record a company and role."
    );
    return `${lines.join("\n")}\n`;
  }

  for (const entry of args.entries) {
    lines.push(
      "",
      `## ${entry.company}${entry.role ? ` — ${entry.role}` : ""}`,
      "",
      `- Last known stage: ${STAGE_LABELS[entry.stage]}`,
      `- Last activity: ${entry.lastActivityAt ?? "Unknown"}`,
      `- Evidence: ${entry.evidenceSummary}`,
      `- Confidence: ${CONFIDENCE_LABELS[entry.confidence]}`
    );
  }
  return `${lines.join("\n")}\n`;
}
