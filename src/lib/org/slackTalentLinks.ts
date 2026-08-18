import { buildOrgHref } from "@/lib/org/routes";

const DEFAULT_PUBLIC_SITE_URL = "https://matchharper.com";
const ORG_PAGE_MARKER_PATTERN = /\[([^\]\r\n]+)\]\((home|roles|team)\)/g;
const ROLE_MARKER_PATTERN = /\[([^\]\r\n]+)\]\(role:([^)]+)\)/g;
const TALENT_MARKER_PATTERN = /\[([^\]\r\n]+)\]\(talent:([^)]+)\)/g;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SlackTalentLinkTarget = {
  recommendationId: string;
  roleId: string;
  talentId: string;
};

export type SlackRoleLinkTarget = {
  roleId: string;
};

export type SlackTalentRecommendationRow = SlackTalentLinkTarget & {
  recommendedAt: string;
};

function normalizeSiteOrigin(value?: string | null) {
  const configured = String(value ?? "").trim() || DEFAULT_PUBLIC_SITE_URL;
  const candidate = /^https?:\/\//i.test(configured)
    ? configured
    : `https://${configured}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return DEFAULT_PUBLIC_SITE_URL;
  }
}

function normalizedTalentId(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
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

export function extractSlackTalentMarkerIds(message: string) {
  const talentIds = new Set<string>();
  for (const match of message.matchAll(TALENT_MARKER_PATTERN)) {
    const talentId = normalizedTalentId(match[2]);
    if (UUID_PATTERN.test(talentId)) talentIds.add(talentId);
  }
  return [...talentIds];
}

export function extractSlackRoleMarkerIds(message: string) {
  const roleIds = new Set<string>();
  for (const match of message.matchAll(ROLE_MARKER_PATTERN)) {
    const roleId = normalizedTalentId(match[2]);
    if (UUID_PATTERN.test(roleId)) roleIds.add(roleId);
  }
  return [...roleIds];
}

/**
 * Rows must be newest-first. A Slack thread's role is preferred when the same
 * talent has recommendations for multiple roles.
 */
export function selectSlackTalentLinkTargets(args: {
  preferredRoleId?: string | null;
  rows: SlackTalentRecommendationRow[];
}) {
  const preferredRoleId = String(args.preferredRoleId ?? "").trim();
  const targetByTalentId = new Map<string, SlackTalentLinkTarget>();
  for (const row of args.rows) {
    const talentId = normalizedTalentId(row.talentId);
    const current = targetByTalentId.get(talentId);
    if (
      !current ||
      (row.roleId === preferredRoleId && current.roleId !== preferredRoleId)
    ) {
      targetByTalentId.set(talentId, {
        recommendationId: row.recommendationId,
        roleId: row.roleId,
        talentId: row.talentId,
      });
    }
  }
  return [...targetByTalentId.values()];
}

export function buildSlackTalentProfileUrl(args: {
  publicSiteUrl?: string | null;
  target: SlackTalentLinkTarget;
  workspaceId: string;
}) {
  const href = buildOrgHref({
    detail: {
      recommendationId: args.target.recommendationId,
      talentId: args.target.talentId,
    },
    orgId: args.workspaceId,
    page: "role",
    roleId: args.target.roleId,
    tab: "pipeline",
    view: "pipeline",
  });
  return new URL(
    href,
    `${normalizeSiteOrigin(args.publicSiteUrl)}/`
  ).toString();
}

export function buildSlackWorkspacePageUrl(args: {
  page: "home" | "roles" | "team";
  publicSiteUrl?: string | null;
  workspaceId: string;
}) {
  const href = buildOrgHref(
    args.page === "roles"
      ? { orgId: args.workspaceId, page: "jobs", roleId: "all" }
      : { orgId: args.workspaceId, page: args.page }
  );
  return new URL(
    href,
    `${normalizeSiteOrigin(args.publicSiteUrl)}/`
  ).toString();
}

export function buildSlackRolePipelineUrl(args: {
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
    `${normalizeSiteOrigin(args.publicSiteUrl)}/`
  ).toString();
}

/**
 * Converts the company-side LLM's private talent marker into Slack mrkdwn.
 * Unresolved markers become plain names so internal IDs never reach Slack.
 */
export function renderSlackTalentLinks(args: {
  message: string;
  publicSiteUrl?: string | null;
  targets: SlackTalentLinkTarget[];
  workspaceId: string;
}) {
  const targetByTalentId = new Map(
    args.targets.map((target) => [normalizedTalentId(target.talentId), target])
  );
  return args.message.replace(
    TALENT_MARKER_PATTERN,
    (_marker, rawName: string, rawTalentId: string) => {
      const target = targetByTalentId.get(normalizedTalentId(rawTalentId));
      if (!target) return escapeSlackText(rawName);
      const url = buildSlackTalentProfileUrl({
        publicSiteUrl: args.publicSiteUrl,
        target,
        workspaceId: args.workspaceId,
      });
      return `<${url}|${escapeSlackLinkLabel(rawName)}>`;
    }
  );
}

/**
 * Converts all private company-side LLM navigation markers into Slack mrkdwn.
 * Dynamic markers are linked only after their IDs have been resolved inside
 * the current workspace. Unresolved markers become plain labels so private IDs
 * never reach Slack.
 */
export function renderSlackOrgLinks(args: {
  message: string;
  publicSiteUrl?: string | null;
  roleTargets: SlackRoleLinkTarget[];
  talentTargets: SlackTalentLinkTarget[];
  workspaceId: string;
}) {
  const roleTargetById = new Map(
    args.roleTargets.map((target) => [
      normalizedTalentId(target.roleId),
      target,
    ])
  );
  const withTalentLinks = renderSlackTalentLinks({
    message: args.message,
    publicSiteUrl: args.publicSiteUrl,
    targets: args.talentTargets,
    workspaceId: args.workspaceId,
  });
  const withRoleLinks = withTalentLinks.replace(
    ROLE_MARKER_PATTERN,
    (_marker, rawLabel: string, rawRoleId: string) => {
      const target = roleTargetById.get(normalizedTalentId(rawRoleId));
      if (!target) return escapeSlackText(rawLabel);
      const url = buildSlackRolePipelineUrl({
        publicSiteUrl: args.publicSiteUrl,
        roleId: target.roleId,
        workspaceId: args.workspaceId,
      });
      return `<${url}|${escapeSlackLinkLabel(rawLabel)}>`;
    }
  );
  return withRoleLinks.replace(
    ORG_PAGE_MARKER_PATTERN,
    (_marker, rawLabel: string, page: "home" | "roles" | "team") => {
      const url = buildSlackWorkspacePageUrl({
        page,
        publicSiteUrl: args.publicSiteUrl,
        workspaceId: args.workspaceId,
      });
      return `<${url}|${escapeSlackLinkLabel(rawLabel)}>`;
    }
  );
}
