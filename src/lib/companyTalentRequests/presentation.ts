import { isCompensationQuestion } from "@/lib/companyTalentRequests/policy";

type TalentPendingRequest = {
  expects_document: boolean;
  id: string;
  intent?: string | null;
  request_context: string;
  resume_stage?: string | null;
  role?: { name?: string | null } | null;
  workspace?: { company_name?: string | null } | null;
};

function normalizedText(value: unknown, maxLength = 800) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

const CANDIDATE_CONTACT_TRANSPORT_FOOTER =
  "If you have any issues, feedback, or want someone on the team to take a look, email chris@matchharper.com. Harper is still learning, so it can make mistakes or get details wrong.\n\nIf you would like to change how often Harper emails you or stop receiving emails entirely, just reply to this email.";

export function candidateContactBodyWithoutTransportFooter(value: unknown) {
  let body = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  while (body.endsWith(CANDIDATE_CONTACT_TRANSPORT_FOOTER)) {
    body = body.slice(0, -CANDIDATE_CONTACT_TRANSPORT_FOOTER.length).trimEnd();
  }
  return body;
}

export function serializeTalentPendingRequest(
  request: TalentPendingRequest | null
) {
  if (!request) return null;
  const company =
    normalizedText(request.workspace?.company_name, 160) || "채용 회사";
  const role = normalizedText(request.role?.name, 160) || "해당 역할";
  const requestContext = normalizedText(request.request_context, 800);
  if (request.intent === "candidate_reengagement") {
    return [
      "[Pending renewed-interest request — private system context]",
      `requestId: ${request.id}`,
      `company: ${company}`,
      `role: ${role}`,
      `intended next stage: ${normalizedText(request.resume_stage, 120) || "pending_connection"}`,
      `neutral question: ${requestContext}`,
      "Judge the meaning of only the latest user message. When it answers this request, call record_company_request_response with disposition=positive only for a clear renewed willingness, negative for a clear refusal, and other when the response answers but does not establish either.",
      "A positive answer normally reopens this Role, but a newer company stage change takes precedence. Follow the tool's assistantInstruction for the actual Position state. Negative or other keeps it closed. Never claim any result unless the tool returned ok=true in this turn.",
      "After ok=true, explain the actual result gently and say Harper will relay the answer to the company. Do not reveal request IDs or system wording.",
    ].join("\n");
  }
  if (request.expects_document) {
    return [
      "[Pending company resume request — private system context]",
      `requestId: ${request.id}`,
      `company: ${company}`,
      `role: ${role}`,
      "The company asked whether the talent can share a current resume.",
      "If the latest user message explicitly declines or says that no current resume is available, you MUST call record_company_request_response before the final reply. An upload is completed by the document service, never by a chat claim.",
      "Use only the latest user message as response evidence. Never say or imply that Harper accepted, saved, queued, relayed, shared, or delivered the response unless record_company_request_response returned ok=true in this turn.",
      "After ok=true, say only that Harper received the response and will relay it; do not claim that the company has already received it.",
    ].join("\n");
  }
  return [
    "[Pending company question — private system context]",
    `requestId: ${request.id}`,
    `company: ${company}`,
    `role: ${role}`,
    `neutral question: ${requestContext}`,
    "If the latest user message substantively answers or explicitly declines this request, you MUST call record_company_request_response before the final reply.",
    "Use only the latest user message as response evidence. Never say or imply that Harper accepted, saved, queued, relayed, shared, or delivered the response unless record_company_request_response returned ok=true in this turn.",
    "After ok=true, say only that Harper received the response and will relay it; do not claim that the company has already received it.",
    isCompensationQuestion(request.request_context)
      ? "Compensation is never shared from stored profile/insight. Record a response only when the talent explicitly provides an amount/range/wording to share, or clearly approves the wording Harper showed them. Otherwise ask one clarification question."
      : "The candidate may answer, decline, or ignore. Never pressure them.",
  ].join("\n");
}

export function candidateContactDraftPresentation(args: {
  body: string;
  source?: "chat" | "slack";
}) {
  const body = candidateContactBodyWithoutTransportFooter(args.body);
  const renderedBody =
    args.source === "slack"
      ? body.replace(/\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]+)\)/g, "<$2|$1>")
      : body;
  const quotedBody = renderedBody
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return quotedBody;
}

/**
 * Emergency copy for a failed final LLM completion. Successful contact-draft
 * turns keep the company-side model's prose and never use this text.
 */
export function candidateContactDraftFallbackReply(candidateName: unknown) {
  const candidate = normalizedText(candidateName, 160) || "후보자";
  return `네, 제가 대신 ${candidate}님께 여쭤보고, 답이 오면 여기로 알려드릴게요. 우선 아래 내용으로 연락드리려고 해요. 보내기 전에 한 번만 확인해 주시겠어요?`;
}

export function candidateContactScheduledReply(args: {
  candidateName: string;
  immediate: boolean;
  kind?: "question" | "resume";
  now?: Date;
  scheduledAt?: unknown;
}) {
  const candidate = `${normalizedText(args.candidateName, 160) || "후보자"}님께`;
  // Standard delivery keeps a five-minute operational buffer, but the normal
  // company-facing confirmation intentionally does not foreground that short
  // wait. It should feel like Harper has taken ownership now without falsely
  // claiming that provider delivery already completed. scheduledAt remains
  // available for an explicit timing question or a delivery-status lookup.
  const request = args.kind === "resume" ? "최신 이력서를" : "확인을";
  if (args.immediate) {
    return `네, 요청하신 내용으로 ${candidate} 바로 ${request} 요청할게요. 답변이 오면 이 대화로 바로 알려드리겠습니다.`;
  }
  return `네, 요청하신 내용으로 ${candidate} ${request} 요청할게요. 답변이 오면 이 대화로 바로 알려드리겠습니다.`;
}
