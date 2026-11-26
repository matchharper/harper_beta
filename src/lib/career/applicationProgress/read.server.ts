import {
  buildCareerApplicationProgress,
  careerApplicationRoleIds,
  CAREER_APPLICATION_WINDOW_MS,
  type ApplicationMessageRow,
  type ApplicationOpenForm,
  type ApplicationOperationRow,
  type ApplicationRoleRow,
} from "./build";
import type { CareerApplicationProgress } from "./types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

type Result = { data: unknown; error: { message?: string } | null };

// Bounds for one conversation's week (11/26: at most 43 forms, 66 answers and 125 browser/send operations).
const MESSAGE_LIMIT = 400;
const OPERATION_LIMIT = 300;

/** Role statuses that mean the posting takes no applications (the same set as browser/postingCheck.ts). */
const ENDED_ROLE_STATUSES = new Set(["archived", "closed", "deleted", "ended", "expired", "inactive"]);

const rows = <T>(result: Result, what: string): T[] => {
  if (result.error) throw new Error(`${what} unavailable: ${result.error.message ?? "unknown error"}`);
  return Array.isArray(result.data) ? (result.data as T[]) : [];
};

/**
 * Reads the durable records of this conversation's applications for the polled work status: forms with their
 * answers, browser runs and sessions, and sends, each limited to the last 7 days and to the JSON paths the builder
 * reads (form items and run reports can be hundreds of KB). Then names the roles. Three queries in all; throws on a
 * failed read so the caller can leave the list empty.
 */
export async function readCareerApplicationProgress(args: {
  admin: Pick<TalentAdminClient, "from">;
  userId: string;
  conversationId: string;
  /** read_open_career_forms rows, already read by the route. */
  openForms: PromiseLike<ApplicationOpenForm[]>;
  /** When Harper's running turn here started (null when none runs), from the route's own invocation read. */
  turnStartedAt: PromiseLike<string | null>;
  now?: Date;
}): Promise<CareerApplicationProgress[]> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - CAREER_APPLICATION_WINDOW_MS).toISOString();
  // Selected JSON paths are not in the generated table types.
  const db = args.admin as unknown as { from: (table: string) => any };
  const [messages, operations, openForms, turnStartedAt]: [Result, Result, ApplicationOpenForm[], string | null] = await Promise.all([
    db.from("talent_messages")
      .select("messageType:message_type,createdAt:created_at,formId:payload->formId,revision:payload->revision,kind:payload->>kind,hidden:payload->hidden,relatedRefs:payload->relatedRefs,itemId:payload->>itemId,actionId:payload->>actionId,negativeActionId:payload->formSnapshot->negative->>id,submitScope:payload->values->submit_scope,saveLogin:payload->values->save_login,postings:payload->values->apply_postings")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .in("message_type", ["career_form", "career_form_response", "career_form_resolution"])
      .gte("created_at", since)
      // A batch answer's own row only lists the per-form rows saved with it.
      .not("payload->formId", "is", null)
      .order("id", { ascending: false })
      .limit(MESSAGE_LIMIT),
    db.from("talent_external_operations")
      .select("id,kind,parentId:parent_id,status,createdAt:created_at,updatedAt:updated_at,mode:request->>mode,roleRefs:request->role_refs,startUrl:request->>url,opportunityId:request->>opportunity_id,needsUser:result->needsUser,submitted:result->>submitted,verificationCode:result->>verificationCode,url:result->>url,requestedAction:result->>requested_action,browserAvailability:result->>browser_availability")
      .eq("user_id", args.userId)
      .eq("conversation_id", args.conversationId)
      .in("kind", ["browser_session", "browser_run", "email_send"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(OPERATION_LIMIT),
    args.openForms,
    args.turnStartedAt,
  ]);
  const input = {
    now,
    messages: rows<ApplicationMessageRow>(messages, "Application forms"),
    operations: rows<ApplicationOperationRow>(operations, "Application operations"),
    openForms,
    turnStartedAt,
  };
  const roleIds = careerApplicationRoleIds(input);
  const roles: ApplicationRoleRow[] = roleIds.length
    ? rows<{ role_id: string; name: string | null; status: string | null; is_expired: boolean | null; company_workspace?: { company_name?: string | null } | null }>(
      await db.from("company_roles")
        .select("role_id,name,status,is_expired,company_workspace:company_workspace_id(company_name)")
        .in("role_id", roleIds)
        .limit(roleIds.length), "Application roles")
      .map((role) => ({
        roleId: role.role_id,
        companyName: role.company_workspace?.company_name?.trim() || null,
        title: role.name?.trim() || null,
        ended: role.is_expired === true || ENDED_ROLE_STATUSES.has(String(role.status ?? "").toLowerCase()),
      }))
    : [];
  return buildCareerApplicationProgress({ ...input, roles });
}
