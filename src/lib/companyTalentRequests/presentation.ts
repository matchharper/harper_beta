type TalentPendingRequest = {
  recommendation_id: string;
  id: string;
  intent?: string | null;
  request_context: string;
  delivery_body?: string | null;
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
  const requestContext = normalizedText(
    request.delivery_body ?? request.request_context,
    1200
  );
  return [
    "[Company contact — private system context]",
    `connectionId: recommendation:${request.recommendation_id}`,
    `company: ${company}`,
    `role: ${role}`,
    `company message: ${requestContext}`,
    "Use contact_company for any reply, question, request, refusal, or information the user wants to send to this company.",
    "Preserve the user's meaning, conditions, and uncertainty. Share sensitive information or a document only with the user's explicit authorization; stored profile facts are not sharing permission.",
    "contact_company sends immediately. You may confirm delivery, but never infer a company decision or pipeline change. This history does not require the user to answer; follow their current intent.",
    "There is no answer classification and contacting the company does not change a hiring stage but do not mention this to the user without request.",
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
  return `네, 제가 대신 ${candidate}님께 연락을 전달할게요. 우선 아래 내용으로 보내려고 해요. 보내기 전에 한 번만 확인해 주시겠어요?`;
}

export function candidateContactScheduledReply(args: {
  candidateName: string;
  immediate: boolean;
  now?: Date;
  scheduledAt?: unknown;
}) {
  const candidate = `${normalizedText(args.candidateName, 160) || "후보자"}님께`;
  const timing = args.immediate ? "바로 " : "";
  return `네, 요청하신 내용으로 ${candidate} ${timing}연락을 전달할게요. 후보자가 답장을 보내면 이 대화로 알려드리겠습니다.`;
}
