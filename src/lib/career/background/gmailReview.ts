import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { careerExecutionEnvironment } from "../executionEnvironment";
import { browserRunAwaitsEmailCode } from "../browser/submissionReceipt";
import type { CareerAgentReplyJob } from "../agentReplyQueue";

/** The first inbox review after a Gmail connection waits until the chat has had no message for this long. */
const GMAIL_REVIEW_QUIET_MS = 10 * 60_000;
/** A request of the person's made, or a form shown, within this window still counts as using the chat. */
const GMAIL_REVIEW_RECENT_MS = 60 * 60_000;
/** After this the review starts even if the chat never went quiet. It still waits for the person's other Career work. */
const GMAIL_REVIEW_MAX_WAIT_MS = 3 * 60 * 60_000;
/** A code screen stays open only while its browser does, which closes 10 minutes after its last use. */
const CODE_SCREEN_MS = 15 * 60_000;

type GmailReview = { id: string; user_id: string; conversation_id: string | null; created_at: string };
type BrowserRun = { id: string; conversation_id: string | null; request: Record<string, unknown>; result: Record<string, unknown> | null };

/** Applications of the person's that stopped within the last few minutes at a screen waiting for an emailed code. */
async function applicationsAwaitingEmailCode(admin: TalentAdminClient, userId: string, now: number, conversationId?: string) {
  let query = (admin.from as any)("talent_external_operations").select("id,conversation_id,request,result")
    .eq("user_id", userId).eq("kind", "browser_run").eq("request->>execution_environment", careerExecutionEnvironment())
    .gte("updated_at", new Date(now - CODE_SCREEN_MS).toISOString());
  if (conversationId) query = query.eq("conversation_id", conversationId);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(10);
  if (error) throw error;
  return ((data ?? []) as BrowserRun[]).filter((run) => run.conversation_id && browserRunAwaitsEmailCode(run.result ?? {}));
}

/** Whether the person is using this chat: a recent request of theirs is unfinished, the chat moved, a form waits for
 * their answer, or an application waits at a code screen. A request counts from when it was made: the dispatch scan
 * touches unfinished requests every minute. */
export async function chatIsInUse(admin: TalentAdminClient, userId: string, conversationId: string, now = Date.now()) {
  const since = (ms: number) => new Date(now - ms).toISOString();
  const rows = (table: string) => (admin.from as any)(table).select("id").eq("user_id", userId).eq("conversation_id", conversationId);
  const [requests, messages, forms, codeScreens] = await Promise.all([
    rows("talent_external_operations").eq("kind", "career_invocation").is("parent_id", null).neq("status", "completed")
      .gte("created_at", since(GMAIL_REVIEW_RECENT_MS)).limit(1),
    rows("talent_messages").gte("created_at", since(GMAIL_REVIEW_QUIET_MS)).limit(1),
    (admin.rpc as any)("read_open_career_forms", { p_user_id: userId, p_conversation_id: conversationId }),
    applicationsAwaitingEmailCode(admin, userId, now, conversationId),
  ]);
  for (const result of [requests, messages, forms]) if (result.error) throw result.error;
  return Boolean(requests.data?.length || messages.data?.length || codeScreens.length || (forms.data ?? []).some(
    (form: { created_at: string }) => Date.parse(form.created_at) > now - GMAIL_REVIEW_RECENT_MS));
}

/**
 * Starts recorded inbox reviews whose turn has come: the chat is quiet (or the review has waited 3 hours) and the
 * person has no other Career job, which career_start_gmail_review_v1 checks under the lock that scheduled and daily
 * work take. A review that is not started stays ready for the next scan and holds nothing meanwhile.
 */
