import { buildOrgHref } from "@/lib/org/routes";

const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";

export type AutoIntroPresentation =
  | "paragraph"
  | "tldr"
  | "bullets"
  | "tldr_bullets";

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
