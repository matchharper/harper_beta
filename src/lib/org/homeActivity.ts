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
  | "meeting_confirmed"
  // What Harper did on a Role: no candidate behind it.
  | "search_done"
  | "brief_changed"
  | "harper_proposal";

/** Harper's own work on a Role, read from its records; no candidate behind it. */
export const ORG_HOME_HARPER_KINDS = [
  "search_done",
  "brief_changed",
  "harper_proposal",
] as const satisfies readonly OrgHomeActivityKind[];
export type OrgHomeHarperKind = (typeof ORG_HOME_HARPER_KINDS)[number];
export function isOrgHomeHarperKind(
  kind: OrgHomeActivityKind
): kind is OrgHomeHarperKind {
  return (ORG_HOME_HARPER_KINDS as readonly string[]).includes(kind);
}

export type OrgHomeActivity = {
  id: string;
  kind: OrgHomeActivityKind;
  createdAt: string;
  /** Candidate events: their message. Harper's work: what Harper said or proposed. */
  text: string;
  /** search_done: people the search added to Ready to reach out. */
  count?: number;
  /** Empty for Harper's work. */
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
  | "interviews"
  | "harper";
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
  search_done: "harper",
  brief_changed: "harper",
  harper_proposal: "harper",
};

/** Shared by displayed headings and server search, including localized wording. */
export function orgHomeActivityTitle(
  item: Pick<OrgHomeActivity, "kind" | "talentName"> &
    Partial<Pick<OrgHomeActivity, "text" | "count">>,
  locale: "ko" | "en",
  name = item.talentName || (locale === "ko" ? "후보자" : "Candidate")
) {
  if (isOrgHomeHarperKind(item.kind))
    return harperTitle({ ...item, kind: item.kind }, locale);
  if (orgHomeActivityGroups[item.kind] === "messages") {
    return orgCandidateActivityTitle(
      item.kind as OrgCandidateActivityKind,
      (ko, en) => (locale === "ko" ? ko : en).replaceAll("{name}", () => name),
      name
    );
  }
  const titles: Record<
    Exclude<OrgHomeActivityKind, OrgCandidateActivityKind | OrgHomeHarperKind>,
    [string, string]
  > = {
    intro_sent: [`${name}님에게 연결을 요청했어요`, `Requested an intro for ${name}`],
    pending_connection: [
      `연결을 기다리는 후보 도착 · ${name}`,
      `New candidate to review · ${name}`,
    ],
    intro_accepted: [
      `${name}님이 연결을 수락했어요`,
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

/** Harper's words when it wrote some; the To-do's fixed wording otherwise. */
function harperTitle(
  item: Partial<Pick<OrgHomeActivity, "text" | "count">> & {
    kind: OrgHomeHarperKind;
  },
  locale: "ko" | "en"
) {
  const ko = locale === "ko";
  const text = item.text?.trim() ?? "";
  const n = item.count ?? 0;
  switch (item.kind) {
    case "search_done":
      if (text) return text;
      return n
        ? ko
          ? `후보 검색 · 연결을 요청할 후보 ${n}명 추가`
          : `Candidate search · ${n} added to Ready to reach out`
        : ko
          ? "후보 검색을 마쳤어요"
          : "Candidate search finished";
    case "brief_changed":
      return text
        ? ko
          ? `찾는 사람 변경: ${text}`
          : `Who we're looking for changed: ${text}`
        : ko
          ? "찾는 사람을 바꿨어요"
          : "Who we're looking for changed";
    case "harper_proposal":
      return text
        ? ko
          ? `Harper 제안: ${text}`
          : `Harper suggests: ${text}`
        : ko
          ? "Harper가 제안했어요"
          : "Harper made a suggestion";
  }
}
