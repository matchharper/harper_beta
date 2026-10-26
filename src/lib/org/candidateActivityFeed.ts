import type { OrgCopy } from "@/i18n/org/OrgLocaleProvider";
import type { OrgFeedItem } from "./server";

export type OrgCandidateActivity = {
  eventType:
    | "candidate_contact_sent"
    | "candidate_message_delivered"
    | "candidate_response_received";
  requestId: string | null;
  relayId: string | null;
  requestKind: string | null;
  requestContext: string | null;
};

export type OrgCandidateActivityKind =
  | "company_question"
  | "company_message"
  | "company_resume_request"
  | "candidate_response"
  | "candidate_message";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() || null : null;

/** Called only for company-visible progress in the authorized Role/talent scope. */
export function readOrgCandidateActivity(
  metadata: unknown
): OrgCandidateActivity | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const record = metadata as Record<string, unknown>;
  const eventType = text(record.eventType);
  if (
    eventType !== "candidate_contact_sent" &&
    eventType !== "candidate_message_delivered" &&
    eventType !== "candidate_response_received"
  )
    return null;
  return {
    eventType,
    requestId: text(record.requestId),
    relayId: text(record.relayId),
    requestKind: text(record.requestKind),
    requestContext: text(record.requestContext),
  };
}

export function orgCandidateActivityKind(
  activity: OrgCandidateActivity
): OrgCandidateActivityKind {
  if (activity.eventType === "candidate_contact_sent") {
    if (activity.requestKind === "question") return "company_question";
    if (activity.requestKind === "resume") return "company_resume_request";
    return "company_message";
  }
  // A relay linked to a company request is a reply; standalone relays need no request.
  return activity.eventType === "candidate_response_received" ||
    activity.requestId
    ? "candidate_response"
    : "candidate_message";
}

export function orgCandidateActivityTitle(
  kind: OrgCandidateActivityKind,
  c: OrgCopy,
  name?: string
): string {
  switch (kind) {
    case "company_question":
      return name
        ? c("{name}님에게 질문을 보냈어요", "Question sent to {name}", { name })
        : c("후보자에게 질문을 보냈어요", "Question sent to the candidate");
    case "company_resume_request":
      return name
        ? c(
            "{name}님에게 이력서를 요청했어요",
            "Resume requested from {name}",
            { name }
          )
        : c(
            "후보자에게 이력서를 요청했어요",
            "Resume requested from the candidate"
          );
    case "company_message":
      return name
        ? c("{name}님에게 메시지를 보냈어요", "Message sent to {name}", {
            name,
          })
        : c("후보자에게 연락을 보냈어요", "Message sent to the candidate");
    case "candidate_response":
      return name
        ? c("{name}님이 답변했어요", "{name} replied", { name })
        : c("후보자의 답변이 도착했어요", "The candidate replied");
    case "candidate_message":
      return name
        ? c("{name}님에게 메시지가 왔어요", "New message from {name}", { name })
        : c("후보자에게 메시지가 왔어요", "New message from the candidate");
  }
}

/** Keep every delivery's original body and identity, including multiple replies to one request. */
export function orgCandidateActivityFeedContent(
  row: { id: string; metadata: unknown; text: string },
  subject?: string | null
): Pick<OrgFeedItem, "activity" | "delivery" | "text"> | null {
  const activity = readOrgCandidateActivity(row.metadata);
  if (!activity) return null;
  const metadata = row.metadata as Record<string, unknown>;
  return {
    activity,
    delivery: {
      id: row.id,
      bodyText: row.text || null,
      disclosureLabel:
        activity.eventType === "candidate_contact_sent"
          ? "메일 내용"
          : "Harper가 전달한 내용",
      subject:
        activity.eventType === "candidate_contact_sent"
          ? (subject ?? text(metadata.subject) ?? text(metadata.emailSubject))
          : null,
    },
    text: activity.requestContext
      ? `요청 내용 · ${activity.requestContext}`
      : "",
  };
}
