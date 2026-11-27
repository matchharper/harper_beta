import { buildCareerEntryHandoffInstruction } from "../prompts/postOnboardingGuide";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import type { CareerBackgroundRun } from "./types";
import { formatScheduleTargets } from "../schedules/targetText";
import { isScheduledCareerRun } from "./scheduledModel";
import { CAREER_REPLY_UNSEEN_TRIGGER, readUnseenReply } from "./unseenReply";
import { CAREER_FORM_UNANSWERED_TRIGGER, readUnansweredForms } from "./unansweredForm";
import { formatCareerFormForModel } from "../forms/format";

export const CAREER_BACKGROUND_INSTRUCTION = `You are continuing the user's Career work in a background invocation. This is a server event, not a new user message or fresh consent. Use the current purpose, delegation, recent conversation, completed work and source facts to decide what will help. There is no required search count, recommendation count, order, email, or fixed contact interval.
Use the same general Career capabilities as in conversation. Existing external-role evaluations and shared company changes are cheaper than fresh research; read them first when relevant and spend only on missing evidence. Work only from these actual sources and existing delegation. The daily batch combines nonurgent progress changes, talent-first proposals, due follow-ups and today’s actual appointments; ordinary company-agent correspondence runs immediately. Handle related facts together and use one useful candidate contact when appropriate. An external discovery schedule is separate and is disabled by stopped or external recommendations off. Do not create or resume a generic recurring check to look for something to do. Reserve future work only for a concrete purpose; refer to the current source records. Preserve explicit user restrictions.
Completed empty external searches and unchanged sources are evidence, not an unfinished task. Reuse saved external-role assessments with their evaluation dates and evaluate external roles when the current task needs it. A saved future instruction should describe the purpose and refer to the current Brief instead of copying preferences that can later change.
Intermediate assistant text and the final plain assistant response are not delivered. For a followed company or a reservation, the final text is kept as what this run concluded, and the next run for it starts from that. To contact this candidate, write the finished message yourself and call contact_user for their chat or email; deliver_career_email remains the email adapter. The body is rendered directly as Markdown email; separate its paragraphs with actual line breaks. It uses Harper's sender and this candidate's verified address, without a Gmail connection. A choice-button block after a question becomes email buttons: each opens the candidate's reply, or Harper chat on the web, with that choice filled in for them to send. Delivered email is also saved in Career history, so a separate chat copy is unnecessary. No email is also a valid completed invocation. Quiet completion records review of these exact source revisions. If a necessary notification or follow-up remains for later, save a concrete future reservation before finishing; do not silently drop it or restart an idle recurring check. A closure already communicated or reversed needs no second notice. Company rejection notes are private reasoning context, not authorized text to pass to the candidate. Distinguish meaningful notification duties from optional discovery, and do not infer disinterest or rejection merely from silence.
Forms and documents can be saved with the general tools; include their real Career URLs in email. Links and saved drafts alone are not a submitted application or company sharing. Ask useful questions in your own words without quoting confidential company instructions. Do not add an approval stage when the existing user authorization covers the action.`;

export const GMAIL_CONNECTED_APPLICATION_EVENT = "Gmail read access was connected.";

export function formatCareerApplicationEvent(content: string) {
  return `Application event (not a user-authored message or new authorization):\n\n${content}`;
}

