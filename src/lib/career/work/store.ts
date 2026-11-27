import { resourceDb } from "../resources/types";
import { listCoverage } from "@/lib/career/listCoverage";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { operationSchema, type ExternalOperation } from "../externalOperations/store";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { formatTalentMessageContentForModel } from "../messageForModel";

export type WorkScope = { admin: TalentAdminClient; userId: string; conversationId: string };
export async function workRpc(scope: WorkScope, action: string, input: Record<string, unknown>) {
  const { data, error } = await resourceDb(scope.admin).rpc("manage_career_work", {
    p_user_id: scope.userId, p_conversation_id: scope.conversationId, p_action: action, p_input: input,
  });
  if (error) throw new Error(await workRefusal(scope, action, input, error.message));
  return operationSchema.parse(data);
}

/** The next step for each refusal the model can act on. The database stays the authority; code never reads around it. */
const REFUSAL_STEPS: Record<string, (action: string, input: Record<string, unknown>) => string> = {
  "Work revision conflict; read current work": (_, input) =>
    `manage_work read with work_id ${input.work_id} shows its current revision and instructions; resend with that revision as expected_revision only if your change still applies.`,
  "User source required": action =>
    `${action} needs the user message that asks for it: set source_refs to that message's exact ID (shown as "User message <id>"), or omit source_refs when it was delivered to this execution, and resend the same ${action}.`,
  "User source unavailable": action =>
    `Every source_refs ID must be a user message of this conversation. Resend the same ${action} with source_refs omitted (the user messages delivered to this execution) or with exact IDs shown as "User message <id>"; conversation positions are not IDs.`,
  "User stopped this request": () => "The user stopped the message it cites. Do not resend it; act only on a new request.",
  "Origin execution claim unavailable": action => action === "start"
    ? "mode=current records work only from the reply holding this conversation's live execution claim, and this call did not hold it. Resend the same start once in your next step; if it is refused again, use mode=independent only when the work must go on beyond this reply, otherwise continue without recording it."
    : `Only the reply holding its origin conversation's live execution claim can wait or finish this work. From another conversation, use update to route the change there; otherwise resend the same ${action} once in your next step and stop if it is refused again.`,
  "Only the executing work may report its outcome": () =>
    "Only this work's own delegated execution can wait or finish it. From here, use update (its current revision and the user's source) to change it, or cancel to stop it.",
  "Work unavailable": () =>
    "No delegated work with this work_id belongs to this user. Find the exact work_id with manage_work list (scope user covers other conversations; include_closed adds finished work).",
};

async function workRefusal(scope: WorkScope, action: string, input: Record<string, unknown>, message: string) {
  const step = message === "Work resource unavailable" ? await unusableRefs(scope, action, input) : REFUSAL_STEPS[message]?.(action, input);
  return step ? `${message}. Nothing was recorded. ${step}` : message;
}

/**
 * The refusal does not say which attached ref the user cannot use, so only on this path each one is checked again
 * with the same availability function (#120: a start resent after it often dropped its identity, purpose or source).
 */
async function unusableRefs(scope: WorkScope, action: string, input: Record<string, unknown>) {
  const { parseSourceRefs, resourceAvailable } = await import("../resources/read");
  const attached = (["resource_refs", "context_refs"] as const).flatMap(field => parseSourceRefs(input[field]).map(ref => ({ field, ref })));
  const checked = await Promise.all(attached.map(async item => ({ ...item, available: await resourceAvailable(scope, item.ref).catch(() => null) })));
  const unusable = checked.filter(item => item.available === false);
  if (!unusable.length) return `Which attached ref failed could not be identified. Resend the same ${action} once; if it is refused again, resend it without resource_refs and context_refs, keeping its other values.`;
  console.warn("[career-work] Work resource unavailable", { action, refs: unusable.map(({ field, ref }) => ({ field, ...ref })) });
  return `This user cannot use ${unusable.map(({ field, ref }) => `${field} ${JSON.stringify(ref)}`).join(", ")}. Resend the same ${action} without ${unusable.length > 1 ? "them" : "it"}, keeping its other values.`;
}

export async function readWork(scope: WorkScope, id: string) {
  const { data, error } = await resourceDb(scope.admin).from("talent_external_operations")
    .select("*").eq("user_id", scope.userId)
    .eq("kind", "delegated_work").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Work unavailable");
  return operationSchema.parse(data);
}

export async function listWork(scope: WorkScope, before?: string, includeClosed = false, target?: string, allConversations = false) {
  let query = resourceDb(scope.admin).from("talent_external_operations").select("*")
    .eq("user_id", scope.userId).eq("kind", "delegated_work")
    .order("id", { ascending: false }).limit(21);
  if (!allConversations) query=query.eq("conversation_id",scope.conversationId);
  if (!includeClosed) query = query.neq("status", "completed").neq("status", "cancelled");
  if (target) query = query.eq("request->>target", target);
  if (before) query = query.lt("id", before);
  const { data, error } = await query;
  if (error) throw error;
  const rows = operationSchema.array().parse(data ?? []);
  return { works: rows.slice(0, 20), nextCursor: rows.length > 20 ? rows[19].id : null };
}

