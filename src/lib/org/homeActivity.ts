import {
  orgCandidateActivityTitle,
  type OrgCandidateActivityKind,
} from "./candidateActivityFeed";

export type OrgHomeActivityKind =
  | OrgCandidateActivityKind
  | "intro_sent"
  | "pending_connection"
  | "intro_accepted"
  | "meeting_requested"
  | "meeting_confirmed";
export type OrgHomeActivity = {
  id: string;
  kind: OrgHomeActivityKind;
  createdAt: string;
  text: string;
  talentId: string;
  talentName: string;
  recommendationId: string;
  roleId: string;
  roleName: string;
  meetingStartsAt?: string | null;
};

export type OrgHomeActivityFilter =
  | "all"
  | "intros"
  | "messages"
  | "interviews";
export type OrgHomeActivityPage = {
  items: OrgHomeActivity[];
  nextCursor: string | null;
};

export const orgHomeActivityGroups: Record<
  OrgHomeActivityKind,
  OrgHomeActivityFilter
> = {
  intro_sent: "intros",
  pending_connection: "intros",
  intro_accepted: "intros",
  candidate_message: "messages",
  candidate_response: "messages",
  company_question: "messages",
  company_message: "messages",
  company_resume_request: "messages",
  meeting_requested: "interviews",
  meeting_confirmed: "interviews",
};

/** Shared by displayed headings and server search, including localized wording. */
export function orgHomeActivityTitle(
  item: Pick<OrgHomeActivity, "kind" | "talentName">,
  locale: "ko" | "en",
  name = item.talentName || (locale === "ko" ? "후보자" : "Candidate")
) {
  if (orgHomeActivityGroups[item.kind] === "messages") {
    return orgCandidateActivityTitle(
      item.kind as OrgCandidateActivityKind,
      (ko, en) => (locale === "ko" ? ko : en).replaceAll("{name}", () => name),
      name
    );
  }
  const titles: Record<
    Exclude<OrgHomeActivityKind, OrgCandidateActivityKind>,
    [string, string]
  > = {
    intro_sent: [`${name}님에게 Intro를 보냈어요`, `Intro sent to ${name}`],
    pending_connection: [
      `새로운 연결 대기 후보 · ${name}`,
      `New candidate to review · ${name}`,
    ],
    intro_accepted: [
      `${name}님이 Intro를 수락했어요`,
      `${name} accepted your intro`,
    ],
    meeting_requested: [
      `${name}님에게 인터뷰를 요청했어요`,
      `Interview requested with ${name}`,
    ],
    meeting_confirmed: [
      `${name}님의 인터뷰 일정이 정해졌어요`,
      `Interview scheduled with ${name}`,
    ],
  };
  return titles[item.kind as keyof typeof titles][locale === "ko" ? 0 : 1];
}
