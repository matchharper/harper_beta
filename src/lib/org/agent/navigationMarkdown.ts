import { buildOrgHref } from "@/lib/org/routes";

const HARPER_SITE_ORIGIN = "https://matchharper.com";
const PRIVATE_NAVIGATION_LINK_PATTERN =
  /\]\((home|roles|team|role:[^)\s]+|talent:[^)\s]+)\)/g;
const SLACK_LABELED_LINK_PATTERN = /<(https?:\/\/[^|>]+)\|([^>]+)>/g;
const SLACK_BOLD_PATTERN = /(^|[\s(])\*([^*\n]+)\*/g;

export function convertSlackMrkdwnToWebMarkdown(value: string) {
  return value
    .replace(
      SLACK_LABELED_LINK_PATTERN,
      (_match, href: string, label: string) =>
        `[${label.replaceAll("]", "\\]")}](${href})`
    )
    .replace(SLACK_BOLD_PATTERN, "$1**$2**");
}

function toHarperWebUrl(args: { target: string; workspaceId: string }) {
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
      page: "jobs",
      roleId,
      view: "pipeline",
    })}`;
  }
  if (target.startsWith("talent:")) {
    const talentId = target.slice("talent:".length).trim();
    if (!talentId) return null;
    return `${HARPER_SITE_ORIGIN}${buildOrgHref({
      detail: { talentId },
      orgId: workspaceId,
      page: "jobs",
      roleId: "all",
    })}`;
  }
  return null;
}

/** Converts private company-side LLM navigation markers for the web surface. */
export function renderOrgAgentWebLinks(args: {
  markdown: string;
  workspaceId: string;
}) {
  return args.markdown.replace(
    PRIVATE_NAVIGATION_LINK_PATTERN,
    (match, target: string) => {
      const href = toHarperWebUrl({
        target,
        workspaceId: args.workspaceId,
      });
      return href ? `](${href})` : match;
    }
  );
}
