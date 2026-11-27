import {
  buildCareerApplicationProgress,
  careerApplicationRoleIds,
  careerApplicationStopRefs,
  careerApplicationStoppedSince,
  CAREER_APPLICATION_WINDOW_MS,
  CAREER_STOP_REASON,
  type ApplicationMessageRow,
  type ApplicationOpenForm,
  type ApplicationOperationRow,
  type ApplicationRequestRow,
  type ApplicationRoleRow,
} from "./build";
import type { CareerApplicationProgress } from "./types";
import { extractCareerOpportunityMentions } from "@/lib/career/opportunityMentionText";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

type Result = { data: unknown; error: { message?: string } | null };

// Bounds for one conversation's week (11/26: at most 43 forms, 66 answers and 125 browser/send operations).
const MESSAGE_LIMIT = 400;
const OPERATION_LIMIT = 300;
/** The person's Stops in one conversation's week: one row per press. */
const STOP_LIMIT = 100;
/**
 * The person's messages naming an opportunity since a Stop that a Harper turn here still holds, found by the chat's
 * mention marker (opportunityMentionText.ts).
 */
const REQUEST_LIMIT = 50;
const MENTION_MARKER = "HARPER_OPPORTUNITY_MENTIONS_V1";
/** The key stop_career_conversation gives the cleanup it queues for each open browser (account deletion uses another). */
const STOP_BROWSER_CLEANUP_KEY = "stop-browser-cleanup:";

/** Role statuses that mean the posting takes no applications (the same set as browser/postingCheck.ts). */
const ENDED_ROLE_STATUSES = new Set(["archived", "closed", "deleted", "ended", "expired", "inactive"]);

/** The latest of these times, any of which may be missing. */
const latest = (...values: (string | null | undefined)[]) =>
  values.filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

const rows = <T>(result: Result, what: string): T[] => {
  if (result.error) throw new Error(`${what} unavailable: ${result.error.message ?? "unknown error"}`);
  return Array.isArray(result.data) ? (result.data as T[]) : [];
};

/**
 * Reads the durable records of this conversation's applications for the polled work status: forms with their
 * answers, browser runs and sessions, sends, and the person's Stops, each limited to the last 7 days and to the JSON
 * paths the builder reads (form items and run reports can be hundreds of KB). Then, together, names the roles and
 * reads whether the person's Stop cancelled the delegated work behind each application's newest run or send. A run or
 * send is stopped when a Stop of the person's ended its request (the Stop's own record lists that message) or cancelled
 * its work (the Stop's note on it); a form answer is when the Stop's record lists it (the turn it started). The
 * careerTurnStopped flag on the message is not read, nor is any cancelled work taken as a Stop: Harper's own
 * cancellations (of a pending request, or of a work with manage_work) leave them too. A browser a Stop's cleanup closed
 * reads closed by Harper, so for the closed browsers not closed in the viewer it also reads which a Stop queued to close.
 * Only while an application is stopped and a Harper turn holds some of the person's messages, last, reads those that
 * name one since the Stop: asking about it picks it up while the turn that took the message holds it. At most seven
 * small queries; throws on a failed read so the caller can leave the list empty.
 */