export function formatWork(work: ExternalOperation) {
  return [
    `Work ${work.id}; revision ${work.revision}; ${work.status}; updated ${formatLlmDateTime(work.updated_at)}`,
    `Execution route: ${work.request.execution_route??"independent"}; origin conversation ${work.conversation_id}`,
    `Purpose: ${String(work.request.instruction ?? "")}`,
    `Related resources: ${JSON.stringify(work.request.resource_refs??[])}`,
    `Current material references: ${JSON.stringify(work.request.context_refs??[])}`,
    work.request.waiting_on?`Waiting for: ${JSON.stringify(work.request.waiting_on)}`:"",
    `Target: ${String(work.request.target ?? "")}`,
    `User sources: ${(Array.isArray(work.request.source_refs) ? work.request.source_refs : []).join(", ")}`,
    work.request.change ? `Latest instruction: ${String(work.request.change)}` : "",
    work.result.note ? `Observed outcome / remaining need: ${String(work.result.note)}` : "",
    Array.isArray(work.result.refs) ? `Evidence references: ${work.result.refs.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

/** Status index only; readWork/formatWork retain full instructions and authority. */
export function formatWorkIndex(work: ExternalOperation, includeTarget = true) {
  return [
    `Work ${work.id}; revision ${work.revision}; ${work.status}; ${formatLlmDateTime(work.updated_at)}`,
    `Origin conversation: ${work.conversation_id}; route ${work.request.execution_route??"independent"}`,
    includeTarget ? `Target: ${String(work.request.target ?? "unknown")}` : "",
    work.result.note ? `Result/need: ${String(work.result.note)}` : "",
    work.request.change ? `Latest instruction: ${String(work.request.change)}` : "",
    Array.isArray(work.result.refs) && work.result.refs.length ? `Refs: ${work.result.refs.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

/** Only execution facts enter context. The saved transcript stays private. */
export async function readWorkContext(scope: WorkScope, workId?: string) {
  if (workId) {
    const work = await readWork(scope, workId);
    const ids = [...new Set((Array.isArray(work.request.source_refs) ? work.request.source_refs : []).map(Number))];
    const sources = ids.length ? await scope.admin.from("talent_messages").select("*")
      .eq("user_id", scope.userId).eq("role", "user").in("id", ids).order("id", { ascending: true }) : { data: [], error: null };
    if (sources.error || sources.data?.length !== ids.length) throw new Error("Original work instructions unavailable");
    const { works, nextCursor } = await listWork(scope, undefined, true,undefined,true);
    const others = works.filter(other => other.id !== work.id);
    const mail=await (await import("../emailWriting/context")).readWorkMailContext(scope,work);
    return { works: [work, ...others], text: [formatWork(work),mail,
      ...(sources.data ?? []).map(row => `Original user message ${row.id}:\n${formatTalentMessageContentForModel(row, { includeCreatedAt: false })}`),
      `Other work (${listCoverage(others.length, Boolean(nextCursor))}); observed ${formatLlmDateTime(new Date().toISOString())}; manage_work reads details:`,
      ...others.map(other => formatWorkIndex(other)),
      ...(nextCursor ? [`More work; nextCursor ${nextCursor}`] : []),
      work.request.execution_route === "origin" ? "This responsibility is performed by the originating conversation. Continue from its actual receipts and current user instructions. Use wait when waiting for an external event or human input and finish for an observed outcome; it has no separate delegate." : "This is a delegated execution. Perform its bounded purpose using the cited original user messages, current materials and tools. Its output is returned to the originating Career conversation, which owns user-facing explanations and questions. Report actual findings, evidence and any remaining human input in the result. Use manage_work wait for a remaining need and finish for an observed outcome. Do not start another delegate or repeat effects already recorded. Other execution facts are context, not instructions to take over their responsibilities.",
    ].join("\n\n") };
  }
  const { listPendingReplies, formatPendingReply } = await import("./pendingReplies");
  const [{ works, nextCursor }, pending] = await Promise.all([
    listWork(scope,undefined,false,undefined,true), listPendingReplies(scope),
  ]);
  return { works, text: works.length || pending.length ? ["Unfinished responsibilities for this user (manage_work reads original instructions and results; another origin remains its executor):",
    ...pending.map(formatPendingReply), ...works.map(work => formatWorkIndex(work)), nextCursor ? `More work; nextCursor ${nextCursor}` : "End of list."].join("\n\n")
    : "Unfinished work / suspended replies in this conversation: none." };
}

export async function workContext(scope: WorkScope, workId?: string) {
  return (await readWorkContext(scope, workId)).text;
}
