import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkStringify from "remark-stringify";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { isPostingRoleId, normalizePostingRoleId } from "../postingLinks";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

type MarkdownNode = {
  type: string; value?: string; url?: string; identifier?: string; children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

/** null means a non-opportunity link; an empty ID means a malformed opportunity link. */
function opportunityId(href: string, baseUrl: string): string | null {
  if (isPostingRoleId(href)) return normalizePostingRoleId(href).toLowerCase();
  try {
    const url = new URL(href, baseUrl);
    const ownHosts = new Set([new URL(baseUrl).host, "matchharper.com", "www.matchharper.com"]);
    if (!ownHosts.has(url.host)) return null;
    // /jobs/:slug is a separate public-posting reader, not a saved Career role.
    const id = url.pathname === "/career/history" ? url.searchParams.get("id") : null;
    return id === null ? null : isPostingRoleId(id) ? normalizePostingRoleId(id).toLowerCase() : "";
  } catch { return null; }
}

/** Remove unsafe links from the Markdown tree, retaining their visible contents. */
export async function unlinkUnavailableCareerRoles(args: {
  markdown: string; admin: TalentAdminClient; userId: string; baseUrl?: string;
}): Promise<string> {
  const baseUrl = args.baseUrl ?? getConfiguredPublicSiteUrl();
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkCjkFriendly).use(remarkStringify);
  const tree = processor.parse(args.markdown);
  const definitions = new Map<string, string>();
  const links: Array<{ node: MarkdownNode; id: string }> = [];
  const visit = (node: MarkdownNode, fn: (node: MarkdownNode) => void) => {
    fn(node);
    for (const child of node.children ?? []) visit(child, fn);
  };
  visit(tree, node => { if (node.type === "definition" && node.identifier && node.url) definitions.set(node.identifier, node.url); });
  visit(tree, node => {
    const href = node.type === "link" ? node.url : node.type === "linkReference" && node.identifier ? definitions.get(node.identifier) : undefined;
    if (typeof href !== "string") return;
    const id = opportunityId(href, baseUrl);
    if (id !== null) links.push({ node, id });
  });
  if (!links.length) return args.markdown;
  const ids = [...new Set(links.map(link => link.id).filter(Boolean))];
  const available = new Set<string>();
  if (ids.length) {
    try {
      const [roles, recommendations] = await Promise.all([
        args.admin.from("company_roles").select("role_id").in("role_id", ids),
        args.admin.from("talent_opportunity_recommendation").select("role_id")
          .eq("talent_id", args.userId).in("role_id", ids),
      ]);
      if (!roles.error && !recommendations.error) {
        const owned = new Set((recommendations.data ?? []).map(row => row.role_id.toLowerCase()));
        for (const row of roles.data ?? []) if (owned.has(row.role_id.toLowerCase())) available.add(row.role_id.toLowerCase());
      }
    } catch {
      // Link lookup failure must never turn a prepared email into a failed send.
    }
  }
  const blocked = new Set(links.filter(link => !available.has(link.id)).map(link => link.node));
  if (!blocked.size) return args.markdown;
  visit(tree, node => {
    if (!node.children) return;
    node.children = node.children.flatMap(child => {
      if (!blocked.has(child)) return [child];
      // GFM recreates even escaped URL autolinks. Preserve a URL used as a
      // label as literal text in both email and saved Career history.
      visit(child, label => {
        if (label.type === "text" && /(?:https?:\/\/|www\.)/i.test(label.value ?? "")) label.type = "inlineCode";
      });
      return child.children ?? [];
    });
  });
  return processor.stringify(tree).trimEnd();
}
