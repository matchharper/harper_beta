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

export function serializeTalentPendingRequest(
  request: TalentPendingRequest | null
) {
  if (!request) return null;
  const company =
    normalizedText(request.workspace?.company_name, 160) || "채용 회사";
  const role = normalizedText(request.role?.name, 160) || "해당 포지션";
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
