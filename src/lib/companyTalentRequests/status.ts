export type CompanyTalentRequestStatusInput = {
  candidate_cancellation_source?: string | null;
  candidate_delivery_status?: string | null;
  candidate_delivery_error?: string | null;
  candidate_sent_at?: string | null;
  company_delivery_status?: string | null;
  company_sent_at?: string | null;
  delivery_status?: string | null;
  expires_at?: string | null;
  expects_document?: boolean | null;
  has_candidate_response?: boolean | null;
  now?: number;
  role_is_open?: boolean | null;
  workflow_status?: string | null;
};

export type CompanyTalentRequestStatusSummary = {
  candidateEmail: string;
  candidateResponse: string;
  companyRelay: string;
  status: string;
};

function hasTimestamp(value: unknown) {
  return Number.isFinite(Date.parse(String(value ?? "")));
}

export function companyTalentRequestCandidateEmailWasSent(
  row: CompanyTalentRequestStatusInput
) {
  const workflowStatus = String(row.workflow_status ?? "");
  const candidateDeliveryStatus = String(
    row.candidate_delivery_status ?? row.delivery_status ?? ""
  );
  return (
    candidateDeliveryStatus === "sent" ||
    hasTimestamp(row.candidate_sent_at) ||
    row.has_candidate_response === true ||
    [
      "awaiting_talent",
      "relay_queued",
      "review_required",
      "delivered",
    ].includes(workflowStatus)
  );
}

/**
 * Only a request whose candidate email has not been sent may reserve the
 * company/role/talent contact slot. Sent requests remain visible in history,
 * but they must not prevent the company from asking a separate question.
 */
export function companyTalentRequestBlocksNewContact(
  row: CompanyTalentRequestStatusInput
) {
  if (companyTalentRequestCandidateEmailWasSent(row)) return false;
  if (
    !["draft", "queued", "failed"].includes(String(row.workflow_status ?? ""))
  ) {
    return false;
  }
  const expiresAt = Date.parse(String(row.expires_at ?? ""));
  return !Number.isFinite(expiresAt) || expiresAt > (row.now ?? Date.now());
}

/**
 * Converts the durable request and delivery facts into cumulative, user-safe
 * milestones. Later workflow stages must not hide that an earlier email was
 * sent or that a candidate response was received.
 */
export function summarizeCompanyTalentRequestStatus(
  row: CompanyTalentRequestStatusInput
): CompanyTalentRequestStatusSummary {
  const workflowStatus = String(row.workflow_status ?? "");
  const candidateDeliveryStatus = String(
    row.candidate_delivery_status ?? row.delivery_status ?? ""
  );
  const candidateDeliveryError = String(row.candidate_delivery_error ?? "");
  const candidateCancellationSource = String(
    row.candidate_cancellation_source ?? ""
  );
  const companyDeliveryStatus = String(row.company_delivery_status ?? "");
  const expiresAt = Date.parse(String(row.expires_at ?? ""));
  const expired =
    Number.isFinite(expiresAt) && expiresAt <= (row.now ?? Date.now());

  const candidateEmailSent = companyTalentRequestCandidateEmailWasSent(row);
  const candidateResponseReceived =
    row.has_candidate_response === true ||
    ["relay_queued", "review_required", "delivered"].includes(workflowStatus);
  const companyRelaySent =
    companyDeliveryStatus === "sent" ||
    hasTimestamp(row.company_sent_at) ||
    workflowStatus === "delivered";

  let candidateEmail: string;
  if (candidateEmailSent) {
    candidateEmail = "발송됨";
  } else if (candidateDeliveryStatus === "processing") {
    candidateEmail = "초안 확정됨 · 발송 중";
  } else if (candidateDeliveryError === "missing_talent_email") {
    candidateEmail = "초안 작성됨 · 후보자 이메일을 확인하지 못해 미발송";
  } else if (
    candidateDeliveryStatus === "cancelled" &&
    candidateCancellationSource === "company"
  ) {
    candidateEmail = "초안 작성됨 · 회사 요청으로 발송 취소됨";
  } else if (
    candidateDeliveryStatus === "cancelled" &&
    candidateDeliveryError === "stage_changed_before_send"
  ) {
    candidateEmail = "초안 작성됨 · Role 진행 상태 변경으로 발송 취소됨";
  } else if (
    expired ||
    candidateDeliveryError === "company_talent_request_expired"
  ) {
    candidateEmail = "초안 작성됨 · 발송하지 않고 종료";
  } else if (
    candidateDeliveryStatus === "failed" ||
    workflowStatus === "failed"
  ) {
    candidateEmail = "초안 작성됨 · 발송 실패";
  } else if (candidateDeliveryStatus === "cancelled") {
    candidateEmail = "초안 작성됨 · 발송 취소됨";
  } else if (workflowStatus === "draft") {
    candidateEmail = "초안 작성됨 · 발송 전";
  } else if (
    candidateDeliveryStatus === "queued" ||
    workflowStatus === "queued"
  ) {
    candidateEmail = "초안 확정됨 · 발송 예정";
  } else if (workflowStatus === "closed") {
    candidateEmail = "초안 작성됨 · 회사 요청으로 발송 취소됨";
  } else {
    candidateEmail = "미발송 · 상태 확인 필요";
  }

  let candidateResponse: string;
  if (candidateResponseReceived) {
    candidateResponse = "수신됨";
  } else if (candidateEmailSent && row.role_is_open === false) {
    candidateResponse = "미수신 · Role 종료";
  } else if (candidateEmailSent) {
    candidateResponse = "대기 · 발송 후 답변 기한 없음";
  } else {
    candidateResponse = "수신 전";
  }

  let companyRelay: string;
  if (companyRelaySent) {
    companyRelay = "전달됨";
  } else if (!candidateResponseReceived) {
    companyRelay = "전달 전";
  } else if (workflowStatus === "review_required") {
    companyRelay = "전달 보류";
  } else if (companyDeliveryStatus === "processing") {
    companyRelay = "전달 중";
  } else if (
    companyDeliveryStatus === "failed" ||
    workflowStatus === "failed"
  ) {
    companyRelay = "전달 실패";
  } else if (
    companyDeliveryStatus === "queued" ||
    workflowStatus === "relay_queued"
  ) {
    companyRelay = "전달 준비 중";
  } else if (workflowStatus === "closed") {
    companyRelay = "전달 상태 확인 필요";
  } else {
    companyRelay = "전달 상태 확인 필요";
  }

  const responseNoun = row.expects_document ? "후보자 자료" : "후보자 답변";
  return {
    candidateEmail,
    candidateResponse,
    companyRelay,
    status: `후보자 메일 ${candidateEmail} · ${responseNoun} ${candidateResponse} · 회사 ${companyRelay}`,
  };
}

export function humanizeCompanyTalentRequestStatus(
  row: CompanyTalentRequestStatusInput
) {
  return summarizeCompanyTalentRequestStatus(row).status;
}
