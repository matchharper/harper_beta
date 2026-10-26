import { buildOrgHref } from "@/lib/org/routes";
import { orgTalentReferenceHref } from "./talentReference";

const HARPER_SITE_ORIGIN = "https://matchharper.com";
const PRIVATE_NAVIGATION_LINK_PATTERN =
  /\]\((home|roles|team|role:[^)\s]+|talent:[^)\s]+)\)/g;
const SLACK_LABELED_LINK_PATTERN = /<(https?:\/\/[^|>]+)\|([^>]+)>/g;
const SLACK_BOLD_PATTERN = /(^|[\s(])\*([^*\n]+)\*/g;
const SLACK_BULLET_PATTERN = /^([ \t]*)•[ \t]+/gm;
const SLACK_DIVIDER_PATTERN = /^-{3,}[ \t]*$/gm;

export function convertSlackMrkdwnToWebMarkdown(value: string) {
  return value
    .replace(
      SLACK_LABELED_LINK_PATTERN,
      (_match, href: string, label: string) =>
        `[${label.replaceAll("]", "\\]")}](${href})`
    )
    .replace(SLACK_BOLD_PATTERN, "$1**$2**")
    .replace(SLACK_BULLET_PATTERN, "$1- ")
    // Slack divider lines need paragraph breaks so GFM cannot read them as setext headings.
    .replace(SLACK_DIVIDER_PATTERN, "\n---\n");
}

/** Converts a saved Slack candidate-introduction body for the web Markdown renderer. */
export function convertSlackCandidateIntroToWebMarkdown(value: string) {
  return convertSlackMrkdwnToWebMarkdown(value);
}

function toHarperWebUrl(args: { target: string; workspaceId: string; roleId?: string | null }) {
  const { target, workspaceId } = args;
  if (target === "home") {
    return `${HARPER_SITE_ORIGIN}${buildOrgHref({
      orgId: workspaceId,
      page: "home",
    })}`;
  }
  if (target === "roles") {
    return `${HARPER_SITE_ORIGIN}${buildOrgHref({
      orgId: workspaceId,
      page: "jobs",
    })}`;
  }
  if (target === "team") {
    return `${HARPER_SITE_ORIGIN}${buildOrgHref({
      orgId: workspaceId,
      page: "team",
    })}`;
  }
  if (target.startsWith("role:")) {
    const roleId = target.slice("role:".length).trim();
    if (!roleId) return null;
    return `${HARPER_SITE_ORIGIN}${buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "pipeline",
      view: "pipeline",
    })}`;
  }
  if (target.startsWith("talent:")) {
    const talentId = target.slice("talent:".length).trim();
    if (!talentId) return null;
    return orgTalentReferenceHref({ talentId, workspaceId, roleId: args.roleId });
  }
  return null;
}

/** Converts private company-side LLM navigation markers for the web surface. */
export function renderOrgAgentWebLinks(args: {
  markdown: string;
  workspaceId: string;
  roleId?: string | null;
}) {
  return args.markdown.replace(
    PRIVATE_NAVIGATION_LINK_PATTERN,
    (match, target: string) => {
      const href = toHarperWebUrl({
        target,
        workspaceId: args.workspaceId,
        roleId: args.roleId,
      });
      return href ? `](${href})` : match;
    }
  );
}
