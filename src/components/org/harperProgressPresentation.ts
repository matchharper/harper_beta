import type { CompanyFollowupProgress } from "@/lib/org/companyFollowupProgress";
import type { OrgCopy } from "@/i18n/org/OrgLocaleProvider";

// intro_to_company records the accepted-candidate handoff, not a company-first proposal.
export function getHarperProgressText(
  kind: string | undefined,
  candidateName: string | null | undefined,
  c: OrgCopy,
  followup?: CompanyFollowupProgress
): string | null {
  if (kind === "company_intro_followup_policy")
    return c(
      "회사의 Intro 요청에 대해서 응답하지 않을 때 Harper가 적절한 시점에 팔로업을 보냅니다.",
      "If the candidate does not respond to your Intro request, Harper follows up at an appropriate time."
    );
  if (kind === "company_followup") return companyFollowupText(followup, c);
  if (kind === "internal_followup_sent") {
    return c("팔로업 연락을 보냈습니다.", "I sent a follow-up message.");
  }
  if (kind === "intro_to_company" || kind === "company_candidate_presented") {
    const recommendation = candidateName?.trim()
      ? c(
          "{name}님을 만나보실 것을 추천드립니다.",
          "I recommend meeting {name}.",
          { name: candidateName.trim() }
        )
      : c(
          "이 후보자를 만나보실 것을 추천드립니다.",
          "I recommend meeting this candidate."
        );
    if (kind === "company_candidate_presented") return recommendation;
    return `${recommendation} ${c(
      "제가 먼저 이 역할을 후보자에게 소개했고, 연결받고 싶다는 의사를 표현했습니다.",
      "I introduced this role to them first, and they expressed interest in connecting with your team."
    )}`;
  }
  return null;
}

function companyFollowupText(
  facts: CompanyFollowupProgress | undefined,
  c: OrgCopy
): string {
  const purpose =
    facts?.sourceKind === "intro"
      ? c(
          "연결 제안에 대한 후보자의 응답 확인",
          "Checking the candidate’s response to the introduction"
        )
      : facts?.sourceKind === "meeting"
        ? c(
            "후보자의 인터뷰 일정 응답 확인",
            "Checking the candidate’s response to the interview invitation"
          )
        : facts?.sourceKind === "contact"
          ? c(
              "회사 요청에 대한 후보자의 응답 확인",
              "Checking the candidate’s response to your request"
            )
          : c("후보자에게 후속 연락", "Following up with the candidate");
  const event = facts?.eventType;
  let action: string;
  switch (event) {
    case "scheduled":
      action = facts?.dueAt
        ? c("팔로업 연락을 예약했습니다.", "A follow-up was scheduled.")
        : c(
            "팔로업 연락을 예약했습니다. 첫 이메일이 발송되면 예정일이 정해집니다.",
            "A follow-up was scheduled. Its date will be set once the first email is sent."
          );
      break;
    case "date_anchored":
      action = c(
        "첫 이메일 발송일을 기준으로 팔로업 예정일을 정했습니다.",
        "The follow-up date was set based on when the first email was sent."
      );
      break;
    case "rescheduled":
      action = c(
        "팔로업 연락 일정을 변경했습니다.",
        "The follow-up was rescheduled."
      );
      break;
    case "cancelled":
      action =
        facts?.reason === "source_unavailable"
          ? c(
              "원래 요청이 더 이상 후속 연락 가능한 상태가 아니어서 팔로업을 취소했습니다.",
              "The follow-up was cancelled because the original request is no longer eligible for follow-up."
            )
          : c(
              "예약된 팔로업 연락을 취소했습니다.",
              "The scheduled follow-up was cancelled."
            );
      break;
    case "chat_delivered":
      action = c(
        "후보자의 Harper 채팅으로 팔로업 메시지를 전달했습니다.",
        "The follow-up message was delivered to the candidate’s Harper chat."
      );
      break;
    case "email_sent":
      action = c(
        "후보자에게 팔로업 이메일을 보냈습니다.",
        "The follow-up email was sent to the candidate."
      );
      break;
    case "email_failed":
      action = c(
        "후보자에게 팔로업 이메일을 보내지 못했습니다.",
        "The follow-up email could not be sent to the candidate."
      );
      break;
    case "email_cancelled":
      action = c(
        "팔로업 이메일 발송이 취소되었습니다.",
        "Sending the follow-up email was cancelled."
      );
      break;
    default:
      action = c(
        "팔로업 관련 기록이 추가되었습니다. 세부 사건 정보가 없어 발송 여부는 확인할 수 없습니다.",
        "A follow-up record was added. Without event details, delivery cannot be confirmed."
      );
  }
  const date = (value: string | null | undefined) => {
    if (!value || !Number.isFinite(Date.parse(value))) return null;
    return (
      new Intl.DateTimeFormat(c("ko-KR", "en-US"), {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value)) + " (KST)"
    );
  };
  const lines = [purpose, action];
  if (event === "rescheduled") {
    const previous = date(facts?.previousDueAt);
    if (previous)
      lines.push(
        c("변경 전 예정일: {date}", "Previous scheduled date: {date}", {
          date: previous,
        })
      );
  }
  if (
    ["scheduled", "date_anchored", "rescheduled", "cancelled"].includes(
      event ?? ""
    )
  ) {
    const due = date(facts?.dueAt);
    if (due)
      lines.push(c("예정일: {date}", "Scheduled date: {date}", { date: due }));
  }
  return lines.join("\n");
}
