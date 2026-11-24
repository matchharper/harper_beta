import type { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { browserRunAwaitsEmailCode, browserRunSubmission } from "@/lib/career/browser/submissionReceipt";
import { GMAIL_CONNECTION_CONFIRMED_EVENT, GMAIL_WAIT_OFFER_EXPOSURE_EVENT } from "@/lib/career/gmailWaitOfferExperiment";
import type { GmailWaitOfferExposure, GmailWaitOfferOutcomes } from "./gmailWaitOfferExperiment";

const PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 100;
/** Forms tied to these refs are application review forms, as the review reminders read them. */
const APPLICATION_REF_TYPES = new Set(["role", "opportunity", "browser_session"]);
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

const isApplicationForm = (refs: unknown) => Array.isArray(refs) && refs.some((ref) =>
  ref && typeof ref === "object" && APPLICATION_REF_TYPES.has(String((ref as { type?: unknown }).type)));

/**
 * Every exposure up to `endIso` (the builder keeps people whose first one falls in the chosen range), and what the
 * people exposed from `startIso` did afterwards.
 */
export async function fetchGmailWaitOfferExperimentRows(admin: Admin, startIso: string, endIso: string) {
  const exposures = await readAll<GmailWaitOfferExposure & { id: number }>((from, to) => admin.from("logs")
    .select("id,user_id,created_at,meta_data").eq("type", GMAIL_WAIT_OFFER_EXPOSURE_EVENT)
    .lte("created_at", endIso).order("id").range(from, to));
  const userIds = [...new Set(exposures.flatMap((row) => (row.user_id && row.created_at >= startIso ? [row.user_id] : [])))];
  const outcomes: GmailWaitOfferOutcomes = { connections: [], submissions: [], emailCodeStops: [], reviewForms: [], formAnswers: [] };
  for (let index = 0; index < userIds.length; index += ID_CHUNK_SIZE) {
    const ids = userIds.slice(index, index + ID_CHUNK_SIZE);
    const [connections, runs, messages] = await Promise.all([
      readAll<{ user_id: string | null; created_at: string }>((from, to) => admin.from("logs")
        .select("id,user_id,created_at").eq("type", GMAIL_CONNECTION_CONFIRMED_EVENT).in("user_id", ids)
        .gte("created_at", startIso).order("id").range(from, to)),
      readAll<{ user_id: string | null; updated_at: string; submitted: string | null; verificationCode: string | null }>((from, to) =>
        // Not in the generated types, like the other readers of this table.
        (admin.from as any)("talent_external_operations")
          .select("id,user_id,updated_at,submitted:result->>submitted,verificationCode:result->>verificationCode")
          .eq("kind", "browser_run").eq("request->>execution_environment", "production").in("user_id", ids)
          .gte("created_at", startIso).order("id").range(from, to)),
      readAll<{ user_id: string | null; created_at: string; message_type: string | null; form_id: string | null;
        related_refs: unknown; responses: unknown }>((from, to) => admin.from("talent_messages")
        .select("id,user_id,created_at,message_type,form_id:payload->>formId,related_refs:payload->relatedRefs,responses:payload->responses")
        .in("message_type", ["career_form", "career_form_response"]).in("user_id", ids)
        .gte("created_at", startIso).order("id").range(from, to)),
    ]);
    for (const row of connections) if (row.user_id) outcomes.connections.push({ userId: row.user_id, at: row.created_at });
    for (const row of runs) {
      if (!row.user_id) continue;
      const result = { submitted: row.submitted, verificationCode: row.verificationCode };
      if (browserRunSubmission(result) === "yes") outcomes.submissions.push({ userId: row.user_id, at: row.updated_at });
      if (browserRunAwaitsEmailCode(result)) outcomes.emailCodeStops.push({ userId: row.user_id, at: row.updated_at });
    }
    for (const row of messages) {
      if (!row.user_id) continue;
      if (row.message_type === "career_form_response") {
        // A single answer names its form; a batch names one per answer.
        const batch = Array.isArray(row.responses) ? row.responses : [];
        const formIds = [row.form_id, ...batch.map((item) => (item && typeof item === "object" ? (item as { formId?: unknown }).formId : null))]
          .flatMap((id) => (id == null || id === "" ? [] : [String(id)]));
        outcomes.formAnswers.push({ userId: row.user_id, at: row.created_at, formIds });
      } else if (row.form_id && isApplicationForm(row.related_refs)) {
        outcomes.reviewForms.push({ userId: row.user_id, at: row.created_at, formId: row.form_id });
      }
    }
  }
  return { exposures, outcomes };
}
