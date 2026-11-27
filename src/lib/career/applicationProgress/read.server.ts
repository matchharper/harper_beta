import {
  buildCareerApplicationProgress,
  careerApplicationRoleIds,
  careerApplicationStopRefs,
  careerApplicationStoppedSince,
  CAREER_APPLICATION_WINDOW_MS,
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
/** The person's messages naming an opportunity since a Stop, found by the chat's mention marker (opportunityMentionText.ts). */
const REQUEST_LIMIT = 50;
const MENTION_MARKER = "HARPER_OPPORTUNITY_MENTIONS_V1";

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
 * reads whether the delegated work behind each application's newest run or send was cancelled. A run or send is
 * stopped when a Stop of the person's ended its request (the Stop's own record lists that message) or its work was
 * cancelled. The careerTurnStopped flag on the message is not read: Harper's cancellation of a pending request
 * (manage_work) sets it too. Only while an application is stopped, last, reads the person's messages since that name
 * one: asking about it picks it up again. At most six small queries; throws on a failed read so the caller can leave
 * the list empty.
 */
export async function readCareerApplicationProgress(args: {
  admin: Pick<TalentAdminClient, "from">;
  userId: string;
  conversationId: string;
  /** read_open_career_forms rows, already read by the route. */
  openForms: PromiseLike<ApplicationOpenForm[]>;
  /** When Harper's running turn here started (null when none runs), from the route's own invocation read. */
  turnStartedAt: PromiseLike<string | null>;
  /** Whether Harper's turn here waits for the person's reply in chat, from the same read. */
  waitingForReply?: PromiseLike<boolean>;
  /** Browsers a Stop queued to close (pending cleanup invocations), from the same read. */
  closingBrowserSessionIds?: PromiseLike<readonly string[]>;
  now?: Date;
}): Promise<CareerApplicationProgress[]> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - CAREER_APPLICATION_WINDOW_MS).toISOString();
  // Selected JSON paths are not in the generated table types.
  const db = args.admin as unknown as { from: (table: string) => any };
  const [messages, operations, stops, openForms, turnStartedAt, waitingForReply, closingBrowserSessionIds]:
    [Result, Result, Result, ApplicationOpenForm[], string | null, boolean, readonly string[]] = await Promise.all([
    db.from("talent_messages")
      .select("messageType:message_type,createdAt:created_at,formId:payload->formId,revision:payload->revision,kind:payload->>kind,hidden:payload->hidden,relatedRefs:payload->relatedRefs,itemId:payload->>itemId,actionId:payload->>actionId,negativeActionId:payload->formSnapshot->negative->>id,submitScope:payload->values->submit_scope,saveLogin:payload->values->save_login,postings:payload->values->apply_postings,reason:payload->>reason")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .in("message_type", ["career_form", "career_form_response", "career_form_resolution"])
      .gte("created_at", since)
      // A batch answer's own row only lists the per-form rows saved with it.
      .not("payload->formId", "is", null)
      .order("id", { ascending: false })
      .limit(MESSAGE_LIMIT),
    db.from("talent_external_operations")
      .select("id,kind,parentId:parent_id,status,createdAt:created_at,updatedAt:updated_at,mode:request->>mode,roleRefs:request->role_refs,startUrl:request->>url,opportunityId:request->>opportunity_id,sourceMessageId:request->>source_message_id,workId:request->>work_id,needsUser:result->needsUser,submitted:result->>submitted,verificationCode:result->>verificationCode,url:result->>url,requestedAction:result->>requested_action,browserAvailability:result->>browser_availability")
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
  const none: Result = { data: [], error: null };
  const [roleRows, workRows] = await Promise.all([
    roleIds.length
      ? db.from("company_roles")
        .select("role_id,name,status,is_expired,company_workspace:company_workspace_id(company_name)")
        .in("role_id", roleIds)
        .limit(roleIds.length)
      : none,
    workIds.length
      ? db.from("talent_external_operations")
        .select("id,status,updatedAt:updated_at")
        .eq("user_id", args.userId)
        .eq("conversation_id", args.conversationId)
        .eq("kind", "delegated_work")
        .in("id", workIds)
        .limit(workIds.length)
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
  // Each request a Stop ended, with that Stop's time; each cancelled work, with its cancellation's.
  const stoppedSources = new Map<string, string | undefined>();
  for (const stop of rows<{ createdAt?: string | null; sourceMessageIds?: unknown }>(stops, "Application stops"))
    for (const id of Array.isArray(stop.sourceMessageIds) ? stop.sourceMessageIds : [])
      stoppedSources.set(String(id), latest(stoppedSources.get(String(id)), stop.createdAt));
  const cancelledWorks = new Map(rows<{ id: string; status?: string | null; updatedAt?: string | null }>(workRows, "Application work")
    .filter((row) => row.status === "cancelled").map((row) => [row.id, row.updatedAt ?? undefined]));
  const operationsWithStops = input.operations.map((row) => {
    const bySource = Boolean(row.sourceMessageId && stoppedSources.has(row.sourceMessageId));
    const byWork = Boolean(row.workId && cancelledWorks.has(row.workId));
    if (!bySource && !byWork) return row;
    const stoppedAt = latest(bySource ? stoppedSources.get(row.sourceMessageId!) : undefined, byWork ? cancelledWorks.get(row.workId!) : undefined);
    return { ...row, stopped: true, ...(stoppedAt ? { stoppedAt } : {}) };
  });
  const built = { ...input, operations: operationsWithStops, roles };
  const stoppedSince = careerApplicationStoppedSince(built);
  if (!stoppedSince) return buildCareerApplicationProgress(built);
  // The person's messages since that name an opportunity; one a later Stop ended asked for nothing that went on.
  const requests: ApplicationRequestRow[] = rows<{ id: number | string; createdAt: string; content?: string | null }>(
    await db.from("talent_messages")
      .select("id,createdAt:created_at,content")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .eq("role", "user")
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
