import { buildOrgHref } from "@/lib/org/routes";
import { getHarperOwnedUrlRoute } from "@/lib/urlDisplay";

const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const REFERENCE_PATTERN = new RegExp(`@?\\[([^\\]]+)\\]\\(talent:([^)\\s]+)\\)|\\b(?:talent:)?(${UUID_SOURCE})\\b`, "gi");

export type OrgTalentReference = { talentId: string; label: string | null };
export type OrgTalentReferenceSegment = { text: string; reference?: OrgTalentReference };

/** Parse identifiers only; the server still decides whether the profile is visible. */
export function splitOrgTalentReferences(content: string): OrgTalentReferenceSegment[] {
  const segments: OrgTalentReferenceSegment[] = [];
  let end = 0;
  for (const match of content.matchAll(REFERENCE_PATTERN)) {
    const start = match.index;
    if (start > end) segments.push({ text: content.slice(end, start) });
    segments.push({ text: match[0], reference: { talentId: match[2] ?? match[3], label: match[1] ?? null } });
    end = start + match[0].length;
  }
  if (end < content.length) segments.push({ text: content.slice(end) });
  return segments;
}

export function orgTalentReferenceHref(args: { talentId: string; workspaceId: string; roleId?: string | null }) {
  const roleId = args.roleId && args.roleId !== "all" ? args.roleId : null;
  return `https://matchharper.com${buildOrgHref({
    detail: { talentId: args.talentId, roleId }, orgId: args.workspaceId,
    page: roleId ? "role" : "home", roleId,
  })}`;
}

export function readOrgTalentReferenceHref(href: string, workspaceId: string) {
  const route = getHarperOwnedUrlRoute(href);
  if (!route) return null;
  const url = new URL(route, "https://matchharper.com");
  if (!url.pathname.startsWith("/org/") || url.searchParams.get("orgId") !== workspaceId) return null;
  const talentId = url.searchParams.get("talentId");
  if (!talentId) return null;
  return {
    talentId,
    roleId: url.searchParams.get("detailRoleId") || url.searchParams.get("roleId"),
    recommendationId: url.searchParams.get("recommendationId"),
  };
}

type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] };

/** Transform text nodes, not URL destinations or code blocks, into navigable references. */
export function remarkOrgTalentReferences(args: { workspaceId: string; roleId?: string | null }) {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (!node.children || ["link", "image", "code", "linkReference"].includes(node.type)) return;
      node.children = node.children.flatMap(child => {
        if ((child.type === "text" || child.type === "inlineCode") && child.value) {
          const segments = splitOrgTalentReferences(child.value);
          if (segments.some(segment => segment.reference)) return segments.map(segment => segment.reference
            ? { type: "link", url: orgTalentReferenceHref({ ...args, talentId: segment.reference.talentId }),
                children: [{ type: "text", value: segment.reference.label ?? segment.reference.talentId }] }
            : { type: child.type, value: segment.text });
        }
        visit(child);
        return [child];
      });
    };
    visit(tree);
  };
}
