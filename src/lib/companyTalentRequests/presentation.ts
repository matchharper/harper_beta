import { isCompensationQuestion } from "@/lib/companyTalentRequests/policy";

type TalentPendingRequest = {
  expects_document: boolean;
  id: string;
  request_context: string;
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
  if (request.expects_document) {
    return [
      "[Pending company resume request — private system context]",
      `requestId: ${request.id}`,
      `company: ${company}`,
      `role: ${role}`,
      "The company asked whether the talent can share a current resume.",
      "Use record_company_request_response only when the talent declines or has no current resume. An upload is completed by the document service, never by a chat claim.",
    ].join("\n");
  }
  return [
    "[Pending company question — private system context]",
    `requestId: ${request.id}`,
    `company: ${company}`,
    `role: ${role}`,
    `neutral question: ${requestContext}`,
    isCompensationQuestion(request.request_context)
      ? "Compensation is never shared from stored profile/insight. Record a response only when the talent explicitly provides an amount/range/wording to share, or clearly approves the wording Harper showed them. Otherwise ask one clarification question."
      : "The candidate may answer, decline, or ignore. Never pressure them.",
  ].join("\n");
}

export function candidateContactDraftPresentation(args: {
  body: string;
  candidateName: string;
  revision: number;
  roleName: string;
  subject: string;
}) {
  const body = candidateContactBodyWithoutTransportFooter(args.body);
  return [
    `*${args.candidateName || "후보자"}님에게 보낼 문구*`,
    `- *Role*: ${args.roleName || "해당 역할"}`,
    "",
    `제목: ${args.subject}`,
    "",
    "본문:",
    "```text",
    body,
    "```",
    "",
    "승인하면 위 제목과 본문을 수정·요약하지 않고 후보자 이메일과 Harper 채팅으로 한 번 전달해요. 아직 보내지 않았어요.",
    "",
    "후보자는 답하거나, 답하기 어렵다고 하거나, 답하지 않을 수 있어요. Harper가 자동으로 재촉하지는 않으며, 답변이 오면 의미를 바꾸지 않고 정리해 이 대화에서 알려드릴게요.",
    "",
    "이대로 보낼까요, 아니면 고칠 내용을 알려주시겠어요?",
  ].join("\n");
}
