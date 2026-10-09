import type { OrgLocale } from "@/i18n/org/locale";
import {
  DEFAULT_INTRO_SEARCH_DAYS,
  DEFAULT_INTRO_SEARCH_HOUR,
  parseIntroSearchDays,
  parseIntroSearchHour,
  type IntroSearchDay,
} from "@/lib/org/introSearchSchedule";

const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";

export type OrgSlackWorkspace = {
  companyName: string;
  workspaceId: string;
};

export type OrgSlackUser = {
  email?: string | null;
  name?: string | null;
  userId?: string | null;
};

export type OrgSlackCandidate = {
  email?: string | null;
  name?: string | null;
  talentId: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

export function escapeSlackText(value: unknown) {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeSlackLinkUrl(value: unknown) {
  return normalizeText(value)
    .replace(/\s/g, "%20")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/\|/g, "%7C");
}

export function formatSlackLink(url: string, label: string) {
  const safeUrl = escapeSlackLinkUrl(url);
  const safeLabel = escapeSlackText(label);
  return safeUrl && safeLabel ? `<${safeUrl}|${safeLabel}>` : safeLabel;
}

export function convertMarkdownLinksToSlackMrkdwn(value: string) {
  return String(value ?? "").replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi,
    (_match, label: string, url: string) => formatSlackLink(url, label)
  );
}