export async function readCareerApplicationProgress(args: {
  admin: Pick<TalentAdminClient, "from">;
  userId: string;
  conversationId: string;
  /** read_open_career_forms rows, already read by the route. */
  openForms: PromiseLike<ApplicationOpenForm[]>;
  /** When Harper's running turn here started (null when none runs), from the route's own invocation read. */
  turnStartedAt: PromiseLike<string | null>;
  /**
   * The person's messages a Harper turn here still holds (each turn's queued and received input and its source
   * message; not a cleanup's), from the same read. A request about a stopped application counts only while one does.
   */
  turnMessageIds?: PromiseLike<readonly (string | number)[]>;
  /**
   * Whether a Harper turn here is on hold (CareerApplicationProgressInput.waitingForReply: it names no application and
   * asks nothing), from the same read.
   */
  waitingForReply?: PromiseLike<boolean>;
  /** Browsers a Stop queued to close (pending cleanup invocations), from the same read; this read adds the done ones. */
  closingBrowserSessionIds?: PromiseLike<readonly string[]>;
  now?: Date;
}): Promise<CareerApplicationProgress[]> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - CAREER_APPLICATION_WINDOW_MS).toISOString();
  // Selected JSON paths are not in the generated table types.
  const db = args.admin as unknown as { from: (table: string) => any };
  const [messages, operations, stops, openForms, turnStartedAt, waitingForReply, closingBrowserSessionIds, turnMessageIds]:
    [Result, Result, Result, ApplicationOpenForm[], string | null, boolean, readonly string[], readonly (string | number)[]] = await Promise.all([
    db.from("talent_messages")
      .select("id,messageType:message_type,createdAt:created_at,formId:payload->formId,revision:payload->revision,kind:payload->>kind,hidden:payload->hidden,relatedRefs:payload->relatedRefs,itemId:payload->>itemId,actionId:payload->>actionId,negativeActionId:payload->formSnapshot->negative->>id,submitScope:payload->values->submit_scope,saveLogin:payload->values->save_login,postings:payload->values->apply_postings,reason:payload->>reason")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .in("message_type", ["career_form", "career_form_response", "career_form_resolution"])
      .gte("created_at", since)
      // A batch answer's own row only lists the per-form rows saved with it.
      .not("payload->formId", "is", null)
      .order("id", { ascending: false })
      .limit(MESSAGE_LIMIT),
    db.from("talent_external_operations")
      .select("id,kind,parentId:parent_id,status,createdAt:created_at,updatedAt:updated_at,mode:request->>mode,roleRefs:request->role_refs,startUrl:request->>url,opportunityId:request->>opportunity_id,sourceMessageId:request->>source_message_id,workId:request->>work_id,needsUser:result->needsUser,submitted:result->>submitted,verificationCode:result->>verificationCode,url:result->>url,requestedAction:result->>requested_action,controlSource:result->>control_source,browserAvailability:result->>browser_availability")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .in("kind", ["browser_session", "browser_run", "email_send"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(OPERATION_LIMIT),
    // stop_career_conversation writes one per Stop, listing the requests (their source messages) it ended. A run that
    // Stop ended started before it, so the window covers it.
    db.from("talent_messages")
      .select("createdAt:created_at,sourceMessageIds:payload->sourceMessageIds")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .eq("message_type", "career_turn_stop")
      .gte("created_at", since)
      .order("id", { ascending: false })
      .limit(STOP_LIMIT),
    args.openForms,
    args.turnStartedAt,
    args.waitingForReply ?? false,
    args.closingBrowserSessionIds ?? [],
    args.turnMessageIds ?? [],
  ]);
  const input = {
    now,
    messages: rows<ApplicationMessageRow>(messages, "Application forms"),
    operations: rows<ApplicationOperationRow>(operations, "Application operations"),
    openForms,
    turnStartedAt,
    waitingForReply,
    closingBrowserSessionIds,
  };
  const roleIds = careerApplicationRoleIds(input);
  const { workIds } = careerApplicationStopRefs(input);
  // A Stop's cleanup closes a browser as Harper (control_source "assistant"), and the Stop's record names that browser's
  // run only when it waited on the person then; the cleanup the Stop queued for it still names it, done or not.
  const closedByHarper = [...new Set(input.operations.filter((row) => row.kind === "browser_session" && row.status === "closed"
    && row.controlSource !== "user").map((row) => row.id))];
  const none: Result = { data: [], error: null };
  const [roleRows, workRows, cleanupRows] = await Promise.all([
    roleIds.length
      ? db.from("company_roles")
        .select("role_id,name,status,is_expired,company_workspace:company_workspace_id(company_name)")
        .in("role_id", roleIds)
        .limit(roleIds.length)
      : none,
    workIds.length
      ? db.from("talent_external_operations")
        .select("id,status,note:result->>note,updatedAt:updated_at")
        .eq("user_id", args.userId)
        .eq("conversation_id", args.conversationId)
        .eq("kind", "delegated_work")
        .in("id", workIds)
        .limit(workIds.length)
      : none,
    closedByHarper.length
      ? db.from("talent_external_operations")
        .select("sessionId:request->>cleanup_browser_session")
        .eq("user_id", args.userId)
        .eq("conversation_id", args.conversationId)
        .eq("kind", "career_invocation")
        .like("idempotency_key", `${STOP_BROWSER_CLEANUP_KEY}%`)
        .in("request->>cleanup_browser_session", closedByHarper)
        .gte("created_at", since)
        .limit(OPERATION_LIMIT)
      : none,
  ]);
  const roles: ApplicationRoleRow[] = rows<{ role_id: string; name: string | null; status: string | null; is_expired: boolean | null; company_workspace?: { company_name?: string | null } | null }>(
    roleRows, "Application roles")
    .map((role) => ({
      roleId: role.role_id,
      companyName: role.company_workspace?.company_name?.trim() || null,
      title: role.name?.trim() || null,
      ended: role.is_expired === true || ENDED_ROLE_STATUSES.has(String(role.status ?? "").toLowerCase()),
    }));
  // Each request a Stop ended, with that Stop's time; each work a Stop cancelled, with its cancellation's.
  const stoppedSources = new Map<string, string | undefined>();
  for (const stop of rows<{ createdAt?: string | null; sourceMessageIds?: unknown }>(stops, "Application stops"))
    for (const id of Array.isArray(stop.sourceMessageIds) ? stop.sourceMessageIds : [])
      stoppedSources.set(String(id), latest(stoppedSources.get(String(id)), stop.createdAt));
  const cancelledWorks = new Map(rows<{ id: string; status?: string | null; note?: string | null; updatedAt?: string | null }>(
    workRows, "Application work")
    .filter((row) => row.status === "cancelled" && row.note === CAREER_STOP_REASON).map((row) => [row.id, row.updatedAt ?? undefined]));
  const operationsWithStops = input.operations.map((row) => {
    const bySource = Boolean(row.sourceMessageId && stoppedSources.has(row.sourceMessageId));
    const byWork = Boolean(row.workId && cancelledWorks.has(row.workId));
    if (!bySource && !byWork) return row;
    const stoppedAt = latest(bySource ? stoppedSources.get(row.sourceMessageId!) : undefined, byWork ? cancelledWorks.get(row.workId!) : undefined);
    return { ...row, stopped: true, ...(stoppedAt ? { stoppedAt } : {}) };
  });
  // An answer whose turn a Stop ended, with that Stop's time.
  const messagesWithStops = input.messages.map((row) => {
    const at = row.messageType === "career_form_response" && row.id != null ? stoppedSources.get(String(row.id)) : undefined;
    return at ? { ...row, stoppedAt: at } : row;
  });
  const stopClosed = rows<{ sessionId?: string | null }>(cleanupRows, "Application stop cleanups")
    .flatMap((row) => row.sessionId ? [row.sessionId] : []);
  const built = { ...input, messages: messagesWithStops, operations: operationsWithStops, roles,
    closingBrowserSessionIds: [...new Set([...closingBrowserSessionIds, ...stopClosed])] };
  const stoppedSince = careerApplicationStoppedSince(built);
  // A request counts only while the turn that took it holds it (CareerApplicationProgressInput.requests).
  const held = [...new Set(turnMessageIds.map(String))].filter((id) => /^[0-9]+$/.test(id));
  if (!stoppedSince || !held.length) return buildCareerApplicationProgress(built);
  // The held messages since then that name an opportunity; one a later Stop ended asked for nothing that went on.
  const requests: ApplicationRequestRow[] = rows<{ id: number | string; createdAt: string; content?: string | null }>(
    await db.from("talent_messages")
      .select("id,createdAt:created_at,content")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .eq("role", "user")
      .in("id", held)
      .gt("created_at", stoppedSince)
      .like("content", `%${MENTION_MARKER}%`)
      .order("id", { ascending: false })
      .limit(REQUEST_LIMIT),
    "Application requests")
    .filter((row) => !stoppedSources.has(String(row.id)))
    .map((row) => ({ createdAt: row.createdAt, roleIds: extractCareerOpportunityMentions(row.content ?? "")
      // A company or a /jobs posting is not an application here; a role is.
      .filter((mention) => !mention.targetKind).map((mention) => mention.roleId) }))
    .filter((request) => request.roleIds.length > 0);
  return buildCareerApplicationProgress({ ...built, requests });
}
