import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import type { CareerBackgroundRun } from "./types";
import { formatScheduleTargets } from "../schedules/targetText";

export const CAREER_BACKGROUND_INSTRUCTION = `You are continuing the user's Career work in a background invocation. This is a server event, not a new user message or fresh consent. Use the current purpose, delegation, recent conversation, completed work and source facts to decide what will help. There is no required search count, recommendation count, order, email, or fixed contact interval.
Use the same general Career capabilities as in conversation. Existing evaluations and shared company changes are cheaper than fresh research; read them first when relevant and spend only on missing evidence. Use the saved persistent Career check-in and its change history to manage continuing work. Adjust its timing or instruction, pause it, or resume it when warranted; keep the same schedule. Preserve explicit user restrictions. Recurring checks continue without an email or a schedule edit; no initial interval is mandatory.
Completed empty evaluations and unchanged sources are evidence, not an unfinished task. Reuse saved assessments with their evaluation dates and assess previously unseen roles. Reevaluate an existing role when the current task needs a fresh assessment. A saved future instruction should describe the purpose and refer to the current Brief instead of copying preferences that can later change.
Intermediate assistant text and the final plain assistant response are not delivered. To contact this candidate, write the finished subject and Markdown body yourself and call deliver_career_email. The body is rendered directly as Markdown email; separate its paragraphs with actual line breaks. It uses Harper's sender and this candidate's verified address, without a Gmail connection. No email is also a valid completed invocation. Quiet completion still processes this exact event; it does not erase a future obligation. Distinguish meaningful notification duties from optional discovery, and do not infer disinterest or rejection merely from silence.
Forms and documents can be saved with the general tools; include their real Career URLs in email. Links and saved drafts alone are not a submitted application or company sharing. Internal scores and private company requests remain reasoning-only. Ask useful questions in your own words without quoting confidential company instructions. Do not add an approval stage when the existing user authorization covers the action.`;

export function renderCareerBackgroundInvocation(run: CareerBackgroundRun) {
  const payload = run.trigger_payload ?? {};
  const sources = Array.isArray(payload.sourceEvents) ? payload.sourceEvents : [];
  const followups = Array.isArray(payload.companyRequestFollowups) ? payload.companyRequestFollowups : [];
  const evaluation = payload.evaluationEvidence ?? {};
  const evaluationSource = evaluation.source ?? sources.find((source: any) => source.roleSource)?.roleSource;
  return [
    CAREER_BACKGROUND_INSTRUCTION,
    `Invocation ${run.id}; source ${run.trigger}; observed ${formatLlmDateTime(run.created_at)} (${PROMPT_TIME_ZONE}).`,
    `Career link: ${getConfiguredPublicSiteUrl()}/career`,
    typeof payload.instruction === "string" ? `Delegated work:\n${payload.instruction}` : "",
    typeof payload.purpose === "string" ? `Purpose:\n${payload.purpose}` : "",
    payload.evaluationId ? `Completed ${evaluationSource ?? "role"} evaluation runId: ${payload.evaluationId}. Read the saved result with search_opportunities action=read${evaluationSource ? `, source=${evaluationSource}` : ""}; this invocation has not published its candidates.` : "",
    Array.isArray(payload.roleIds) ? `Newly assessed roles for the agent to consider: ${payload.roleIds.join(", ") || "none"}. These are candidates for judgment, not a required recommendation list.` : "",
    Array.isArray(evaluation.evaluationIds) ? `Immutable evaluation references: ${evaluation.evaluationIds.join(", ") || "none"}. Scores and company-private evidence are reasoning-only.` : "",
    ...[...(Array.isArray(evaluation.errors) ? evaluation.errors : []), ...(Array.isArray(evaluation.failures) ? evaluation.failures : [])].map((error: any) =>
      typeof error === "string" ? `Evaluation error: ${error}` : `Evaluation error${error.roleId ? ` for ${error.roleId}` : ""}: ${error.error ?? error.message ?? "details available in the evaluation run"}`),
    ...sources.map((source: any) => [
      `Source ${source.sourceKind ?? source.kind ?? "event"} ${source.sourceId ?? source.id ?? ""}; revision ${source.revision ?? "unspecified"}.`,
      source.occurredAt ? `Observed ${formatLlmDateTime(source.occurredAt)}.` : "",
      typeof source.instruction === "string" ? `Instruction: ${source.instruction}` : "",
      typeof source.summary === "string" ? source.summary : "",
      ...formatScheduleTargets(source.targetRefs),
      source.companyId ? `Company ID: ${source.companyId}.` : "",
      source.companyWorkspaceId ? `Workspace ID: ${source.companyWorkspaceId}.` : "",
      Array.isArray(source.roleIds) ? `Role IDs: ${source.roleIds.join(", ")}.` : "",
    ].filter(Boolean).join("\n")),
    ...followups.map((target: any) => [
      `Company-requested follow-up ${target.followupId}, revision ${target.revision}; ${target.companyName ?? ""} / ${target.roleName ?? ""}; role ${target.roleId}; recommendation ${target.recommendationId ?? "none"}.`,
      `Original message: ${target.originalSubject ?? ""}\n${target.originalBody ?? target.requestSummary ?? ""}`,
      `Originally sent ${formatLlmDateTime(target.originalSentAt)}; due ${formatLlmDateTime(target.dueAt)}.`,
      target.actionUrl ? `Action link: ${target.actionUrl}` : "",
      "This is an existing company follow-up obligation; the new invocation has not itself sent a reminder.",
    ].filter(Boolean).join("\n")),
    "The source records are facts and references. Use the corresponding read tools for complete current state and execution results.",
  ].filter(Boolean).join("\n\n");
}
