import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";

type Row = Record<string, any>;

/** Keep a background run's final text as the conclusion the next run of the same source reads. */
export async function recordCareerRunConclusion(admin: TalentAdminClient, args: { userId: string; runId: string; text: string }) {
  if (!args.text.trim()) return;
  const { error } = await (admin.rpc as any)("record_career_run_conclusion_v1", {
    p_talent: args.userId, p_run: args.runId, p_text: args.text.trim(),
  });
  if (error) throw new Error(error.message);
}

const CONTINUED_SOURCES = new Set(["schedule", "company_follow"]);
const SOURCE_LABEL: Record<string, string> = { schedule: "reservation", company_follow: "followed company" };

/** The reservations and followed companies a background run continues. */
export function continuedSourcesOf(sourceEvents: unknown): { sourceKind: string; sourceId: string }[] {
  const events = Array.isArray(sourceEvents) ? sourceEvents as Row[] : [];
  const seen = new Set<string>();
  return events.flatMap(event => {
    if (!CONTINUED_SOURCES.has(event?.sourceKind) || event.sourceId == null) return [];
    const key = `${event.sourceKind}:${event.sourceId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ sourceKind: String(event.sourceKind), sourceId: String(event.sourceId) }];
  });
}

/** What the previous run for each of these sources concluded, for the run continuing it. */
export async function readPreviousConclusions(admin: TalentAdminClient, args: { userId: string; runId: string; sourceEvents: unknown }) {
  const sources = continuedSourcesOf(args.sourceEvents);
  if (!sources.length) return "";
  const unavailable = "What earlier runs for these sources concluded could not be read.";
  try {
    const { data, error } = await (admin.rpc as any)("read_career_source_conclusions_v1", {
      p_talent: args.userId, p_run: args.runId, p_sources: sources,
    });
    return error ? unavailable : formatPreviousConclusions((data ?? []) as Row[]);
  } catch {
    // Continuity helps the run; it never stops it.
    return unavailable;
  }
}

export function formatPreviousConclusions(rows: Row[]) {
  if (!rows.length) return "";
  return rows.map(row => [
    `Previous run for ${SOURCE_LABEL[row.source_kind] ?? row.source_kind} ${row.source_id}, concluded ${formatLlmDateTime(row.concluded_at)} (${PROMPT_TIME_ZONE}). Its final text, which was not delivered:`,
    String(row.conclusion ?? "").trim(),
  ].join("\n")).join("\n\n");
}