export function getOrgPublicSiteUrl() {
  const value =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    DEFAULT_PUBLIC_SITE_URL;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    return new URL(withProtocol).origin.replace(/\/+$/, "");
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

export function buildOrgRoleUrl(workspaceId: string, roleId?: string | null) {
  const params = new URLSearchParams({ orgId: workspaceId });
  if (roleId) params.set("roleId", roleId);
  return `${getOrgPublicSiteUrl()}/org/jobs?${params.toString()}`;
}

export function buildOrgRoleCalibrationProfileUrl(args: {
  calibrationId: string;
  profileId: string;
  roleId: string;
  workspaceId: string;
}) {
  const params = new URLSearchParams({
    calibration: args.calibrationId,
    orgId: args.workspaceId,
    profile: args.profileId,
    roleId: args.roleId,
    tab: "matching",
  });
  return `${getOrgPublicSiteUrl()}/org/role?${params.toString()}`;
}

export function buildOrgMeetingAvailabilityUrl(workspaceId: string) {
  const params = new URLSearchParams({
    orgId: workspaceId,
    tab: "calendar",
  });
  return `${getOrgPublicSiteUrl()}/org/settings?${params.toString()}`;
}

export function buildOrgMeetingScheduleUrl(
  workspaceId: string,
  scheduleId: string
) {
  const params = new URLSearchParams({
    dialog: "interview-schedule",
    orgId: workspaceId,
    scheduleId,
  });
  return `${getOrgPublicSiteUrl()}/org/inbox?${params.toString()}`;
}

export function formatPerson(user: OrgSlackUser) {
  const name = normalizeText(user.name);
  const email = normalizeText(user.email);
  if (name && email) {
    return `${escapeSlackText(name)} (${escapeSlackText(email)})`;
  }
  return escapeSlackText(name || email || user.userId || "Unknown");
}

export function formatCandidate(candidate: OrgSlackCandidate) {
  const name = normalizeText(candidate.name);
  const email = normalizeText(candidate.email);
  if (name && email) {
    return `${escapeSlackText(name)} (${escapeSlackText(email)})`;
  }
  return escapeSlackText(name || email || candidate.talentId);
}

export function formatOptional(value: unknown) {
  return escapeSlackText(value) || "없음";
}

export function buildOrgRoleCreatedSlackMessage(args: {
  actor: OrgSlackUser;
  introSearchDate?: IntroSearchDay[];
  introSearchTime?: number;
  isCompanyFirstSearch: boolean;
  locale?: OrgLocale;
  roleId: string;
  roleName: string;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  const days = parseIntroSearchDays(args.introSearchDate) ?? DEFAULT_INTRO_SEARCH_DAYS;
  const hour = parseIntroSearchHour(args.introSearchTime) ?? DEFAULT_INTRO_SEARCH_HOUR;
  const englishSchedule = `every ${days.join(", ")} at ${String(hour).padStart(2, "0")}:00 KST`;
  const koreanDayNames: Record<IntroSearchDay, string> = {
    Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토", Sun: "일",
  };
  const koreanSchedule = `매주 ${days.map((day) => koreanDayNames[day]).join("·")}요일 ${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}시(한국 시간)`;
  if (args.locale === "en")
    return [
      `Harper is starting to match candidates for *${formatSlackLink(roleUrl, args.roleName)}* at ${escapeSlackText(args.workspace.companyName)}.`,
      "",
      "*How candidates reach you*",
      "• Harper introduces the role to suitable candidates. After someone accepts, Harper prepares their introduction and sends it to Ready to connect for your decision.",
      args.isCompanyFirstSearch
        ? `• *Company-first suggestions are on:* Harper starts a new search ${englishSchedule}. If it finds suitable people, they appear in Suggested candidates.`
        : `• *Company-first suggestions are off:* Turn them on in the role settings to start new searches ${englishSchedule}.`,
      "",
      "*What you can do*",
      "• Ask Harper to search this role now if you want to review potential matches at any time.",
      "• Suggested candidates have not accepted the role. Use Request intro if you want Harper to contact one of them.",
      "• In Ready to connect, choose whether to connect with each candidate. Tell Harper what matters to your team so future matches can reflect it.",
    ].join("\n");
  return [
    `지금부터 ${escapeSlackText(args.workspace.companyName)}의 *${formatSlackLink(roleUrl, args.roleName)}* 역할의 리크루팅을 시작합니다.`,
    "",
    "*후보자를 찾고 소개하는 방법*",
    "• Harper가 적합한 후보자에게 역할을 먼저 소개해요. 후보자가 수락하면 Harper가 소개를 준비해 ‘연결 대기’에서 알려드려요.",
    args.isCompanyFirstSearch
      ? `• *정기 후보 검색 켜짐:* ${koreanSchedule}에 새 후보자 검색을 시작해요. 적합한 분이 있으면 ‘먼저 제안 가능한 후보’에 보여드려요.`
      : `• *정기 후보 검색 꺼짐:* 역할 설정에서 켜면 ${koreanSchedule}에 새 후보자 검색을 시작해요.`,
    "",
    "*필요할 때 할 일*",
    "• 지금 먼저 연락을 보낼 수 있는 후보자를 확인하고 싶다면 Harper에게 이 역할의 후보 검색을 요청할 수 있어요.",
    "• ‘먼저 제안 가능한 후보’는 아직 역할을 수락한 분들이 아니에요. 만나보고 싶다면 ‘Intro 요청’을 눌러주세요.",
    "• ‘연결 대기’에 도착한 후보자는 연결 여부를 결정해 주세요. 중요하게 보는 점이나 후보자 피드백도 알려주시면 다음 탐색에 반영할게요.",
  ].join("\n");
}

export function buildOrgRoleCalibrationSlackMessage(args: {
  calibrationId: string;
  locale?: OrgLocale;
  profiles: Array<{
    display: {
      headline: string | null;
      name: string;
      profilePicture?: string | null;
    };
    profileId: string;
    selection: { reason: string };
  }>;
  roleId: string;
  roleName: string;
  workspaceId: string;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspaceId, args.roleId);
  if (args.locale === "en")
    return [
      `*Sample profiles for ${formatSlackLink(roleUrl, args.roleName)}*`,
      "These are anonymized examples of people Harper may look for. They have not been matched or contacted. Let Harper know which profiles fit the role and why.",
      "",
      args.profiles
        .map((profile) => {
          const profileUrl = buildOrgRoleCalibrationProfileUrl({
            calibrationId: args.calibrationId,
            profileId: profile.profileId,
            roleId: args.roleId,
            workspaceId: args.workspaceId,
          });
          return [
            `*Profile ${escapeSlackText(profile.profileId)}* — ${formatSlackLink(profileUrl, profile.display.name)}`,
            profile.display.headline
              ? escapeSlackText(profile.display.headline)
              : null,
            `*Why Harper selected this profile* ${escapeSlackText(profile.selection.reason)}`,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n———\n\n"),
      "",
      "Reply in this thread with what works or doesn't, and the reason. Harper will use that feedback for the next search.",
    ].join("\n");
  const profileBlocks = args.profiles.map((profile) => {
    const profileUrl = buildOrgRoleCalibrationProfileUrl({
      calibrationId: args.calibrationId,
      profileId: profile.profileId,
      roleId: args.roleId,
      workspaceId: args.workspaceId,
    });
    return [
      `*Profile ${escapeSlackText(profile.profileId)}* — ${formatSlackLink(profileUrl, profile.display.name)}`,
      profile.display.headline
        ? escapeSlackText(profile.display.headline)
        : null,
      `*Harper가 고른 이유* ${escapeSlackText(profile.selection.reason)}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    `*${formatSlackLink(roleUrl, args.roleName)} 역할의 예시 프로필을 골랐어요*`,
    "아직 실제로 매칭되거나 연락한 분들은 아니에요. 제가 이해한 기준이라면 이런 분들을 찾아보게 될 것 같아, 혹시 잘못 이해한 부분이 없는지 여쭤보려고 이름과 사진을 바꾼 예시 프로필을 준비했어요. 지금 생각한 매칭 기준이 맞는지 확인하고 싶어요.",
    "",
    profileBlocks.join("\n\n———\n\n"),
    "",
    "이 스레드에서 `A는 Good`, `C는 경력이 짧아서 Bad`처럼 말씀해 주세요. 좋거나 아쉬운 이유를 함께 알려주시면 다음 추천 기준에도 반영할게요.",
  ].join("\n");
}

export function buildOrgRoleCalibrationSlackBlocks(args: {
  calibrationId: string;
  locale?: OrgLocale;
  profiles: Array<{
    display: {
      headline: string | null;
      name: string;
      profilePicture?: string | null;
    };
    profileId: string;
    selection: { reason: string };
  }>;
  roleId: string;
  roleName: string;
  workspaceId: string;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspaceId, args.roleId);
  return [
    {
      text: {
        text:
          args.locale === "en"
            ? `*${formatSlackLink(roleUrl, `Sample profiles for ${args.roleName}`)}*\nThese anonymized examples show the people Harper may look for. They have not been matched or contacted. Tell Harper which profiles fit the role and why.`
            : `*${formatSlackLink(roleUrl, `${args.roleName} 역할의 예시 프로필을 골랐어요`)}*\n아직 실제로 매칭되거나 연락한 분들은 아니에요. 제가 이해한 기준이라면 이런 분들을 찾아보게 될 것 같아, 혹시 잘못 이해한 부분이 없는지 여쭤보려고 이름과 사진을 바꾼 예시 프로필을 준비했어요. 지금 생각한 매칭 기준이 맞는지 확인하고 싶어요.`,
        type: "mrkdwn",
      },
      type: "section",
    },
    ...args.profiles.flatMap((profile, index) => {
      const profileUrl = buildOrgRoleCalibrationProfileUrl({
        calibrationId: args.calibrationId,
        profileId: profile.profileId,
        roleId: args.roleId,
        workspaceId: args.workspaceId,
      });
      const localPicture = profile.display.profilePicture?.trim();
      const section = {
        ...(localPicture?.startsWith("/") && !localPicture.startsWith("//")
          ? {
              accessory: {
                alt_text:
                  args.locale === "en"
                    ? `Sample profile ${profile.profileId}`
                    : `예시 프로필 ${profile.profileId}`,
                image_url: new URL(
                  localPicture,
                  getOrgPublicSiteUrl()
                ).toString(),
                type: "image",
              },
            }
          : {}),
        text: {
          text: [
            `*Profile ${escapeSlackText(profile.profileId)} · ${formatSlackLink(profileUrl, profile.display.name)}*`,
            profile.display.headline
              ? escapeSlackText(profile.display.headline)
              : null,
            `${args.locale === "en" ? "*Why Harper selected this profile*" : "*Harper가 고른 이유*"} ${escapeSlackText(profile.selection.reason)}`,
          ]
            .filter(Boolean)
            .join("\n"),
          type: "mrkdwn",
        },
        type: "section",
      };
      return index < args.profiles.length - 1
        ? [section, { type: "divider" }]
        : [section];
    }),
    {
      text: {
        text:
          args.locale === "en"
            ? "Reply in this thread with what works or doesn't, and why. Harper will use that feedback for the next search."
            : "이 스레드에서 `A는 Good`, `C는 경력이 짧아서 Bad`처럼 말씀해 주세요. 좋거나 아쉬운 이유를 함께 알려주시면 다음 추천 기준에도 반영할게요.",
        type: "mrkdwn",
      },
      type: "section",
    },
  ];
}

export function buildOrgCandidateAcceptedSlackMessage(args: {
  acceptReason?: string | null;
  actor: OrgSlackUser;
  candidate: OrgSlackCandidate;
  closureNotificationDelivered?: boolean;
  contactDirectly?: boolean;
  introEmails: string[];
  locale?: OrgLocale;
  reactivated?: boolean;
  roleId: string;
  roleName: string;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  if (args.locale === "en") {
    const candidateName = escapeSlackText(
      args.candidate.name || "the candidate"
    );
    const lines = [
      args.contactDirectly
        ? `*Direct contact selected for ${candidateName}*`
        : `*Introduction email sent for ${candidateName}*`,
      `- *Role*: ${formatSlackLink(roleUrl, args.roleName)}`,
      `- *Candidate*: ${formatCandidate(args.candidate)}`,
      `- *Connection method*: ${args.contactDirectly ? "Direct contact" : "Email intro"}`,
      `- *Reason*: ${escapeSlackText(args.acceptReason) || "None provided"}`,
    ];
    if (!args.contactDirectly)
      lines.splice(
        4,
        0,
        `- *Company recipients*: ${args.introEmails.map(escapeSlackText).join(", ") || "None"}`
      );
    if (args.reactivated)
      lines.push(
        args.closureNotificationDelivered
          ? "Harper already informed the candidate of the earlier decision. That notice cannot be recalled. Explain the change in circumstances openly when you speak with them."
          : "Harper stopped the separate closure notice, but the earlier decision may already have appeared in the candidate's view. Explain the change in circumstances when you speak with them."
      );
    lines.push(
      "",
      args.contactDirectly
        ? "Harper did not send an introduction email. Contact the candidate directly to introduce yourself and coordinate next steps."
        : "Harper sent the introduction email. Both sides can continue the conversation and coordinate next steps in the same thread."
    );
    return lines.join("\n");
  }
  const rawCandidateName = normalizeText(args.candidate.name) || "후보자";
  const politeCandidateName = rawCandidateName.endsWith("님")
    ? rawCandidateName
    : `${rawCandidateName}님`;
  const connectionMethod = args.contactDirectly ? "직접 연락" : "소개 이메일";
  const lines = [
    args.reactivated
      ? `*${escapeSlackText(politeCandidateName)}과 다시 연결해드렸어요*`
      : `*${escapeSlackText(politeCandidateName)}과 연결해드렸어요*`,
    `- *역할*: ${formatSlackLink(roleUrl, args.roleName)}`,
    `- *연결 대상*: ${formatCandidate(args.candidate)}`,
    `- *연결 방식*: ${connectionMethod}`,
    `- *선택 이유*: ${formatOptional(args.acceptReason)}`,
  ];
  if (!args.contactDirectly) {
    lines.splice(
      4,
      0,
      `- *회사 수신자*: ${args.introEmails.map(escapeSlackText).join(", ") || "없음"}`
    );
  }
  if (args.reactivated) {
    lines.push(
      args.closureNotificationDelivered
        ? "Harper가 후보자에게 이전 종료 결정을 이미 안내했어요. 이미 표시되거나 전달된 안내는 회수할 수 없으므로, 이후 대화에서 회사의 상황이 바뀐 점을 직접 솔직하고 배려 있게 설명해 주세요."
        : "Harper의 별도 종료 안내는 더 이상 발송되지 않도록 했어요. 다만 이전 종료 결정이 후보자 화면에 이미 표시됐을 수 있으므로, 이후 대화에서 상황이 바뀐 점을 배려 있게 설명해 주세요."
    );
  }
  lines.push(
    "",
    args.contactDirectly
      ? "Harper가 연결 이메일을 보내지는 않았어요. 회사에서 후보자에게 직접 연락해 인사하고 다음 일정을 조율해 주세요."
      : "Harper가 후보자와의 연결 이메일을 보냈어요. 이제 양측이 같은 이메일에서 인사하고 다음 일정을 직접 조율할 수 있어요.",
    "",
    args.reactivated
      ? "이번 연결이 서로에게 좋은 방향으로 이어질 수 있도록, 상황이 달라진 점을 후보자에게 솔직하고 배려 있게 설명해 주세요."
      : "서로에게 좋은 기회가 되길 바랄게요 :)"
  );
  return lines.join("\n");
}

export function buildOrgCandidateRejectedSlackMessage(args: {
  actor: OrgSlackUser;
  candidate: OrgSlackCandidate;
  locale?: OrgLocale;
  previousStage?: string | null;
  roleId: string;
  roleName: string;
  stopNote?: string | null;
  workspace: OrgSlackWorkspace;
}) {
  const roleUrl = buildOrgRoleUrl(args.workspace.workspaceId, args.roleId);
  const rejectingPendingConnection =
    !args.previousStage || args.previousStage === "pending_connection";
  if (args.locale === "en")
    return [
      rejectingPendingConnection
        ? `*Chose not to connect with ${escapeSlackText(args.candidate.name || "the candidate")}*`
        : `*Ended the hiring process with ${escapeSlackText(args.candidate.name || "the candidate")}*`,
      `- *Role*: ${formatSlackLink(roleUrl, args.roleName)}`,
      `- *Candidate*: ${formatCandidate(args.candidate)}`,
      `- *Decided by*: ${formatPerson(args.actor)}`,
      `- *Reason*: ${escapeSlackText(args.stopNote) || "None provided"}`,
      rejectingPendingConnection
        ? "The decision appears in the candidate's view, and Harper will notify them that the company is not moving forward. Notices already shown or sent cannot be recalled."
        : "Harper will notify the candidate that the process has ended. Earlier introductions, direct contact, and notices already shown or sent cannot be recalled.",
    ].join("\n");
  const rawCandidateName = normalizeText(args.candidate.name) || "이 분";
  const politeCandidateName = rawCandidateName.endsWith("님")
    ? rawCandidateName
    : `${rawCandidateName}님`;
  return [
    rejectingPendingConnection
      ? `*${escapeSlackText(politeCandidateName)}과의 연결을 거절했어요*`
      : `*${escapeSlackText(politeCandidateName)}과의 연결을 종료했어요*`,
    `- *역할*: ${formatSlackLink(roleUrl, args.roleName)}`,
    `- *연결 대상*: ${formatCandidate(args.candidate)}`,
    `- *결정한 분*: ${formatPerson(args.actor)}`,
    `- *남긴 이유*: ${formatOptional(args.stopNote)}`,
    rejectingPendingConnection
      ? "회사가 더 진행하지 않기로 했다는 종료 결정이 후보자 화면에 표시되고, Harper가 후보자에게 종료 안내를 진행해요. 이미 표시되거나 전달된 안내는 회수할 수 없어요."
      : "Harper가 후보자에게 회사가 프로세스를 종료했다는 안내를 진행해요. 이미 보낸 소개 이메일이나 회사의 직접 연락, 후보자에게 표시되거나 전달된 종료 안내는 회수할 수 없어요.",
  ].join("\n");
}
