import { renderOrgAgentWebLinks } from "@/lib/org/agent/navigationMarkdown";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { isPostingRoleId } from "@/lib/career/postingLinks";
import { stripCareerReengagementActions } from "@/lib/career/reengagementActions";
import { stripMockInterviewMarkers } from "@/lib/career/mockInterviewOffers";
import { extractStartOfferPayload } from "@/lib/career/simulation/startOfferPayload";
import { stripOpportunityRunMarkers } from "@/lib/opportunityDiscovery/messageMarker";
import {
  buildHarperEmailFooterHtml,
  HARPER_EMAIL_FOOTER_TEXT,
} from "@/lib/email/harperFooter";

function emailHref(value: string, baseUrl: string) {
  if (isPostingRoleId(value))
    return `${baseUrl}/career/history?historyTab=new&id=${encodeURIComponent(value)}`;
  try {
    const url = new URL(value, baseUrl);
    return ["https:", "http:", "mailto:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

type EmailAstNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: EmailAstNode[];
};
const EMAIL_STYLES: Record<string, string> = {
  h1: "font-size:17px;margin:16px 0 8px",
  h2: "font-size:17px;margin:16px 0 8px",
  h3: "font-size:16px;margin:14px 0 6px",
  p: "margin:0 0 12px;white-space:pre-line",
  blockquote: "margin:12px 0;padding-left:12px;border-left:3px solid #d1d5db",
  ul: "padding-left:24px;margin:8px 0 12px",
  ol: "padding-left:24px;margin:8px 0 12px",
  li: "margin-bottom:4px",
  table: "border-collapse:collapse;width:100%;margin:12px 0",
  th: "border:1px solid #d1d5db;padding:8px;text-align:left;overflow-wrap:break-word;word-break:normal",
  td: "border:1px solid #d1d5db;padding:8px;vertical-align:top;overflow-wrap:break-word;word-break:normal",
  pre: "white-space:pre-wrap;background:#f3f4f6;padding:12px",
  a: "color:#2563eb;text-decoration:underline",
};
function decorateEmailAst(node: EmailAstNode, baseUrl: string): void {
  if (node.children)
    node.children = node.children.map((child) => {
      if (child.tagName === "img")
        return { type: "text", value: String(child.properties?.alt ?? "") };
      if (child.tagName === "input")
        return { type: "text", value: child.properties?.checked ? "☑ " : "☐ " };
      decorateEmailAst(child, baseUrl);
      return child;
    });
  if (node.type !== "element" || !node.tagName) return;
  node.properties ??= {};
  if (node.tagName === "a") {
    const href = node.properties.href
      ? emailHref(String(node.properties.href), baseUrl)
      : "";
    if (href) node.properties.href = href;
    else {
      node.tagName = "span";
      delete node.properties.href;
    }
  }
  if (EMAIL_STYLES[node.tagName])
    node.properties.style = EMAIL_STYLES[node.tagName];
}

function emailPlainText(node: EmailAstNode, parent?: EmailAstNode, depth = 0): string {
  if (node.type === "text") {
    const text = node.value ?? "";
    return !text.trim() && ["root", "table", "thead", "tbody", "tr", "ul", "ol"].includes(parent?.tagName ?? parent?.type ?? "")
      ? ""
      : text;
  }
  const tag = node.tagName;
  if (tag === "br") return "\n";
  if (tag === "pre") {
    const literal = (item: EmailAstNode): string => item.value ?? (item.children ?? []).map(literal).join("");
    return `${literal(node)}\n\n`;
  }
  if (tag === "table") {
    const rows = (item: EmailAstNode): EmailAstNode[] => item.tagName === "tr" ? [item] : (item.children ?? []).flatMap(rows);
    return `${rows(node).map(row => (row.children ?? [])
      .filter(cell => cell.tagName === "th" || cell.tagName === "td")
      .map(cell => emailPlainText(cell).trim()).join(" | ")).join("\n")}\n\n`;
  }
  const children = (node.children ?? [])
    .map(child => emailPlainText(child, node, tag === "ul" || tag === "ol" ? depth + 1 : depth))
    .join("");
  if (tag === "a") {
    const href = String(node.properties?.href ?? "");
    return !href || children.trim() === href ? children : `${children} (${href})`;
  }
  if (tag === "li") {
    const index = (parent?.children ?? []).filter(child => child.tagName === "li").indexOf(node);
    const prefix = parent?.tagName === "ol" ? `${index + Number(parent.properties?.start ?? 1)}. ` : "• ";
    return `${"  ".repeat(Math.max(0, depth - 1))}${prefix}${children.trim()}\n`;
  }
  if (tag === "ul" || tag === "ol") return `\n${children}\n`;
  if (tag && ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"].includes(tag)) return `${children}\n\n`;
  return children;
}

// Only application control payloads are removed here. Wording and meaning are
// authored by the same Career LLM; this renderer only interprets Markdown.
export function emailVisibleMarkdown(content: string) {
  return stripMockInterviewMarkers(
    extractStartOfferPayload(
      stripCareerReengagementActions(stripOpportunityRunMarkers(content))
    ).content
  )
    .replace(
      /\[\[CAREER_CHOICE_BUTTONS\]\][\s\S]*?\[\[\/CAREER_CHOICE_BUTTONS\]\]/g,
      ""
    )
    .replace(/\[\[CAREER_CHOICE_BUTTONS[\s\S]*$/, "")
    .trim();
}

export function wrapEmailHtml(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div data-harper-email-body-container="true" style="max-width:1024px;margin:0 auto"><div data-harper-email-body-content="true" class="harper-email-body" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.4;color:#111827;overflow-wrap:anywhere">${html}</div></div></body></html>`;
}

export function renderReplyEmail(
  content: string,
  options: { baseUrl?: string; footer?: boolean; audience?: "talent" | "company" } = {}
) {
  const markdown = options.audience === "company" ? content : emailVisibleMarkdown(content);
  const baseUrl = options.baseUrl ?? "https://matchharper.com";
  const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSanitize)
      .use(
        () => (tree: unknown) => decorateEmailAst(tree as EmailAstNode, baseUrl)
      )
      .use(rehypeStringify);
  // Both MIME parts use the same sanitized tree; no browser DOM is needed.
  const tree = processor.runSync(processor.parse(markdown));
  const htmlBody = processor.stringify(tree);
  const textBody = emailPlainText(tree as EmailAstNode)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: options.footer
      ? `${textBody}\n\n${HARPER_EMAIL_FOOTER_TEXT}`
      : textBody,
    html: wrapEmailHtml(
      htmlBody + (options.footer ? buildHarperEmailFooterHtml() : "")
    ),
  };
}

/** Company navigation identifiers become ordinary authenticated workspace links. */
export function renderCompanyReplyEmail(content: string, workspaceId: string) {
  return renderReplyEmail(renderOrgAgentWebLinks({ markdown: content, workspaceId }), { audience: "company" });
}
