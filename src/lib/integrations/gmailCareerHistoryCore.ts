export const GMAIL_CAREER_HISTORY_ORIGIN_TYPE = "gmail_career_history";
export const GMAIL_CAREER_HISTORY_ORIGIN_ID = "singleton";
export const GMAIL_CAREER_HISTORY_FILE_NAME = "Career History.md";

export function buildGmailCareerHistorySummaryInstruction(
  outputLanguage: "English" | "Korean"
) {
  return [
    `Write summary in ${outputLanguage}.`,
    "Use a compact phrase that records only the process: the application or submission, meaningful stages reached in chronological order, and the explicit final result when one exists.",
    "The company and role are already separate fields. Do not repeat their actual names in summary.",
    "If the evidence stops after the application with no later process record, say that there is no later record. If later stages exist but no final outcome is recorded, say that there is no final result.",
    "Avoid report-like filler, explanations about what the emails confirm, and contrastive narration such as 'the company received the application, but'.",
    "Keep it as short as the evidence allows; do not enumerate emails or dates.",
    "Korean style examples: '해당 직무 지원, 이후 기록 없음' and '지원 접수 후 1차 직무 인터뷰, 2차 직무 인터뷰까지 진행, 최종 결과 없음.'",
    "English style examples: 'Applied; no later record.' and 'Application received; progressed through first and second role interviews; no final result.'",
    `Follow only the ${outputLanguage} examples for wording and language.`,
  ].join(" ");
}

export type GmailCareerEntry = {
  company: string;
  role: string | null;
  appliedAt: string | null;
  endedAt: string | null;
  summary: string;
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
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
}

export function normalizeGmailCareerEntries(
  value: unknown
): GmailCareerEntry[] {
  const root = asRecord(value);
  const rawEntries = Array.isArray(root?.entries) ? root.entries : [];
  const normalizedEntries: GmailCareerEntry[] = [];
  const seen = new Set<string>();

  for (const rawEntry of rawEntries.slice(0, 100)) {
    const entry = asRecord(rawEntry);
    if (!entry) continue;
    const company = cleanGmailCareerInlineText(entry.company, 200);
    const summary = cleanGmailCareerInlineText(entry.summary, 800);
    if (!company || !summary) continue;
    const role = cleanGmailCareerInlineText(entry.role, 240) || null;
    const normalized: GmailCareerEntry = {
      appliedAt: normalizeNullableDate(entry.appliedAt),
      company,
      endedAt: normalizeNullableDate(entry.endedAt),
      role,
      summary,
    };
    const key = JSON.stringify(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    normalizedEntries.push(normalized);
  }

  return normalizedEntries.sort((left, right) => {
    const dateOrder = String(
      right.appliedAt ?? right.endedAt ?? ""
    ).localeCompare(String(left.appliedAt ?? left.endedAt ?? ""));
    return dateOrder || left.company.localeCompare(right.company);
  });
}

function formatCareerHistoryDate(value: string | null) {
  return value ? value.replaceAll("-", ".") : "";
}

function formatCareerHistoryDateRange(entry: GmailCareerEntry) {
  const appliedAt = formatCareerHistoryDate(entry.appliedAt);
  const endedAt = formatCareerHistoryDate(entry.endedAt);
  if (appliedAt && endedAt) return `${appliedAt} ~ ${endedAt}`;
  if (appliedAt) return appliedAt;
  if (endedAt) return `~ ${endedAt}`;
  return "";
}

export function renderGmailCareerHistoryMarkdown(args: {
  entries: GmailCareerEntry[];
}) {
  if (args.entries.length === 0) {
    return "- No reliable application history found.\n";
  }

  const lines = args.entries.map((entry) => {
    const title = entry.role
      ? `${entry.company} - ${entry.role}`
      : entry.company;
    const dateRange = formatCareerHistoryDateRange(entry);
    return `- ${title} : ${dateRange ? `${dateRange}, ` : ""}${entry.summary}`;
  });
  return `${lines.join("\n")}\n`;
}
