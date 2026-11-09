import { buildOnboardingCompletionHandoffInstruction } from "../prompts/postOnboardingGuide";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import type { CareerBackgroundRun } from "./types";
import { formatScheduleTargets } from "../schedules/targetText";

export const CAREER_BACKGROUND_INSTRUCTION = `You are continuing the user's Career work in a background invocation. This is a server event, not a new user message or fresh consent. Use the current purpose, delegation, recent conversation, completed work and source facts to decide what will help. There is no required search count, recommendation count, order, email, or fixed contact interval.
Use the same general Career capabilities as in conversation. Existing external-role evaluations and shared company changes are cheaper than fresh research; read them first when relevant and spend only on missing evidence. Work only from these actual sources and existing delegation. The daily batch combines nonurgent progress changes, talent-first proposals, due follow-ups and today’s actual appointments; ordinary company-agent correspondence runs immediately. Handle related facts together and use one useful candidate contact when appropriate. An opted-in external discovery schedule is separate and is disabled by stopped or external recommendations off. Do not create or resume a generic recurring check to look for something to do. Reserve future work only for a concrete purpose; refer to the current source records. Preserve explicit user restrictions.
Completed empty external searches and unchanged sources are evidence, not an unfinished task. Reuse saved external-role assessments with their evaluation dates and evaluate external roles when the current task needs it. A saved future instruction should describe the purpose and refer to the current Brief instead of copying preferences that can later change.
Intermediate assistant text and the final plain assistant response are not delivered. To contact this candidate, write the finished message yourself and call contact_user for their chat or email; deliver_career_email remains the email adapter. The body is rendered directly as Markdown email; separate its paragraphs with actual line breaks. It uses Harper's sender and this candidate's verified address, without a Gmail connection. Delivered email is also saved in Career history, so a separate chat copy is unnecessary. No email is also a valid completed invocation. Quiet completion records review of these exact source revisions. If a necessary notification or follow-up remains for later, save a concrete future reservation before finishing; do not silently drop it or restart an idle recurring check. A closure already communicated or reversed needs no second notice. Company rejection notes are private reasoning context, not authorized text to pass to the candidate. Distinguish meaningful notification duties from optional discovery, and do not infer disinterest or rejection merely from silence.
Forms and documents can be saved with the general tools; include their real Career URLs in email. Links and saved drafts alone are not a submitted application or company sharing. Ask useful questions in your own words without quoting confidential company instructions. Do not add an approval stage when the existing user authorization covers the action.`;

export function renderCareerBackgroundInvocation(run: CareerBackgroundRun) {
  if (run.trigger === "conversation_completed") return [
    buildOnboardingCompletionHandoffInstruction(),
    "This is a server continuation of the completed onboarding, not a new user message or new consent. Continue in the same conversation; your final response is delivered to this chat. No separate start email is required.",
  ].join("\n\n");
  const payload = run.trigger_payload ?? {};
  const sources = Array.isArray(payload.sourceEvents) ? payload.sourceEvents : [];
  const followups = Array.isArray(payload.companyRequestFollowups) ? payload.companyRequestFollowups : [];
  const evaluation = payload.evaluationEvidence ?? {};
  const evaluationSource = evaluation.source ?? sources.find((source: any) => source.roleSource)?.roleSource;
  const isExternalEvaluation = evaluationSource === "external";
  const isInternalFollowWake = run.trigger === "career_company_follow_changed" && !isExternalEvaluation;
  return [
    CAREER_BACKGROUND_INSTRUCTION,
    `Invocation ${run.id}; source ${run.trigger}; observed ${formatLlmDateTime(run.created_at)} (${PROMPT_TIME_ZONE}).`,
    `Career link: ${getConfiguredPublicSiteUrl()}/career`,
    !isInternalFollowWake && typeof payload.instruction === "string" ? `Delegated work:\n${payload.instruction}` : "",
    typeof payload.purpose === "string" ? `Purpose:\n${payload.purpose}` : "",
    isExternalEvaluation && payload.evaluationId ? `Completed ${evaluationSource ?? "role"} evaluation runId: ${payload.evaluationId}. Read the saved result with search_opportunities action=read${evaluationSource ? `, source=${evaluationSource}` : ""}; this invocation has not published its candidates.` : "",
    !isInternalFollowWake && Array.isArray(payload.roleIds) ? `Roles referenced by this event: ${payload.roleIds.join(", ") || "none"}. The event does not itself authorize a new internal recommendation.` : "",
    isExternalEvaluation && Array.isArray(evaluation.evaluationIds) ? `Immutable evaluation references: ${evaluation.evaluationIds.join(", ") || "none"}. Scores and company-private evidence are reasoning-only.` : "",
    ...(isExternalEvaluation ? [...(Array.isArray(evaluation.errors) ? evaluation.errors : []), ...(Array.isArray(evaluation.failures) ? evaluation.failures : [])] : []).map((error: any) =>
      typeof error === "string" ? `Evaluation error: ${error}` : `Evaluation error${error.roleId ? ` for ${error.roleId}` : ""}: ${error.error ?? error.message ?? "details available in the evaluation run"}`),
    ...sources.map((source: any) => [
      `Source ${source.sourceKind ?? source.kind ?? "event"} ${source.sourceId ?? source.id ?? ""}; revision ${source.revision ?? "unspecified"}.`,
      source.occurredAt ? `Observed ${formatLlmDateTime(source.occurredAt)}.` : "",
      typeof source.instruction === "string" ? `Instruction: ${source.instruction}` : "",
      typeof source.summary === "string" ? source.summary : "",
      ...formatScheduleTargets(source.targetRefs),
      source.dailySourceId ? `Pending source ID: ${source.dailySourceId}. When your message covers this source, include this ID in contact_user/deliver_career_email sourceIds so delivery records only the updates actually communicated.` : "",
      source.recommendationId ? `Existing recommendation: ${source.recommendationId}.` : "",
      source.companyId ? `Company ID: ${source.companyId}.` : "",
      source.companyWorkspaceId ? `Workspace ID: ${source.companyWorkspaceId}.` : "",
      source.sourceKind === "agent_contact" ? `Agent introduction ${source.rootId}; Role ${source.roleId}. Incoming message ${source.sourceId}. Relevant correspondence and shared snapshots follow. This is an immediate message from the company's agent, not new candidate consent.` : "",
      (source.sourceKind !== "company_follow" || source.roleSource === "external") && Array.isArray(source.roleIds) ? `Role IDs: ${source.roleIds.join(", ")}.` : "",
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
