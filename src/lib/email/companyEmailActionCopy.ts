import type { OrgLocale } from "@/i18n/org/locale";
import { candidateStatusLabel } from "@/lib/org/slackCandidateWorkObject";

/** Shared by the confirm page and its API: the state contract and the confirm
 * copy (email-confirm-copy 10/22). Korean is the source; English follows c(ko, en). */
export type CompanyEmailActionKind =
  | "request_intro"
  | "pass"
  | "accept_connection"
  | "reject_connection";

export type CompanyEmailCandidateStatus = {
  status: string;
  candidateSentAt?: string | null;
};

/** Stored once in company_email_action_links.result; shown again on reopen. */
export type CompanyEmailActionResult =
  | { outcome: "done"; action: CompanyEmailActionKind; status: string; introEmail: string | null }
  | { outcome: "handled_elsewhere"; action: CompanyEmailActionKind; current: CompanyEmailCandidateStatus };

export type CompanyEmailActionCandidate = {
  name: string;
  headline: string | null;
  latestExperience: { role: string | null; companyName: string | null } | null;
  roleName: string;
};

export type CompanyEmailActionView =
  | { state: "not_found"; locale: OrgLocale }
  | {
      state: "expired" | "used" | "handled" | "confirm" | "error";
      locale: OrgLocale;
      action: CompanyEmailActionKind;
      candidate: CompanyEmailActionCandidate;
      recipient: { name: string; email: string };
      webUrl: string;
      result?: CompanyEmailActionResult;
      current?: CompanyEmailCandidateStatus;
      message?: string;
      fieldError?: string;
    };

const c = (locale: OrgLocale, ko: string, en: string) => (locale === "ko" ? ko : en);

export function companyEmailActionCopy(locale: OrgLocale) {
  return {
    actingAs: (name: string, email: string) =>
      c(locale, `${name}님(${email})으로 처리돼요`, `Acting as ${name} (${email})`),
    cancel: c(locale, "취소", "Cancel"),
    canceled: c(locale, "아무것도 처리하지 않았어요. 이 창은 닫아도 돼요.", "Nothing was changed. You can close this window."),
    viewDetails: c(locale, "웹에서 자세히 보기", "View details on the web"),
    viewOnWeb: c(locale, "웹에서 보기", "View on the web"),
    closeHint: c(locale, "이 창은 닫아도 돼요.", "You can close this window."),
    loading: c(locale, "불러오는 중", "Loading"),
    submitting: c(locale, "처리하는 중", "Processing"),
    notFound: c(locale, "링크를 찾지 못했어요.", "We couldn't find this link."),
    expired: c(locale, "이 버튼은 기간이 지났어요.", "This button has expired."),
    // Same meaning as Slack's 409: someone else decided, or the candidate's state moved on.
    handled: c(
      locale,
      "이미 다른 팀원이 결정했거나 후보 상태가 바뀌었어요.",
      "A teammate already decided, or the candidate's status changed."
    ),
    currentStatus: (label: string) =>
      c(locale, `지금 상태: ${label}`, `Current status: ${label}`),
    noPermission: c(
      locale,
      "이 후보는 볼 수 있지만 결정은 할 수 없어요. Owner나 Admin에게 요청해 주세요.",
      "You can view this candidate but can't make this decision. Ask an Owner or Admin."
    ),
    unknown: c(
      locale,
      "처리 결과를 확인하지 못했어요. 바로 다시 누르지 말고 웹에서 후보 상태를 먼저 확인해 주세요.",
      "We couldn't confirm the result. Don't press again right away; check the candidate's status on the web first."
    ),
    // 빈틈(제안): the recipient left the team or changed the account email.
    recipientInvalid: c(
      locale,
      "이 메일 주소로는 더 이상 처리할 수 없어요. Harper 웹에 로그인해서 확인해 주세요.",
      "This email address can no longer be used for this action. Sign in to Harper on the web to check."
    ),
    appealRequired: c(
      locale,
      "관심 이유를 한 줄 이상 적어 주세요.",
      "Write at least one line about why you're interested."
    ),
    introEmailNotice: (email: string) =>
      c(locale, `소개 메일은 ${email}로 가요.`, `The intro email will go to ${email}.`),
    loadError: c(
      locale,
      "화면을 불러오지 못했어요. 잠시 후 다시 열어 주세요.",
      "We couldn't load this page. Please open it again in a moment."
    ),
  };
}

