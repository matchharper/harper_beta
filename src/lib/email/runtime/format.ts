import { wrapHarperEmailBody } from "../layout";
import { renderOrgAgentWebLinks } from "@/lib/org/agent/navigationMarkdown";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { isPostingRoleId } from "@/lib/career/postingLinks";
import { careerOpportunityUrl } from "@/lib/career/opportunityLinks";
import { stripCareerReengagementActions } from "@/lib/career/reengagementActions";
import { stripMockInterviewMarkers } from "@/lib/career/mockInterviewOffers";
import { extractStartOfferPayload } from "@/lib/career/simulation/startOfferPayload";
import { stripOpportunityRunMarkers } from "@/lib/opportunityDiscovery/messageMarker";
import {
  formatCareerInlineCardMarkdown,
  parseCareerInlineUi,
} from "@/lib/career/inlineUi";
import {
  extractCareerChoiceBlocks,
  type CareerChoice,
} from "@/lib/career/choiceButtons";
import {
  buildHarperEmailFooterHtml,
  HARPER_EMAIL_FOOTER_TEXT,
} from "@/lib/email/harperFooter";

function emailHref(value: string, baseUrl: string) {
  if (isPostingRoleId(value))
    return careerOpportunityUrl(value, baseUrl);
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
  h2: "font-size:16px;line-height:1.35;margin:18px 0 8px;font-weight:500",
  h3: "font-size:15px;line-height:1.4;margin:16px 0 6px;font-weight:500",
  p: "white-space:pre-line",
  blockquote: "margin:12px 0;padding-left:12px;border-left:3px solid #d1d5db",
  ul: "margin:8px 0 16px 20px;padding:0",
  ol: "margin:8px 0 16px 20px;padding:0",
  li: "margin:4px 0",
  table: "border-collapse:collapse;width:100%;margin:12px 0",
  th: "border:1px solid #d1d5db;padding:8px;text-align:left;overflow-wrap:break-word;word-break:normal",
  td: "border:1px solid #d1d5db;padding:8px;vertical-align:top;overflow-wrap:break-word;word-break:normal",
  pre: "white-space:pre-wrap;background:#f3f4f6;padding:12px",
  a: "color:#2563eb;text-decoration:underline",
  hr: "border:0;border-top:1px solid #e5e7eb;margin:18px 0;",
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
  const visibleContent = parseCareerInlineUi(content)
    .map((part) =>
      part.kind === "text"
        ? part.content
        : part.kind === "ui" && part.reference.type === "card"
          ? formatCareerInlineCardMarkdown(part.reference)
          : ""
    )
    .filter(Boolean)
    .join("\n\n");
  return stripMockInterviewMarkers(
    extractStartOfferPayload(
      stripCareerReengagementActions(stripOpportunityRunMarkers(visibleContent))
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${wrapHarperEmailBody(html)}</body></html>`;
}

const CHOICE_MARKER = (index: number) => `HARPEREMAILCHOICES${index}END`;

function escapeEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Outlook desktop ignores padding on a link; `mso-padding-alt` gives its cell the same padding there. */
const CHOICE_BUTTON_PADDING = "6px 12px";

function choiceButtonsHtml(links: { label: string; href: string }[]) {
  const rows = links.map(({ label, href }) =>
    `<tr><td style="padding:0 0 8px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:#000000;mso-padding-alt:${CHOICE_BUTTON_PADDING};"><a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:${CHOICE_BUTTON_PADDING};color:#ffffff;font-size:14px;line-height:1.4;font-weight:200;text-decoration:none;border-radius:8px;">${escapeEmailHtml(label)}</a></td></tr></table></td></tr>`
  );
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 8px 0;">${rows.join("")}</table>`;
}

/** A plain-text reader answers by replying; a web choice keeps its link. */
function choiceButtonsText(links: { label: string; href: string }[]) {
  return links
    .map(({ label, href }) => (href.startsWith("mailto:") ? `• ${label}` : `• ${label}: ${href}`))
    .join("\n");
}

export type EmailChoiceHref = (choice: CareerChoice) => string;

export function renderReplyEmail(
  content: string,
  options: {
    baseUrl?: string;
    footer?: boolean;
    audience?: "talent" | "company";
    /** Where each of Harper's answer options leads; without it they are left out. */
    choiceHref?: EmailChoiceHref;
  } = {}
) {
  // Each block's buttons go where Harper wrote it; blocks without usable choices leave nothing behind.
  const buttonSets: Array<{ marker: string; links: { label: string; href: string }[] }> = [];
  const extracted =
    options.audience === "company"
      ? null
      : extractCareerChoiceBlocks(content, (index) => `\n\n${CHOICE_MARKER(index)}\n\n`);
  let withChoices = extracted?.content ?? content;
  extracted?.blocks.forEach((choices, index) => {
    const links = options.choiceHref
      ? choices.flatMap((choice) => {
          const href = options.choiceHref?.(choice) ?? "";
          return href ? [{ label: choice.label, href }] : [];
        })
      : [];
    if (links.length) buttonSets.push({ marker: CHOICE_MARKER(index), links });
    else withChoices = withChoices.replace(CHOICE_MARKER(index), "");
  });
  const markdown = extracted ? emailVisibleMarkdown(withChoices) : content;
  const baseUrl = options.baseUrl ?? "https://matchharper.com";
  const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkCjkFriendly)
      .use(remarkRehype)
      .use(rehypeSanitize)
      .use(
        () => (tree: unknown) => decorateEmailAst(tree as EmailAstNode, baseUrl)
      )
      .use(rehypeStringify);
  // Both MIME parts use the same sanitized tree; no browser DOM is needed.
  const tree = processor.runSync(processor.parse(markdown));
  let htmlBody = processor.stringify(tree);
  let textBody = emailPlainText(tree as EmailAstNode);
  // A marker that did not become its own paragraph (inside code, say) is removed and its buttons follow the body.
  const trailing: typeof buttonSets = [];
  for (const set of buttonSets) {
    const paragraph = new RegExp(`<p[^>]*>${set.marker}</p>`);
    if (paragraph.test(htmlBody)) {
      htmlBody = htmlBody.replace(paragraph, () => choiceButtonsHtml(set.links));
      textBody = textBody.replace(set.marker, () => choiceButtonsText(set.links));
    } else {
      htmlBody = htmlBody.replaceAll(set.marker, "");
      textBody = textBody.replaceAll(set.marker, "");
      trailing.push(set);
    }
  }
  if (trailing.length) {
    htmlBody += trailing.map((set) => choiceButtonsHtml(set.links)).join("");
    textBody += `\n\n${trailing.map((set) => choiceButtonsText(set.links)).join("\n")}`;
  }
  textBody = textBody.replace(/\n{3,}/g, "\n\n").trim();
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
