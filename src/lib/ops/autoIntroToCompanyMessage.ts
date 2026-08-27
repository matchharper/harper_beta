import { buildOrgHref } from "@/lib/org/routes";
import {
  HARPER_ROLE_QUICK_ACTION_PREFIX,
  ORG_ROLE_QUICK_ACTIONS,
} from "@/lib/org/roleQuickActions";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";

const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";
export const AUTO_INTRO_SLACK_REVIEW_ACTION_ID = "harper_talent_review:open";

export type AutoIntroPresentation =
  | "paragraph"
  | "tldr"
  | "bullets"
  | "tldr_bullets";

export type AutoIntroSlackProfile = {
  body: string;
  currentRole: string | null;
  education: string | null;
  location: string | null;
};

export type AutoIntroRoleSummaryItem = {
  pendingDecisionCount: number;
  roleId: string;
  roleTitle: string;
  status: string | null;
  workspaceId: string;
};

export type AutoIntroCandidateReplyReminder = {
  candidateName: string;
  expectsDocument: boolean;
  recommendationId: string | null;
  roleId: string;
  roleTitle: string;
  talentId: string;
  workspaceId: string;
};

export type AutoIntroUpcomingMeetingReminder = {
  attendeeNames: string[];
  candidateName: string;
  confirmedStartAt: string;
  recommendationId: string | null;
  roleId: string;
  roleTitle: string;
  talentId: string;
  workspaceId: string;
};

export type AutoIntroRoleSummary = {
  companyName: string;
  reminders?: {
    candidateReplies: AutoIntroCandidateReplyReminder[];
    upcomingMeetings: AutoIntroUpcomingMeetingReminder[];
  };
  roles: AutoIntroRoleSummaryItem[];
  workspaceId: string;
};

export function groupAutoIntroItemsByWorkspaceAndRole<
  T extends { roleId: string; workspaceId: string },
>(items: T[]) {
  const workspaces = new Map<
    string,
    {
      items: T[];
      roles: Map<string, T[]>;
      workspaceId: string;
    }
  >();
  for (const item of items) {
    const workspace = workspaces.get(item.workspaceId) ?? {
      items: [],
      roles: new Map<string, T[]>(),
      workspaceId: item.workspaceId,
    };
    workspace.items.push(item);
    const roleItems = workspace.roles.get(item.roleId) ?? [];
    roleItems.push(item);
    workspace.roles.set(item.roleId, roleItems);
    workspaces.set(item.workspaceId, workspace);
  }
  return Array.from(workspaces.values()).map((workspace) => ({
    items: workspace.items,
    roles: Array.from(workspace.roles, ([roleId, roleItems]) => ({
      items: roleItems,
      roleId,
    })),
    workspaceId: workspace.workspaceId,
  }));
}