export function companyEmailActionText(
  locale: OrgLocale,
  action: CompanyEmailActionKind,
  name: string,
  email: string
) {
  if (action === "request_intro")
    return {
      title: c(locale, `${name}님에게 먼저 제안할까요?`, `Request an intro to ${name}?`),
      description: c(
        locale,
        "Harper가 회사의 관심 이유를 담아 제안해요. 수락하면 아래 메일로 바로 소개해 드려요.",
        "Harper will reach out with your reason for interest. If they accept, Harper will introduce you at the email below."
      ),
      appealLabel: c(locale, `${name}님에게 전할 관심 이유`, `Why you're interested in ${name}`),
      // Same placeholder as the web Request intro dialog.
      appealPlaceholder: c(
        locale,
        "예: 지금까지 만든 제품과 초기 팀에서의 오너십이 저희가 찾는 역할과 잘 맞습니다. 특히 … 이야기를 나눠보고 싶습니다.",
        "e.g. Your product work and ownership in early teams stood out. We'd like to discuss this role with you."
      ),
      confirm: c(locale, "제안 확정하기", "Confirm intro request"),
      // The request is recorded now; Harper delivers it to the candidate afterwards.
      doneTitle: c(
        locale,
        "먼저 제안을 요청했어요. 지금 후보에게 전달할 준비를 하고 있어요.",
        "Intro requested. Harper is getting it ready to send to the candidate."
      ),
      doneDescription: c(
        locale,
        `${name}님이 수락하면 ${email}로 소개 메일이 가요.`,
        `If ${name} accepts, the intro email will go to ${email}.`
      ),
    };
  if (action === "pass")
    return {
      title: c(locale, `${name}님에게 제안하지 않을까요?`, `Pass on ${name}?`),
      description: c(
        locale,
        `이 역할의 후보 목록에서 빠져요. ${name}님에게는 아무 연락도 가지 않아요.`,
        `${name} will be removed from this role's candidate list. Nothing will be sent to ${name}.`
      ),
      confirm: c(locale, "제외 확정하기", "Confirm pass"),
      doneTitle: c(locale, "후보 목록에서 뺐어요.", "Removed from the candidate list."),
      doneDescription: "",
    };
  if (action === "accept_connection")
    return {
      title: c(locale, `${name}님과 연결할까요?`, `Connect with ${name}?`),
      description: c(
        locale,
        `${name}님과 아래 메일 주소로 소개 메일을 바로 보내요. 보낸 메일은 되돌릴 수 없어요.`,
        `Harper will send an intro email to ${name} and the address below right away. Sent emails can't be undone.`
      ),
      confirm: c(locale, "연결 확정하기", "Confirm connection"),
      doneTitle: c(locale, "소개 메일을 보냈어요.", "Intro email sent."),
      doneDescription: c(
        locale,
        `${name}님과 그 메일에서 바로 이야기를 이어가세요.`,
        `Continue the conversation with ${name} in that email.`
      ),
    };
  return {
    title: c(locale, `${name}님과 연결하지 않을까요?`, `Decline connecting with ${name}?`),
    description: c(
      locale,
      `Harper가 ${name}님에게 이번 역할은 진행하지 않는다고 정중히 안내해요. 안내는 되돌릴 수 없어요.`,
      `Harper will politely let ${name} know this role won't move forward. This can't be undone.`
    ),
    confirm: c(locale, "거절 확정하기", "Confirm decline"),
    doneTitle: c(locale, "연결 거절을 전했어요.", "Decline sent."),
    doneDescription: "",
  };
}

/** Status names follow the Slack candidate card. */
export function companyEmailCandidateStatusLabel(
  current: CompanyEmailCandidateStatus,
  locale: OrgLocale
) {
  return candidateStatusLabel(
    { status: current.status, candidateSentAt: current.candidateSentAt ?? null },
    locale
  );
}

export function companyEmailActionNeedsIntroEmail(action: CompanyEmailActionKind) {
  return action === "request_intro" || action === "accept_connection";
}
