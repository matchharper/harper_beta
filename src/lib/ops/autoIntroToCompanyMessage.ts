import { buildOrgHref } from "@/lib/org/routes";
import { getOrgRoleStatusPresentation } from "@/lib/org/roleStatus";

const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";
export const AUTO_INTRO_SLACK_REVIEW_ACTION_ID = "harper_talent_review:open";

export type AutoIntroPresentation =
  | "paragraph"
  | "tldr"
  | "bullets"
  | "tldr_bullets";

export type AutoIntroSlackProfile = {
  currentRole: string | null;
  education: string | null;
  harperNote: string | null;
  location: string | null;
  preferences: string[];
  tldr: string;
  workSummary: Array<{
    bullets: string[];
    heading: string;
  }>;
};

export type AutoIntroRoleSummaryItem = {
  pendingDecisionCount: number;
  roleId: string;
  roleTitle: string;
  status: string | null;
  workspaceId: string;
};

export type AutoIntroRoleSummary = {
  companyName: string;
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
  return [
    ...(String(args.introBody ?? "").trim()
      ? [String(args.introBody).trim()]
      : []),
    [
      "*현재 채용 현황*",
      "현재 연결 여부를 결정해야 하는 후보자를 정리했습니다.",
      ...rows,
    ].join("\n"),
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

export function validateAutoIntroSlackProfile(
  value: AutoIntroSlackProfile
): AutoIntroSlackProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Candidate Slack profile must be an object");
  }
  const tldr = normalizedSlackProfileText(value.tldr, 2_400);
  if (!tldr) throw new Error("Candidate Slack profile requires a TL;DR");

  const workSummary = Array.isArray(value.workSummary)
    ? value.workSummary.slice(0, 10).flatMap((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
        const heading = normalizedSlackProfileText(raw.heading, 320);
        if (!heading) return [];
        const bullets = Array.isArray(raw.bullets)
          ? raw.bullets
              .map((bullet) => normalizedSlackProfileText(bullet, 700))
              .filter((bullet): bullet is string => Boolean(bullet))
              .slice(0, 8)
          : [];
        return [{ bullets, heading }];
      })
    : [];
  const preferences = Array.isArray(value.preferences)
    ? value.preferences
        .map((item) => normalizedSlackProfileText(item, 700))
        .filter((item): item is string => Boolean(item))
        .slice(0, 8)
    : [];

  return {
    currentRole: normalizedSlackProfileText(value.currentRole, 500),
    education: normalizedSlackProfileText(value.education, 500),
    harperNote: normalizedSlackProfileText(value.harperNote, 2_000),
    location: normalizedSlackProfileText(value.location, 500),
    preferences,
    tldr,
    workSummary,
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
    `*TL;DR* - ${escapeSlackText(profile.tldr)}`,
    ...(profile.harperNote
      ? ["", `*Harper Note* - ${escapeSlackText(profile.harperNote)}`]
      : []),
  ];

  if (profile.workSummary.length > 0) {
    lines.push("", "--------", "Work Summary:");
    for (const item of profile.workSummary) {
      lines.push(`*${escapeSlackText(item.heading)}*`);
      lines.push(
        ...item.bullets.map((bullet) => `• ${escapeSlackText(bullet)}`)
      );
    }
  }
  if (profile.preferences.length > 0) {
    lines.push(
      "",
      "------------",
      "*Preferences:*",
      ...profile.preferences.map((item) => `• ${escapeSlackText(item)}`)
    );
  }

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

export function validateAutoIntroInternalReason(args: {
  internalReason?: string | null;
  reasonMode: "author" | "codex";
  sentences?: string[];
  slackSummary?: string | null;
}) {
  const internalReason = String(args.internalReason ?? "")
    .replace(/\r/g, "")
    .trim();
  if (args.reasonMode === "author") {
    if (!internalReason) {
      throw new Error("Author candidate has no detailed reason");
    }
    const compactReason = internalReason.replace(/\s+/g, " ").trim();
    const compactSlackSummary = String(
      args.slackSummary ?? args.sentences?.join(" ") ?? ""
    )
      .replace(/\s+/g, " ")
      .trim();
    if (compactSlackSummary && compactReason === compactSlackSummary) {
      throw new Error("Detailed reason must differ from Slack summary");
    }
    return internalReason;
  }
  if (internalReason) {
    throw new Error("Codex candidate must not replace stored reason");
  }
  return null;
}

export function escapeAutoIntroSlackHeading(value: unknown) {
  return escapeSlackText(value).replace(/\*/g, "");
}