export function renderCareerBackgroundInvocation(run: CareerBackgroundRun) {
  if (run.trigger === "gmail_connected") return "The candidate has connected Gmail with read access. Use the inbox to learn what matters for this person’s career, guided by this conversation, what their private records already contain, and what is still unknown. Mail may document their work, studies and contributions as well as active applications and upcoming decisions. Choose relevant sources and save supported findings where future Career work can use them. Your final response goes to this chat. This event is not a user message or authorization to send or apply.";
  if (run.trigger === "conversation_completed") return buildCareerEntryHandoffInstruction();
  if (run.trigger === CAREER_REPLY_UNSEEN_TRIGGER) {
    const completedAt = readUnseenReply(run)?.completedAt;
    return [
      CAREER_BACKGROUND_INSTRUCTION,
      `Background event: ${run.trigger}; observed ${formatLlmDateTime(run.created_at)} (${PROMPT_TIME_ZONE}).`,
      `Career link: ${getConfiguredPublicSiteUrl()}/career`,
      `Your latest reply in this conversation${completedAt ? `, completed ${formatLlmDateTime(completedAt)}` : ""}, has not been displayed on a visible Career page, the candidate has since closed Harper, and they have not written again. Email can bring it to them outside Career; whether it is worth an email is your decision. The reply is already in their chat, so another chat message would repeat it. This event is not a user message or a request for new work.`,
    ].join("\n\n");
  }
  if (run.trigger === CAREER_FORM_UNANSWERED_TRIGGER) {
    const forms = readUnansweredForms(run);
    const seenAt = run.trigger_payload?.chatSeenAt;
    const leftAt = run.trigger_payload?.leftAt;
    return [
      CAREER_BACKGROUND_INSTRUCTION,
      `Background event: ${run.trigger}; observed ${formatLlmDateTime(run.created_at)} (${PROMPT_TIME_ZONE}).`,
      `Career link: ${getConfiguredPublicSiteUrl()}/career`,
      `The candidate saw ${forms.length === 1 ? "this application form" : "these application forms"} in their Career chat${typeof seenAt === "string" ? ` (last viewed ${formatLlmDateTime(seenAt)})` : ""}, has since closed Harper without answering${typeof leftAt === "string" ? ` (closed ${formatLlmDateTime(leftAt)})` : ""}, and has not written again. Nothing is submitted until they answer. Email can bring the questions to them outside Career; whether it is worth an email is your decision. If you email, include each question they still need to answer exactly as the form words it, and say that they can answer by replying to this email or in Career through the link, and that nothing is submitted before they do. The forms are already in their chat, so another chat message would repeat them. This event is not a user message, consent, or a request for new work.`,
      ...forms.map(item => [formatCareerFormForModel(item.form), item.createdAt ? `Waiting since ${formatLlmDateTime(item.createdAt)}.` : ""].filter(Boolean).join("\n")),
    ].join("\n\n");
  }
  const payload = run.trigger_payload ?? {};
  const sources = Array.isArray(payload.sourceEvents) ? payload.sourceEvents : [];
  const followups = Array.isArray(payload.companyRequestFollowups) ? payload.companyRequestFollowups : [];
  const evaluation = payload.evaluationEvidence ?? {};
  const evaluationSource = evaluation.source ?? sources.find((source: any) => source.roleSource)?.roleSource;
  const isExternalEvaluation = evaluationSource === "external";
  const isInternalFollowWake = run.trigger === "career_company_follow_changed" && !isExternalEvaluation;
  const scheduledWork = isScheduledCareerRun(run);
  return [
    scheduledWork ? "" : CAREER_BACKGROUND_INSTRUCTION,
    `Background event: ${run.trigger}; observed ${formatLlmDateTime(run.created_at)} (${PROMPT_TIME_ZONE}).`,
    `Career link: ${getConfiguredPublicSiteUrl()}/career`,
    !isInternalFollowWake && typeof payload.instruction === "string" ? `Delegated work:\n${payload.instruction}` : "",
    typeof payload.purpose === "string" ? `Purpose:\n${payload.purpose}` : "",
    isExternalEvaluation && payload.evaluationId ? `Completed external evaluation runId: ${payload.evaluationId}. Read the saved result with search_opportunities action=read; this invocation has not published its candidates.` : "",
    !isInternalFollowWake && Array.isArray(payload.roleIds) ? `Roles referenced by this event: ${payload.roleIds.join(", ") || "none"}. The event does not itself authorize a new internal recommendation.` : "",
    ...(isExternalEvaluation ? [...(Array.isArray(evaluation.errors) ? evaluation.errors : []), ...(Array.isArray(evaluation.failures) ? evaluation.failures : [])] : []).map((error: any) =>
      typeof error === "string" ? `Evaluation error: ${error}` : `Evaluation error${error.roleId ? ` for ${error.roleId}` : ""}: ${error.error ?? error.message ?? "details available in the evaluation run"}`),
    sources.some(source => source.dailySourceId) ? "" : "Pending daily updates for delivery: none.",
    ...sources.map((source: any) => [
      [`${source.sourceKind ?? source.kind ?? "Event"} reference: ${source.sourceId ?? source.id ?? "unavailable"}`,
        source.revision != null ? `revision ${source.revision}` : ""].filter(Boolean).join("; "),
      source.occurredAt ? `Observed ${formatLlmDateTime(source.occurredAt)}.` : "",
      typeof source.instruction === "string" ? `Instruction: ${source.instruction}` : "",
      // This source summary is collector-generated, not company-authored copy.
      // Describe the actual proposal origin without exposing its selector agent.
      scheduledWork && source.sourceKind === "talent_selection"
        ? "Harper identified this Role as a potential opportunity for the candidate. Read its current public facts and the candidate context to decide whether to propose it. This is a Harper-origin recommendation source; any company introduction request is recorded separately."
        : typeof source.summary === "string" ? source.summary : "",
      ...formatScheduleTargets(source.targetRefs),
      source.sourceKind === "public_discovery" ? `Changed public resources: ${JSON.stringify(source.resourceRefs ?? [])}. These are retrieval candidates for the active delegated search; they are not personal recommendations or permission to contact anyone.` : "",
      source.dailySourceId ? `Delivery sourceIds entry for this update: ${source.dailySourceId}.` : "",
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
