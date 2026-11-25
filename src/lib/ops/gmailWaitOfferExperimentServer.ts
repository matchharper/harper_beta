import type { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { browserRunSubmission } from "@/lib/career/browser/submissionReceipt";
import { GMAIL_CONNECTION_CONFIRMED_EVENT, GMAIL_WAIT_OFFER_EXPOSURE_EVENT } from "@/lib/career/gmailWaitOfferExperiment";
import type { GmailWaitOfferExposure, GmailWaitOfferOutcomes } from "./gmailWaitOfferExperiment";

const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 100;
/** "채용 페이지에서 직접 지원" clicks on PC and phone, the same events the daily debug report reads. */
const DIRECT_APPLY_CLICK_EVENTS = [
  "career_click_history_external_apply_directly",
  "career_click_mobile_history_external_apply_directly",
];
type Admin = ReturnType<typeof getTalentSupabaseAdmin>;
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Reads every page of a query that orders by id. */
async function readAll<T>(page: (from: number, to: number) => Page<T>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || "Gmail 카드 실험 조회 실패");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/**
 * Every exposure up to `endIso` (the builder keeps people whose first one falls in the chosen range), and what the
 * people exposed from `startIso` did afterwards.
 */
export async function fetchGmailWaitOfferExperimentRows(admin: Admin, startIso: string, endIso: string) {
  const exposures = await readAll<GmailWaitOfferExposure & { id: number }>((from, to) => admin.from("logs")
    .select("id,user_id,created_at,meta_data").eq("type", GMAIL_WAIT_OFFER_EXPOSURE_EVENT)
    .lte("created_at", endIso).order("id").range(from, to));
  const userIds = [...new Set(exposures.flatMap((row) => (row.user_id && row.created_at >= startIso ? [row.user_id] : [])))];
  const outcomes: GmailWaitOfferOutcomes = { connections: [], completions: [], actions: [] };
  // Not in the generated types, like the other readers of this table.
  const operations = () => (admin.from as any)("talent_external_operations");
  for (let index = 0; index < userIds.length; index += ID_CHUNK_SIZE) {
    const ids = userIds.slice(index, index + ID_CHUNK_SIZE);
    const [logs, runs, emails, messages] = await Promise.all([
      readAll<{ user_id: string | null; created_at: string; type: string | null }>((from, to) => admin.from("logs")
        .select("id,user_id,created_at,type").in("type", [GMAIL_CONNECTION_CONFIRMED_EVENT, ...DIRECT_APPLY_CLICK_EVENTS])
        .in("user_id", ids).gte("created_at", startIso).order("id").range(from, to)),
      readAll<{ user_id: string | null; created_at: string; updated_at: string; mode: string | null; submitted: string | null }>(
        (from, to) => operations()
          .select("id,user_id,created_at,updated_at,mode:request->>mode,submitted:result->>submitted")
          .eq("kind", "browser_run").eq("request->>execution_environment", "production").in("user_id", ids)
          .gte("created_at", startIso).order("id").range(from, to)),
      readAll<{ user_id: string | null; updated_at: string; action: string | null }>((from, to) => operations()
        .select("id,user_id,updated_at,action:request->>action")
        .eq("kind", "email_send").eq("status", "succeeded").eq("request->>execution_environment", "production")
        .in("user_id", ids).gte("created_at", startIso).order("id").range(from, to)),
      readAll<{ user_id: string | null; created_at: string }>((from, to) => admin.from("talent_messages")
        .select("id,user_id,created_at").in("message_type", ["chat", "career_form_response"]).eq("role", "user")
        .in("user_id", ids).gte("created_at", startIso).order("id").range(from, to)),
    ]);
    for (const row of logs) {
      if (!row.user_id) continue;
      const event = { userId: row.user_id, at: row.created_at };
      (row.type === GMAIL_CONNECTION_CONFIRMED_EVENT ? outcomes.connections : outcomes.actions).push(event);
    }
    for (const row of runs) {
      if (!row.user_id) continue;
      if (browserRunSubmission({ submitted: row.submitted }) === "yes") outcomes.completions.push({ userId: row.user_id, at: row.updated_at });
      // Harper submits only after the person approves the review.
      if (row.mode === "execute") outcomes.actions.push({ userId: row.user_id, at: row.created_at });
    }
    // A new email to a company is an application by mail; a reply to an incoming thread is not.
    for (const row of emails) if (row.user_id && row.action === "send") outcomes.completions.push({ userId: row.user_id, at: row.updated_at });
    for (const row of messages) if (row.user_id) outcomes.actions.push({ userId: row.user_id, at: row.created_at });
  }
  return { exposures, outcomes };
}
