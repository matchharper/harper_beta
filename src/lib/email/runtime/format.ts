import { renderOrgAgentWebLinks } from "@/lib/org/agent/navigationMarkdown";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { JSDOM } from "jsdom";
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
  const htmlBody = String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSanitize)
      .use(
        () => (tree: unknown) => decorateEmailAst(tree as EmailAstNode, baseUrl)
      )
      .use(rehypeStringify)
      .processSync(markdown)
  );
  const dom = new JSDOM(htmlBody);
  const document = dom.window.document;
  const plain = (node: Node, depth = 0): string => {
    if (node.nodeType === dom.window.Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const parent = node.parentElement?.tagName ?? "";
      return !text.trim() &&
        ["BODY", "TABLE", "THEAD", "TBODY", "TR", "UL", "OL"].includes(parent)
        ? ""
        : text;
    }
    if (!(node instanceof dom.window.Element)) return "";
    const tag = node.tagName;
    if (tag === "BR") return "\n";
    if (tag === "PRE") return `${node.textContent ?? ""}\n\n`;
    if (tag === "TABLE")
      return `${Array.from(node.querySelectorAll("tr"))
        .map((row) =>
          Array.from(row.children)
            .map((cell) =>
              Array.from(cell.childNodes)
                .map((child) => plain(child))
                .join("")
                .trim()
            )
            .join(" | ")
        )
        .join("\n")}\n\n`;
    const children = Array.from(node.childNodes)
      .map((child) =>
        plain(child, ["UL", "OL"].includes(tag) ? depth + 1 : depth)
      )
      .join("");
    if (tag === "A") {
      const href = node.getAttribute("href") ?? "";
      return !href || children.trim() === href
        ? children
        : `${children} (${href})`;
    }
    if (tag === "LI") {
      const parent = node.parentElement;
      const prefix =
        parent?.tagName === "OL"
          ? `${Array.from(parent.children).indexOf(node) + Number(parent.getAttribute("start") || 1)}. `
          : "• ";
      return `${"  ".repeat(Math.max(0, depth - 1))}${prefix}${children.trim()}\n`;
    }
    if (["UL", "OL"].includes(tag)) return `\n${children}\n`;
    if (["P", "H1", "H2", "H3", "H4", "BLOCKQUOTE"].includes(tag))
      return `${children}\n\n`;
    return children;
  };
  const textBody = Array.from(document.body.childNodes)
    .map((node) => plain(node))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  dom.window.close();
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
