import { buildOrgHref } from "@/lib/org/routes";

const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";

export type AutoIntroPresentation =
  | "paragraph"
  | "tldr"
  | "bullets"
  | "tldr_bullets";

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
    page: "jobs",
    roleId: args.roleId,
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
  return `*<${buildAutoIntroCandidateProfileUrl(args)}|${escapeSlackLinkLabel(
    args.name
  )}>*`;
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
    page: "jobs",
    roleId: args.roleId,
  });
  return new URL(
    href,
    `${normalizeSiteOrigin(
      args.publicSiteUrl ?? process.env.NEXT_PUBLIC_SITE_URL
    )}/`
  ).toString();
}

export function autoIntroRoleStatusLabel(value: unknown) {
  const status = String(value ?? "")
    .trim()
    .toLowerCase();
  if (status === "paused" || status === "on_hold") return "일시중지";
  if (status === "top_priority") return "최우선";
  return "진행중";
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
      "*현재 Role 현황*",
      "연결 여부를 결정해야 하는 후보자 수를 정리했습니다.",
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
        text: "*현재 Role 현황*\n연결 여부를 결정해야 하는 후보자 수를 정리했습니다.",
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
  return `후보자별 자세한 정보는 <${buildAutoIntroWorkspaceJobsUrl(
    args
  )}|Harper에서 확인>하신 뒤, 해당 화면에서 연결을 수락하거나 거절하실 수 있습니다.`;
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
  sentences: string[];
}) {
  const internalReason = String(args.internalReason ?? "")
    .replace(/\r/g, "")
    .trim();
  if (args.reasonMode === "author") {
    if (!internalReason) {
      throw new Error("Author candidate has no detailed reason");
    }
    const compactReason = internalReason.replace(/\s+/g, " ").trim();
    if (compactReason === args.sentences.join(" ")) {
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
