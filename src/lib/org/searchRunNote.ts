import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { untypedTable } from "./untypedTable";

type Admin = ReturnType<typeof getSupabaseAdmin>;

/** The longest search result line shown; Harper's words past it are cut. */
export const SEARCH_RUN_NOTE_MAX = 160;

/**
 * The result line of a finished search, from what Harper wrote about it:
 * the first line of its message, without chat formatting, at most
 * SEARCH_RUN_NOTE_MAX characters. null when Harper said nothing.
 */
export function searchRunNoteFromReply(reply: unknown) {
  const line = String(reply ?? "")
    .split(/\n/)
    .map((part) =>
      part
        .replace(/^\s*(?:[>#]+|[-*•]|\d+[.)])\s*/, "")
        .replace(/[*_`~]/g, "")
        .replace(/<[^>|]*\|([^>]*)>/g, "$1")
        .replace(/\s+/g, " ")
        .trim()
    )
    .find(Boolean);
  if (!line) return null;
  const chars = Array.from(line);
  return chars.length > SEARCH_RUN_NOTE_MAX
    ? `${chars.slice(0, SEARCH_RUN_NOTE_MAX - 1).join("").trimEnd()}…`
    : line;
}

/**
 * Harper's own result line for each finished search that has one. A
 * finished search hands back to Harper (scheduled_matching_review); the
 * message Harper sent from that hand-back says what the search found.
 * Searches Harper stayed silent about are left out, so callers keep
 * their fixed line for them.
 */
export async function readSearchRunNotes(
  admin: Admin,
  runs: Array<{ id: string; continuation_job_id?: string | null }>
) {
  const notes = new Map<string, string>();
  const jobRun = new Map<string, string>();
  for (const run of runs)
    if (run.continuation_job_id) jobRun.set(run.continuation_job_id, run.id);
  if (!jobRun.size) return notes;
  const jobs = await untypedTable(admin, "company_agent_web_action_jobs")
    .select("id,terminal_message_id")
    .in("id", [...jobRun.keys()])
    .eq("action_name", "scheduled_matching_review")
    .eq("status", "completed_message");
  if (jobs.error) throw jobs.error;
  const messageRun = new Map<number, string>();
  for (const job of (jobs.data ?? []) as Array<{
    id: string;
    terminal_message_id: number | null;
  }>) {
    const runId = jobRun.get(job.id);
    if (runId && job.terminal_message_id != null)
      messageRun.set(Number(job.terminal_message_id), runId);
  }
  if (!messageRun.size) return notes;
  const messages = await untypedTable(admin, "company_messages")
    .select("id,content")
    .in("id", [...messageRun.keys()])
    .eq("role", "assistant");
  if (messages.error) throw messages.error;
  for (const message of (messages.data ?? []) as Array<{
    id: number;
    content: string | null;
  }>) {
    const runId = messageRun.get(Number(message.id));
    const note = searchRunNoteFromReply(message.content);
    if (runId && note) notes.set(runId, note);
  }
  return notes;
}
