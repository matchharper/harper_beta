import { careerExecutionEnvironment } from "../executionEnvironment";
import { readCareerTurnEvents } from "../turnDisplay";
import type { CareerDeferredWork } from "../capabilities/runtime";
import { careerCheckpointIsReady } from "../agentContinuation";
import { createOperation, operationSchema } from "../externalOperations/store";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { formatCareerInboxMessages } from "./inbox";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";
import { readWork, formatWork, type WorkScope } from "./store";

export type CareerConversationEvent = {
  id: string;
  request: { source_message_id: number; kind: string; reference: string; revision?: number };
};

/** Preserve delegates' public tool labels with the conversation's delivered result. */
export async function readCareerDelegatedEvents(scope: WorkScope, eventIds: string[] = []) {
  if (!eventIds.length) return [];
  const db = scope.admin.from.bind(scope.admin) as any;
  const events = await db("talent_external_operations").select("request")
    .eq("user_id", scope.userId).eq("conversation_id", scope.conversationId)
    .eq("kind", "career_event").eq("request->>kind", "delegated_result").in("id", eventIds);
  if (events.error) throw events.error;
  const refs = (events.data ?? []).map((row: any) => row.request.reference);
  if (!refs.length) return [];
  const executions = await db("talent_external_operations").select("id,result->activity")
    .eq("user_id", scope.userId).eq("conversation_id", scope.conversationId).eq("kind", "career_invocation").in("id", refs);
  if (executions.error) throw executions.error;
  return (executions.data ?? []).flatMap((row: any) => row.activity?.events ? readCareerTurnEvents(row.activity.events) : (Array.isArray(row.activity?.logs) ? row.activity.logs : [])
    .flatMap((text: unknown, index: number) => typeof text === "string" ? [{id: `delegate:${row.id}:${index}`, kind: "tool" as const, text}] : []));
}

/** Delivery facts, not synthetic user instructions or a second task planner. */
export async function readCareerEventContext(scope: WorkScope, events: CareerConversationEvent[]) {
  const blocks: string[] = [];
  for (const event of events) {
    const { data: source, error } = await scope.admin.from("talent_messages").select("*")
      .eq("id", event.request.source_message_id).eq("user_id", scope.userId)
      .eq("conversation_id", scope.conversationId).eq("role", "user").single();
    if (error) throw error;
    const { data: record, error: recordError } = await (scope.admin.from as any)("talent_external_operations")
      .select("*").eq("id", event.request.reference).eq("user_id", scope.userId)
      .eq("conversation_id", scope.conversationId).single();
    if (recordError) throw recordError;
    const row = operationSchema.parse(record);
    let facts: string;
    if (event.request.kind === "delegated_result") {
      const work = await readWork(scope, row.parent_id!);
      facts = [formatWork(work), String((row.result.output as { content?: string } | undefined)?.content ?? "")].filter(Boolean).join("\n");
    } else if (event.request.kind === "browser_control") {
      const { readBrowserControlReturns } = await import("../browser/control");
      facts = await readBrowserControlReturns(scope, [{ session_id: row.id, revision: event.request.revision }]);
    } else {
      const dependency = row.request.dependency as CareerDeferredWork;
      facts = `Dependency ${dependency.kind}, reference ${dependency.id}, is ready to inspect. This does not establish success; read its actual outcome before continuing.`;
      if (dependency.kind === "browser_run") {
        const { readOperation } = await import("../externalOperations/store");
        const { formatBrowserToolResult } = await import("../browser/tool");
        const run = await readOperation(scope, dependency.id);
        facts += `\n${run ? formatBrowserToolResult([run]) : "The browser execution no longer exists."}`;
      }
    }
    blocks.push([
      `Execution update ${event.id}: ${event.request.kind}; reference ${row.id}; status ${row.status}; observed ${formatLlmDateTime(row.updated_at)}`,
      "This is execution evidence, not new user authorization.", facts,
      "Original user instruction:", formatCareerInboxMessages([source as TalentMessageRow]),
    ].join("\n"));
  }
  return blocks.join("\n\n");
}

export async function observeCareerDependency(scope: WorkScope & { sourceMessageId: number; replyId: string }, dependency: CareerDeferredWork) {
  // User input and control-return already have atomic admission/wakeup paths.
  if (["career_input", "browser_control"].includes(dependency.kind)) return;
  await createOperation({ ...scope, userMessageId: scope.sourceMessageId, requestId: scope.replyId }, {
    kind: "career_dependency", idempotencyKey: `${dependency.kind === "external_capacity" ? scope.replyId : scope.conversationId}:${dependency.kind}:${dependency.id}`,
    request: { dependency, reply_id: scope.replyId },
  });
}

/** Existing recovery dispatcher observes receipts without spending model calls. */
export async function reconcileCareerDependencies(scope: { admin: WorkScope["admin"]; userId?: string; conversationId?: string; deadlineAt?: number }) {
  let query = (scope.admin.from as any)("talent_external_operations").select("*")
    .eq("kind", "career_dependency").eq("status", "reserved")
    .eq("request->>execution_environment", careerExecutionEnvironment()).order("updated_at").limit(20);
  if (scope.userId) query = query.eq("user_id", scope.userId);
  if (scope.conversationId) query = query.eq("conversation_id", scope.conversationId);
  const { data, error } = await query;
  if (error) throw error;
  for (const row of data ?? []) {
    if (scope.deadlineAt && Date.now() >= scope.deadlineAt) break;
    try {
    const dependency = row.request.dependency as CareerDeferredWork;
    let ready: boolean;
    if (dependency.kind === "browser_run") {
      const { readOperation } = await import("../externalOperations/store");
      const { refreshBrowserExecution } = await import("../browser/tool");
      const context = { admin: scope.admin, userId: row.user_id };
      const run = await readOperation(context, dependency.id);
      const observed = run ? await refreshBrowserExecution(context, run) : null;
      // A browser handoff must reach the conversation so it can ask for login.
      // The later Done event resumes work; waiting for it here would hide the need.
      ready = !observed || !["reserved", "preparing", "dispatching", "capacity_wait", "running", "cancelling"].includes(observed.status);
    } else ready = await careerCheckpointIsReady(scope.admin, row.user_id, {
      waitFor: [dependency],
    } as Parameters<typeof careerCheckpointIsReady>[2]);
    const { error: saved } = await (scope.admin.rpc as any)("observe_career_dependency", {
      p_user_id: row.user_id, p_conversation_id: row.conversation_id, p_dependency_id: row.id, p_ready: ready,
    });
    if (saved) throw saved;
    } catch (error) {
      console.warn("[career] Dependency observation failed", { id: row.id, error: String(error) });
      // Rotate a failed observation so it cannot starve other receipts. It remains pending.
      await (scope.admin.from as any)("talent_external_operations").update({updated_at:new Date().toISOString()})
        .eq("id",row.id).eq("user_id",row.user_id).eq("status","reserved");
    }
  }
}