function normalizeSiteOrigin(value?: string | null) {
  const configured = String(value ?? "").trim();
  const candidate = configured || DEFAULT_PUBLIC_SITE_URL;
  try {
    return new URL(
      /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`
    ).origin;
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

function escapeSlackText(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeSlackLinkLabel(value: unknown) {
  return escapeSlackText(value).replace(/\|/g, "&#124;");
}

export function buildAutoIntroCandidateProfileUrl(args: {
  publicSiteUrl?: string | null;
  recommendationId?: string | null;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const href = buildOrgHref({
    detail: {
      recommendationId: args.recommendationId,
      roleId: args.roleId,
      talentId: args.talentId,
      workspaceId: args.workspaceId,
    },
    orgId: args.workspaceId,
    page: "role",
    roleId: args.roleId,
    tab: "pipeline",
    view: "pipeline",
  });
  return new URL(
    href,
    `${normalizeSiteOrigin(
      args.publicSiteUrl ?? process.env.NEXT_PUBLIC_SITE_URL
    )}/`
  ).toString();
}

export function buildAutoIntroCandidateNameLink(args: {
  name: string;
  publicSiteUrl?: string | null;
  recommendationId?: string | null;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  return `<${buildAutoIntroCandidateProfileUrl(args)}|${escapeSlackLinkLabel(
    args.name
  )}>`;
}

export function buildAutoIntroWorkspaceJobsUrl(args: {
  publicSiteUrl?: string | null;
  workspaceId: string;
}) {
  const href = buildOrgHref({
    orgId: args.workspaceId,
    page: "jobs",
    roleId: "all",
  });
  return new URL(
    href,
    `${normalizeSiteOrigin(
      args.publicSiteUrl ?? process.env.NEXT_PUBLIC_SITE_URL
    )}/`
  ).toString();
}

export function buildAutoIntroRoleJobsUrl(args: {
  publicSiteUrl?: string | null;
  roleId: string;
  workspaceId: string;
}) {
  const href = buildOrgHref({
    orgId: args.workspaceId,
    page: "role",
    roleId: args.roleId,
    tab: "pipeline",
    view: "pipeline",
  });
  return new URL(
    href,
    `${normalizeSiteOrigin(
      args.publicSiteUrl ?? process.env.NEXT_PUBLIC_SITE_URL
    )}/`
  ).toString();
}

export function autoIntroRoleStatusLabel(value: unknown) {
  return getOrgRoleStatusPresentation(value).label;
}

function honorificName(value: unknown, fallback: string) {
  const name = String(value ?? "").trim() || fallback;
  return name.endsWith("님") ? name : `${name}님`;
}

function autoIntroReminderRoleLink(args: {
  publicSiteUrl?: string | null;
  roleId: string;
  roleTitle: string;
  workspaceId: string;
}) {
  return `<${buildAutoIntroRoleJobsUrl(args)}|${escapeSlackLinkLabel(
    args.roleTitle
  )}>`;
}

function autoIntroReminderCandidateLink(args: {
  candidateName: string;
  publicSiteUrl?: string | null;
  recommendationId: string | null;
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  return buildAutoIntroCandidateNameLink({
    ...args,
    name: honorificName(args.candidateName, "후보자"),
  });
}

export function formatAutoIntroReminderKstDateTime(value: unknown) {
  const date = new Date(String(value ?? "").trim());
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Seoul",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");
  return month && day && hour && minute
    ? `${month}월 ${day}일 ${hour}:${minute}`
    : null;
}

export function buildAutoIntroRoleSummaryReminderText(args: {
  publicSiteUrl?: string | null;
  summary: AutoIntroRoleSummary;
}) {
  const replyLines = (args.summary.reminders?.candidateReplies ?? []).map(
    (reminder) => {
      const roleLink = autoIntroReminderRoleLink({
        ...reminder,
        publicSiteUrl: args.publicSiteUrl,
      });
      const candidateLink = autoIntroReminderCandidateLink({
        ...reminder,
        publicSiteUrl: args.publicSiteUrl,
      });
      const receivedCopy = reminder.expectsDocument
        ? `${candidateLink}께 이력서를 요청했고, 자료를 받았어요.`
        : `질문하신 내용을 ${candidateLink}께 전달했고 답변을 받았어요.`;
      return `• ${roleLink} 역할과 관련해 ${receivedCopy} 연결을 받으실지, 거절하실지 알려 주세요.`;
    }
  );
  const meetingLines = (args.summary.reminders?.upcomingMeetings ?? []).flatMap(
    (reminder) => {
      const scheduledAt = formatAutoIntroReminderKstDateTime(
        reminder.confirmedStartAt
      );
      if (!scheduledAt) return [];
      const roleLink = autoIntroReminderRoleLink({
        ...reminder,
        publicSiteUrl: args.publicSiteUrl,
      });
      const candidateLink = autoIntroReminderCandidateLink({
        ...reminder,
        publicSiteUrl: args.publicSiteUrl,
      });
      const attendeeNames = Array.from(
        new Set(
          reminder.attendeeNames
            .map((name) => honorificName(name, ""))
            .filter((name) => name !== "님")
        )
      );
      const attendees = attendeeNames.length
        ? attendeeNames.map(escapeSlackText).join(", ")
        : "일정 담당자";
      return [
        `• ${scheduledAt} KST에 ${candidateLink}과 ${roleLink} 역할의 미팅이 예정되어 있어요. 참석자: ${attendees}`,
      ];
    }
  );
  const lines = [...replyLines, ...meetingLines];
  return lines.length
    ? ["*확인이 필요한 항목이 있습니다.*", ...lines].join("\n")
    : null;
}

export function buildAutoIntroRoleSummaryText(args: {
  introBody?: string | null;
  publicSiteUrl?: string | null;
  summary: AutoIntroRoleSummary;
}) {
  const rows = args.summary.roles.map(
    (role) =>
      `<${buildAutoIntroRoleJobsUrl({
        publicSiteUrl: args.publicSiteUrl,
        roleId: role.roleId,
        workspaceId: role.workspaceId,
      })}|${escapeSlackLinkLabel(role.roleTitle)}> | ${autoIntroRoleStatusLabel(
        role.status
      )} | ${role.pendingDecisionCount}명`
  );
  const reminderText = buildAutoIntroRoleSummaryReminderText(args);
  return [
    ...(String(args.introBody ?? "").trim()
      ? [String(args.introBody).trim()]
      : []),
    [
      "*현재 채용 현황*",
      "현재 연결 여부를 결정해야 하는 후보자를 정리했습니다.",
      ...rows,
    ].join("\n"),
    ...(reminderText ? [reminderText] : []),
  ].join("\n\n");
}

function splitSlackSectionText(value: string, maxLength = 2_900) {
  const chunks: string[] = [];
  let remaining = value.trim();
  while (remaining.length > maxLength) {
    const candidate = remaining.slice(0, maxLength);
    const paragraphBreak = candidate.lastIndexOf("\n\n");
    const lineBreak = candidate.lastIndexOf("\n");
    const splitAt =
      paragraphBreak > maxLength / 2
        ? paragraphBreak
        : lineBreak > maxLength / 2
          ? lineBreak
          : maxLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function attachAutoIntroSlackReviewAction(args: {
  blocks?: Array<Record<string, unknown>>;
  candidateCount: number;
  messageBody: string;
}) {
  if (!Number.isSafeInteger(args.candidateCount) || args.candidateCount <= 0) {
    throw new Error("Review action requires at least one candidate");
  }
  const contentBlocks = args.blocks?.length
    ? args.blocks
    : splitSlackSectionText(args.messageBody).map((text) => ({
        text: { text, type: "mrkdwn" },
        type: "section",
      }));
  return [
    ...contentBlocks,
    { type: "divider" },
    {
      block_id: "harper_auto_intro_review_actions",
      elements: [
        {
          action_id: AUTO_INTRO_SLACK_REVIEW_ACTION_ID,
          style: "primary",
          text: {
            text: `후보자 ${args.candidateCount}명 검토하기`,
            type: "plain_text",
          },
          type: "button",
          value: "daily_auto_intro",
        },
      ],
      type: "actions",
    },
  ];
}

export function buildAutoIntroRoleSummarySlackBlocks(args: {
  introBody?: string | null;
  publicSiteUrl?: string | null;
  summary: AutoIntroRoleSummary;
}) {
  if (args.summary.roles.length === 0) {
    throw new Error("Role summary has no current roles");
  }
  if (args.summary.roles.length > 99) {
    throw new Error("Role summary exceeds the Slack table row limit");
  }
  const tableCharacterCount = args.summary.roles.reduce(
    (total, role) =>
      total +
      role.roleTitle.length +
      autoIntroRoleStatusLabel(role.status).length +
      String(role.pendingDecisionCount).length,
    "Role상태연결 결정 대기".length
  );
  if (tableCharacterCount > 10_000) {
    throw new Error("Role summary exceeds the Slack table character limit");
  }
  const introBlocks = String(args.introBody ?? "").trim()
    ? splitSlackSectionText(String(args.introBody)).map((text) => ({
        text: { text, type: "mrkdwn" },
        type: "section",
      }))
    : [];
  const reminderText = buildAutoIntroRoleSummaryReminderText(args);
  const reminderBlocks = reminderText
    ? splitSlackSectionText(reminderText).map((text) => ({
        text: { text, type: "mrkdwn" },
        type: "section",
      }))
    : [];
  return [
    ...introBlocks,
    ...(introBlocks.length > 0 ? [{ type: "divider" }] : []),
    {
      text: {
        text: "*현재 채용 현황*\n현재 연결 여부를 결정해야 하는 후보자를 정리했습니다.",
        type: "mrkdwn",
      },
      type: "section",
    },
    {
      column_settings: [
        { is_wrapped: true },
        { align: "center" },
        { align: "right" },
      ],
      rows: [
        [
          { text: "Role", type: "raw_text" },
          { text: "상태", type: "raw_text" },
          { text: "연결 결정 대기", type: "raw_text" },
        ],
        ...args.summary.roles.map((role) => [
          {
            elements: [
              {
                elements: [
                  {
                    text: role.roleTitle,
                    type: "link",
                    url: buildAutoIntroRoleJobsUrl({
                      publicSiteUrl: args.publicSiteUrl,
                      roleId: role.roleId,
                      workspaceId: role.workspaceId,
                    }),
                  },
                ],
                type: "rich_text_section",
              },
            ],
            type: "rich_text",
          },
          {
            text: autoIntroRoleStatusLabel(role.status),
            type: "raw_text",
          },
          { text: `${role.pendingDecisionCount}명`, type: "raw_text" },
        ]),
      ],
      type: "table",
    },
    ...(reminderBlocks.length > 0
      ? [{ type: "divider" }, ...reminderBlocks]
      : []),
    { type: "divider" },
    {
      block_id: "harper_role_quick_actions",
      elements: ORG_ROLE_QUICK_ACTIONS.map((action) => ({
        action_id: `${HARPER_ROLE_QUICK_ACTION_PREFIX}${action.id}`,
        text: {
          text: action.label,
          type: "plain_text",
        },
        type: "button",
        value: action.id,
      })),
      type: "actions",
    },
  ];
}

export function buildAutoIntroWorkspaceActionGuidance(args: {
  publicSiteUrl?: string | null;
  workspaceId: string;
}) {
  return `후보자에 대한 더 자세한 정보는 <${buildAutoIntroWorkspaceJobsUrl(
    args
  )}|Harper 웹에서 확인해 주세요>.`;
}

export function renderAutoIntroCandidateCopy(
  presentation: AutoIntroPresentation,
  sentences: string[]
) {
  const first = sentences[0] as string;
  const last = sentences[sentences.length - 1] as string;
  const middle = sentences.slice(1, -1);
  if (presentation === "paragraph") return sentences.join(" ");
  if (presentation === "tldr") {
    return [`*TL;DR* — ${first}`, [...middle, last].join(" ")].join("\n\n");
  }
  if (presentation === "bullets") {
    return [
      sentences
        .slice(0, -1)
        .map((sentence) => `• ${sentence}`)
        .join("\n"),
      last,
    ].join("\n\n");
  }
  return [
    `*TL;DR* — ${first}`,
    middle.map((sentence) => `• ${sentence}`).join("\n"),
    last,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizedSlackProfileText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizedSlackBodyText(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  return normalized || null;
}

export const AUTO_INTRO_TLDR_MAX_CHARACTERS = 700;
export const AUTO_INTRO_TLDR_MAX_WORDS = 100;
export const AUTO_INTRO_HARPER_NOTE_MAX_CHARACTERS = 320;
export const AUTO_INTRO_HARPER_NOTE_MAX_WORDS = 60;
export const AUTO_INTRO_WORK_SUMMARY_MAX_HEADINGS = 4;
export const AUTO_INTRO_WORK_SUMMARY_MAX_BULLETS_PER_HEADING = 3;
export const AUTO_INTRO_WORK_SUMMARY_MAX_BULLETS = 8;
export const AUTO_INTRO_WORK_SUMMARY_MAX_BULLET_CHARACTERS = 180;
export const AUTO_INTRO_PREFERENCES_MAX_BULLETS = 4;

const AUTO_INTRO_BODY_MAX_CHARACTERS = 12_000;
const AUTO_INTRO_COMPENSATION_PATTERN =
  /\b(?:salary|base pay|base salary|total comp(?:ensation)?|compensation|pay expectations?|pay range|equity package|equity compensation|remuneration)\b|(?:연봉|급여|희망\s*보상|보상\s*(?:조건|수준|패키지)|스톡\s*옵션)/iu;

const AUTO_INTRO_BODY_SECTIONS = [
  { label: "TL;DR", pattern: /^\*TL;DR\*\s*-\s*\S/m },
  { label: "Harper Note", pattern: /^\*Harper Note\*\s*-\s*\S/m },
  { label: "Work Summary", pattern: /^--------\n+Work Summary:\n+\S/m },
  {
    label: "Preferences",
    pattern: /^------------\n+\*Preferences:\*\n+\S/m,
  },
] as const;

export function validateAutoIntroSlackBody(value: unknown) {
  const body = normalizedSlackBodyText(value);
  if (!body) throw new Error("Candidate Slack body is empty");
  if (body.length > AUTO_INTRO_BODY_MAX_CHARACTERS) {
    throw new Error("Candidate Slack body exceeds the maximum length");
  }
  if (body.includes("**")) {
    throw new Error("Candidate Slack body must use Slack mrkdwn, not GFM bold");
  }
  if (/^\*(?:Candidate|Role|Location|Education):\*/m.test(body)) {
    throw new Error("Candidate Slack body must not repeat application headers");
  }
  if (/PLEASE REPLY(?:-ALL)? TO REQUEST AN INTRO/i.test(body)) {
    throw new Error("Candidate Slack body must not repeat the application CTA");
  }
  if (/<(?:!|@|#)/.test(body)) {
    throw new Error("Candidate Slack body must not contain Slack mentions");
  }

  let previousIndex = -1;
  for (const section of AUTO_INTRO_BODY_SECTIONS) {
    const matches = body.match(new RegExp(section.pattern.source, "gm")) ?? [];
    if (matches.length !== 1) {
      throw new Error(
        `Candidate Slack body requires exactly one ${section.label} section`
      );
    }
    const index = body.search(section.pattern);
    if (index <= previousIndex) {
      throw new Error("Candidate Slack body sections are out of order");
    }
    previousIndex = index;
  }

  const layout = body.match(
    /^\*TL;DR\*\s*-\s*(\S[\s\S]*?)\n+\*Harper Note\*\s*-\s*(\S[\s\S]*?)\n+--------\n+Work Summary:\n+(\S[\s\S]*?)\n+------------\n+\*Preferences:\*\n+(\S[\s\S]*)$/
  );
  if (!layout) {
    throw new Error("Candidate Slack body does not match the required layout");
  }
  const [, tldr, harperNote, workSummary, preferences] = layout;
  const wordCount = (text: string) => text.trim().split(/\s+/u).length;
  if (
    tldr.length > AUTO_INTRO_TLDR_MAX_CHARACTERS ||
    wordCount(tldr) > AUTO_INTRO_TLDR_MAX_WORDS
  ) {
    throw new Error("Candidate Slack TL;DR exceeds its length budget");
  }
  if (
    harperNote.length > AUTO_INTRO_HARPER_NOTE_MAX_CHARACTERS ||
    wordCount(harperNote) > AUTO_INTRO_HARPER_NOTE_MAX_WORDS
  ) {
    throw new Error("Candidate Slack Harper Note exceeds its length budget");
  }

  const workLines = workSummary
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let workHeadingCount = 0;
  let workBulletCount = 0;
  let currentHeadingBulletCount = 0;
  for (const line of workLines) {
    if (/^\*[^*\n]+\*$/.test(line)) {
      if (workHeadingCount > 0 && currentHeadingBulletCount === 0) {
        throw new Error("Candidate Slack work heading has no bullets");
      }
      workHeadingCount += 1;
      currentHeadingBulletCount = 0;
      continue;
    }
    const bullet = line.match(/^•\s+(\S.*)$/u);
    if (!bullet || workHeadingCount === 0) {
      throw new Error(
        "Candidate Slack Work Summary must contain only headings and bullets"
      );
    }
    const bulletText = bullet[1];
    if (bulletText.length > AUTO_INTRO_WORK_SUMMARY_MAX_BULLET_CHARACTERS) {
      throw new Error("Candidate Slack work bullet exceeds its length budget");
    }
    currentHeadingBulletCount += 1;
    workBulletCount += 1;
    if (
      currentHeadingBulletCount >
      AUTO_INTRO_WORK_SUMMARY_MAX_BULLETS_PER_HEADING
    ) {
      throw new Error("Candidate Slack work heading has too many bullets");
    }
  }
  if (workHeadingCount === 0 || currentHeadingBulletCount === 0) {
    throw new Error("Candidate Slack Work Summary requires headed evidence");
  }
  if (workHeadingCount > AUTO_INTRO_WORK_SUMMARY_MAX_HEADINGS) {
    throw new Error("Candidate Slack Work Summary has too many headings");
  }
  if (workBulletCount > AUTO_INTRO_WORK_SUMMARY_MAX_BULLETS) {
    throw new Error("Candidate Slack Work Summary has too many bullets");
  }

  const preferenceLines = preferences
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    preferenceLines.length === 0 ||
    preferenceLines.length > AUTO_INTRO_PREFERENCES_MAX_BULLETS ||
    preferenceLines.some((line) => !/^•\s+\S/u.test(line))
  ) {
    throw new Error("Candidate Slack Preferences must contain 1-4 bullets");
  }
  if (AUTO_INTRO_COMPENSATION_PATTERN.test(preferences)) {
    throw new Error(
      "Candidate Slack Preferences must not contain compensation information"
    );
  }
  return [
    `*TL;DR* - ${tldr.trim()}`,
    "",
    `*Harper Note* - ${harperNote.trim()}`,
    "--------",
    "Work Summary:",
    workLines.join("\n"),
    "------------",
    "",
    "*Preferences:*",
    preferenceLines.join("\n"),
  ].join("\n");
}

export function validateAutoIntroSlackProfile(
  value: AutoIntroSlackProfile
): AutoIntroSlackProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Candidate Slack profile must be an object");
  }
  return {
    body: validateAutoIntroSlackBody(value.body),
    currentRole: normalizedSlackProfileText(value.currentRole, 500),
    education: normalizedSlackProfileText(value.education, 500),
    location: normalizedSlackProfileText(value.location, 500),
  };
}

export function renderAutoIntroSlackProfile(value: AutoIntroSlackProfile) {
  const profile = validateAutoIntroSlackProfile(value);
  const lines = [
    ...(profile.currentRole
      ? [`*Role:* ${escapeSlackText(profile.currentRole)}`]
      : []),
    ...(profile.location
      ? [`*Location:* ${escapeSlackText(profile.location)}`]
      : []),
    ...(profile.education
      ? [`*Education:* ${escapeSlackText(profile.education)}`]
      : []),
    "",
    "_*PLEASE REPLY TO REQUEST AN INTRO*_",
    "",
    profile.body,
  ];

  return lines.join("\n").trim();
}

export function validateAutoIntroCandidateSentences(sentences: string[]) {
  if (sentences.length < 4 || sentences.length > 6) {
    throw new Error("Candidate copy must contain 4-6 sentences");
  }
  if (sentences.some((sentence) => !/[.!?。！？]$/.test(sentence))) {
    throw new Error("Candidate sentence is missing punctuation");
  }
  if (sentences.some((sentence) => /[?？]$/.test(sentence))) {
    throw new Error(
      "Candidate copy must not contain an individual CTA or question"
    );
  }
  return sentences;
}

export function escapeAutoIntroSlackHeading(value: unknown) {
  return escapeSlackText(value).replace(/\*/g, "");
}
