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

type KstParts = {
  day: number;
  hour: number;
  month: number;
  year: number;
};

function kstParts(value: Date): KstParts | null {
  if (!Number.isFinite(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    month: "numeric",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(value);
  const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const result = {
    day: numberPart("day"),
    hour: numberPart("hour"),
    month: numberPart("month"),
    year: numberPart("year"),
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

function calendarDayNumber(parts: KstParts) {
  return Math.floor(
    Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000
  );
}

function koreanDayPeriod(hour: number) {
  if (hour < 12) return "아침";
  if (hour < 18) return "오후";
  return "저녁";
}

export function naturalCandidateContactTiming(
  scheduledAt: unknown,
  now = new Date()
) {
  const scheduled = new Date(String(scheduledAt ?? "").trim());
  const scheduledParts = kstParts(scheduled);
  const nowParts = kstParts(now);
  if (!scheduledParts || !nowParts) return null;

  const dayDifference =
    calendarDayNumber(scheduledParts) - calendarDayNumber(nowParts);
  const minutesUntil = Math.round(
    (scheduled.getTime() - now.getTime()) / 60_000
  );
  if (minutesUntil >= 0 && minutesUntil <= 90) {
    return "조금 뒤에";
  }

  const period = koreanDayPeriod(scheduledParts.hour);
  if (dayDifference === 0) return `오늘 ${period}에`;
  if (dayDifference === 1) {
    return nowParts.hour >= 20
      ? `지금은 시간이 늦어서 내일 ${period}에`
      : `내일 ${period}에`;
  }
  return `${scheduledParts.month}월 ${scheduledParts.day}일 ${period}에`;
}

export function candidateContactScheduledReply(args: {
  candidateName: string;
  immediate: boolean;
  now?: Date;
  scheduledAt?: unknown;
}) {
  const candidate = `${normalizedText(args.candidateName, 160) || "후보자"}님께`;
  if (args.immediate) {
    return `${candidate} 제가 대신 바로 물어볼게요. 답이 오면 여기로 알려드릴게요.`;
  }
  const timing = naturalCandidateContactTiming(args.scheduledAt, args.now);
  if (timing?.startsWith("지금은 시간이 늦어서 ")) {
    const later = timing.slice("지금은 시간이 늦어서 ".length);
    return `지금은 시간이 늦어서, ${candidate} ${later} 제가 대신 물어볼게요. 답이 오면 여기로 알려드릴게요.`;
  }
  return `${candidate} 제가 대신 ${timing || "조금 뒤에"} 물어볼게요. 답이 오면 여기로 알려드릴게요.`;
}
