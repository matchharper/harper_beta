import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { operationSchema, type ExternalOperation } from "../externalOperations/store";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { formatTalentMessageContentForLlmPrompt } from "../opportunityFeedbackNote";

export type WorkScope = { admin: TalentAdminClient; userId: string; conversationId: string };
export async function workRpc(scope: WorkScope, action: string, input: Record<string, unknown>) {
  const { data, error } = await (scope.admin.rpc as any)("manage_career_work", {
    p_user_id: scope.userId, p_conversation_id: scope.conversationId, p_action: action, p_input: input,
  });
  if (error) throw new Error(error.message);
  return operationSchema.parse(data);
}

export async function readWork(scope: WorkScope, id: string) {
  const { data, error } = await (scope.admin.from as any)("talent_external_operations")
    .select("*").eq("user_id", scope.userId).eq("conversation_id", scope.conversationId)
    .eq("kind", "delegated_work").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Work unavailable");
  return operationSchema.parse(data);
}

export async function listWork(scope: WorkScope, before?: string, includeClosed = false) {
  let query = (scope.admin.from as any)("talent_external_operations").select("*")
    .eq("user_id", scope.userId).eq("conversation_id", scope.conversationId).eq("kind", "delegated_work")
    .order("id", { ascending: false }).limit(21);
  if (!includeClosed) query = query.neq("status", "completed").neq("status", "cancelled");
  if (before) query = query.lt("id", before);
  const { data, error } = await query;
  if (error) throw error;
  const rows = operationSchema.array().parse(data ?? []);
  return { works: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
}

export function formatWork(work: ExternalOperation) {
  return [
    `Work ${work.id}; revision ${work.revision}; ${work.status}; updated ${formatLlmDateTime(work.updated_at)}`,
    `Purpose: ${String(work.request.instruction ?? "")}`,
    `Target: ${String(work.request.target ?? "")}`,
    `User sources: ${(Array.isArray(work.request.source_refs) ? work.request.source_refs : []).join(", ")}`,
    work.request.change ? `Latest instruction: ${String(work.request.change)}` : "",
    work.result.note ? `Observed outcome / remaining need: ${String(work.result.note)}` : "",
    Array.isArray(work.result.refs) ? `Evidence references: ${work.result.refs.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

/** Only execution facts enter context. The saved transcript stays private. */
export async function workContext(scope: WorkScope, workId?: string) {
  if (workId) {
    const work = await readWork(scope, workId);
    const ids = [...new Set((Array.isArray(work.request.source_refs) ? work.request.source_refs : []).map(Number))];
    const sources = ids.length ? await scope.admin.from("talent_messages").select("*")
      .eq("user_id", scope.userId).eq("role", "user").in("id", ids).order("id", { ascending: true }) : { data: [], error: null };
    if (sources.error || sources.data?.length !== ids.length) throw new Error("Original work instructions unavailable");
    const { works, nextCursor } = await listWork(scope, undefined, true);
    const others = works.filter(other => other.id !== work.id);
    return [formatWork(work),
      ...(sources.data ?? []).map(row => `Original user message ${row.id}:\n${formatTalentMessageContentForLlmPrompt(row, { includeCreatedAt: false })}`),
      ...(others.length ? [
        `Other work observed at ${formatLlmDateTime(new Date().toISOString())} (manage_work reads current details):`,
        ...others.map(other => `Work ${other.id}; target ${String(other.request.target ?? "")}; ${other.status}; updated ${formatLlmDateTime(other.updated_at)}${other.result.note ? `\nObserved outcome / remaining need: ${String(other.result.note)}` : ""}`),
        ...(nextCursor ? [`More work; nextCursor ${nextCursor}`] : []),
      ] : []),
      "This invocation executes this delegated work with the same Career tools and authority. Continue its purpose; read the cited original user messages and current materials. Do not delegate this same work again. Use manage_work wait when human input is needed, and finish only with the actual outcome. Other work and the conversation can continue independently.",
    ].join("\n\n");
  }
  const { works, nextCursor } = await listWork(scope);
  return works.length ? ["Delegated work index (manage_work reads exact details and further pages):",
    ...works.map(formatWork), ...(nextCursor ? [`More work; nextCursor ${nextCursor}`] : [])].join("\n\n") : "";
}