export async function startPendingGmailReviews(admin: TalentAdminClient, options: {
  now?: number; userId?: string; limit?: number; publish?: (job: CareerAgentReplyJob) => Promise<unknown>;
} = {}) {
  const now = options.now ?? Date.now();
  const limit = Math.min(20, options.limit ?? 20);
  // New work follows the scan's capacity, like the scheduled work it waits behind.
  if (limit <= 0) return { inspected: 0, started: 0 };
  const publish = options.publish ?? (async (job: CareerAgentReplyJob) => (await import("../agentReplyQueue")).enqueueCareerAgentReply(job));
  let query = (admin.from as any)("talent_external_operations").select("id,user_id,conversation_id,created_at")
    .eq("kind", "gmail_review").eq("status", "ready").eq("request->>execution_environment", careerExecutionEnvironment());
  if (options.userId) query = query.eq("user_id", options.userId);
  const { data, error } = await query.order("updated_at").limit(limit);
  if (error) throw error;
  let started = 0;
  const results = await Promise.allSettled(((data ?? []) as GmailReview[]).map(async (review) => {
    let run: { id: string; status: string; talent_id: string; conversation_id: string; trigger_payload: any } | null = null;
    try {
      const waiting = now - Date.parse(review.created_at) < GMAIL_REVIEW_MAX_WAIT_MS && review.conversation_id
        && await chatIsInUse(admin, review.user_id, review.conversation_id, now);
      if (waiting) return;
      const result = await (admin.rpc as any)("career_start_gmail_review_v1", { p_review: review.id });
      if (result.error) throw result.error;
      run = result.data?.status === "handed_off" ? result.data : null;
    } finally {
      // A review that keeps waiting, or keeps failing, moves to the back so it cannot starve later ones.
      if (!run) {
        const touched = await (admin.from as any)("talent_external_operations").update({ updated_at: new Date().toISOString() })
          .eq("id", review.id).eq("status", "ready");
        if (touched.error) console.warn("[career-gmail] Inbox review not rotated", { id: review.id, error: String(touched.error) });
      }
    }
    if (!run) return;
    started += 1;
    // A lost publish is picked up by recoverCareerBackgroundRuns, like any accepted run without a turn.
    await publish({ userId: run.talent_id, conversationId: run.conversation_id,
      replyId: run.trigger_payload.agentInvocation.replyId, backgroundRunId: run.id, checkpointKey: `accepted:${run.id}` });
  }));
  const failures = results.flatMap((result) => result.status === "rejected" ? [String(result.reason)] : []);
  if (failures.length) console.warn("[career-gmail] Inbox review start deferred", { count: failures.length, errors: failures.slice(0, 3) });
  return { inspected: data?.length ?? 0, started };
}

/** Local servers have no due-work scan, so a local connection checks its own review until the review has started. */
export function scheduleLocalGmailReview(admin: TalentAdminClient, userId: string) {
  void import("../developmentQueue.server").then(({ scheduleCareerDevelopmentJob }) =>
    scheduleCareerDevelopmentJob(`gmail-review:${userId}`, async () => {
      await startPendingGmailReviews(admin, { userId });
      const { count, error } = await (admin.from as any)("talent_external_operations").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("kind", "gmail_review").eq("status", "ready")
        .eq("request->>execution_environment", careerExecutionEnvironment());
      if (error) throw error;
      return !count;
    })).catch((error) => console.warn("[career-gmail] Local inbox review not scheduled", { error: String(error) }));
}

/**
 * Tells applications that stopped at a screen waiting for an emailed code, in the last few minutes, that Gmail is now
 * readable. The event goes into that chat's own turn, which can read the code and continue within the approval the
 * application already has; the inbox review itself still waits its turn.
 */
export async function notifyApplicationAwaitingEmailCode(admin: TalentAdminClient, userId: string, options: {
  now?: number; publishInvocations?: (args: { admin: TalentAdminClient; userId: string; conversationId: string }) => Promise<unknown>;
} = {}) {
  const runs = await applicationsAwaitingEmailCode(admin, userId, options.now ?? Date.now());
  const notified = new Set<string>();
  for (const run of runs) {
    const source = Number(run.request?.source_message_id);
    if (!Number.isSafeInteger(source) || source <= 0) continue;
    const { data: invocation, error } = await (admin.rpc as any)("queue_career_event", {
      p_user_id: userId, p_conversation_id: run.conversation_id, p_source: source, p_kind: "gmail_connected", p_reference: run.id, p_revision: 0,
    });
    // One application that cannot hear does not keep the others from hearing.
    if (error) { console.warn("[career-gmail] Waiting application not told", { id: run.id, error: String(error.message ?? error) }); continue; }
    if (invocation) notified.add(run.conversation_id!);
  }
  const publishInvocations = options.publishInvocations
    ?? (async (args: { admin: TalentAdminClient; userId: string; conversationId: string }) => (await import("../work/invocations")).publishCareerInvocations(args));
  for (const conversationId of notified) await publishInvocations({ admin, userId, conversationId });
  return { notified: notified.size };
}
