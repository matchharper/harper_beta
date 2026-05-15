import React, {
  Fragment,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";
import { POSTING_LINK_LABEL } from "@/lib/career/postingLinks";
import { compactUrlLabel, isHarperOwnedUrl, isUrlText } from "@/lib/urlDisplay";
import { careerCx } from "./CareerPrimitives";

const turndownService = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
  hr: "---",
  strongDelimiter: "**",
});

turndownService.remove(["script", "style"]);

const HTML_BLOCK_TAG_PATTERN =
  /<(p|br|ul|ol|li|strong|em|a|h[1-6]|div|span|blockquote|pre|code|table|thead|tbody|tr|td|th)\b/i;
const HTML_PAIR_PATTERN = /<([a-z][\w:-]*)(\s[^>]*)?>[\s\S]*<\/\1>/i;
const HIGHLIGHT_PATTERN = /<<([\s\S]+?)>>/g;
const INLINE_FORMAT_TRAILING_BREAKS_PATTERN =
  /(<(strong|b|em|i)\b[^>]*>)([\s\S]*?)(\s*(?:<br\s*\/?>\s*)+)<\/\2>/gi;
const TRAILING_INLINE_NODE_MARKER = "[[CAREER_TRAILING_INLINE_NODE]]";

function looksLikeHtml(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    HTML_BLOCK_TAG_PATTERN.test(trimmed) || HTML_PAIR_PATTERN.test(trimmed)
  );
}

function normalizeRichText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (!looksLikeHtml(trimmed)) {
    return trimmed;
  }

  const normalizedHtml = normalizeInlineHtmlBreaks(trimmed);
  const markdown = turndownService
    .turndown(normalizedHtml)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return markdown || trimmed;
}

function normalizeInlineHtmlBreaks(value: string) {
  if (!value || !value.includes("<")) return value;

  return value.replace(
    INLINE_FORMAT_TRAILING_BREAKS_PATTERN,
    (match, openTag: string, tagName: string, body: string, breaks: string) => {
      const trimmedBody = body.replace(/\s+$/g, "");
      if (!trimmedBody) return match;
      return `${openTag}${trimmedBody}</${tagName}>${breaks}`;
    }
  );
}

function renderTextWithHighlights(
  content: string,
  keyPrefix: string,
  trailingInlineNode?: ReactNode
): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  const appendText = (text: string, key: string) => {
    if (!text) return;
    if (!trailingInlineNode || !text.includes(TRAILING_INLINE_NODE_MARKER)) {
      nodes.push(<Fragment key={key}>{text}</Fragment>);
      return;
    }

    const parts = text.split(TRAILING_INLINE_NODE_MARKER);
    parts.forEach((part, index) => {
      if (part) {
        nodes.push(<Fragment key={`${key}-part-${index}`}>{part}</Fragment>);
      }
      if (index < parts.length - 1) {
        nodes.push(
          <Fragment key={`${key}-trailing-${index}`}>
            {trailingInlineNode}
          </Fragment>
        );
      }
    });
  };

  HIGHLIGHT_PATTERN.lastIndex = 0;
  while ((match = HIGHLIGHT_PATTERN.exec(content)) !== null) {
    const matchIndex = match.index;

    if (lastIndex < matchIndex) {
      appendText(
        content.slice(lastIndex, matchIndex),
        `${keyPrefix}-text-${matchIndex}`
      );
    }

    const highlightedText = (match[1] ?? "").trim();
    if (highlightedText) {
      nodes.push(
        <span
          key={`${keyPrefix}-highlight-${matchIndex}`}
          className="box-decoration-clone rounded-[4px] bg-beige900/10 px-1.5 py-0.5 font-medium text-beige900"
        >
          {highlightedText}
        </span>
      );
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    appendText(content.slice(lastIndex), `${keyPrefix}-tail-${lastIndex}`);
  }

  if (nodes.length === 0) return content;
  return nodes.length === 1 ? nodes[0] : nodes;
}

function renderNodeWithHighlights(
  node: ReactNode,
  keyPrefix: string,
  trailingInlineNode?: ReactNode
): ReactNode {
  if (typeof node === "string") {
    return renderTextWithHighlights(node, keyPrefix, trailingInlineNode);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <Fragment key={`${keyPrefix}-${index}`}>
        {renderNodeWithHighlights(
          child,
          `${keyPrefix}-${index}`,
          trailingInlineNode
        )}
      </Fragment>
    ));
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    const childProps = node.props;
    if (!childProps?.children) {
      return node;
    }

    return cloneElement(
      node,
      undefined,
      renderNodeWithHighlights(
        childProps.children,
        `${keyPrefix}-child`,
        trailingInlineNode
      )
    );
  }

  return node;
}

function getPlainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getPlainText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getPlainText(node.props.children);
  }

  return "";
}

function isBareUrlLinkNode(node: ReactNode) {
  if (!isValidElement<{ href?: string; children?: ReactNode }>(node)) {
    return false;
  }

  const href = node.props.href?.trim() ?? "";
  if (!href) return false;

  const childText = getPlainText(node.props.children).trim();
  return isUrlText(childText) || childText === href;
}

function isSourceLabelText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "출처:" ||
    normalized === "출처" ||
    normalized === "sources:" ||
    normalized === "sources" ||
    normalized === "source:" ||
    normalized === "source"
  );
}

function renderUrlLinkParagraph(children: ReactNode): ReactNode | null {
  const childNodes = React.Children.toArray(children);
  let linkCount = 0;
  let hasOtherText = false;
  const labelParts: string[] = [];

  for (const child of childNodes) {
    if (isBareUrlLinkNode(child)) {
      linkCount += 1;
      continue;
    }

    const plainText = getPlainText(child);
    if (!isSourceLabelText(plainText)) {
      hasOtherText = true;
      break;
    }

    const normalizedLabel = plainText.replace(/\s+/g, " ").trim();
    if (normalizedLabel) {
      labelParts.push(normalizedLabel);
    }
  }

  if (linkCount === 0 || hasOtherText) return null;

  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm leading-6 text-beige900/80 first:mt-0">
      {labelParts.length > 0 && (
        <span className="mr-1 text-beige900/65">
          {renderTextWithHighlights(labelParts.join(" "), "url-link-label")}
        </span>
      )}
      {childNodes
        .filter((child) => isBareUrlLinkNode(child))
        .map((child, index) => (
          <Fragment key={`url-link-${index}`}>{child}</Fragment>
        ))}
    </p>
  );
}

export default function CareerRichText({
  content,
  className,
  onHarperLinkClick,
  trailingInlineNode,
}: {
  content: string;
  className?: string;
  onHarperLinkClick?: (href: string) => void;
  trailingInlineNode?: ReactNode;
}) {
  const normalizedContent = normalizeRichText(content);
  const markdownContent = trailingInlineNode
    ? `${normalizedContent}${TRAILING_INLINE_NODE_MARKER}`
    : normalizedContent;

  if (!normalizedContent) {
    return trailingInlineNode ? (
      <div className={careerCx("max-w-none text-sm leading-6", className)}>
        {trailingInlineNode}
      </div>
    ) : null;
  }

  return (
    <div className={careerCx("max-w-none text-sm leading-6", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-5 text-base font-semibold leading-6 text-beige900 first:mt-0">
              {renderNodeWithHighlights(children, "h1", trailingInlineNode)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 text-[15px] font-semibold leading-6 text-beige900 first:mt-0">
              {renderNodeWithHighlights(children, "h2", trailingInlineNode)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 text-sm font-semibold leading-6 text-beige900 first:mt-0">
              {renderNodeWithHighlights(children, "h3", trailingInlineNode)}
            </h3>
          ),
          p: ({ children }) =>
            renderUrlLinkParagraph(children) ?? (
              <p className="mt-3 whitespace-pre-wrap wrap-break-word text-sm leading-6 text-beige900/80 first:mt-0">
                {renderNodeWithHighlights(children, "p", trailingInlineNode)}
              </p>
            ),
          ul: ({ children }) => (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-beige900/80 first:mt-0">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-beige900/80 first:mt-0">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-1 [&_p]:mt-0">
              {renderNodeWithHighlights(children, "li", trailingInlineNode)}
            </li>
          ),
          a: ({ href, children }) => {
            if (!href) {
              return (
                <span>
                  {renderNodeWithHighlights(
                    children,
                    "link-fallback",
                    trailingInlineNode
                  )}
                </span>
              );
            }
            const childText = getPlainText(children);
            if (
              childText.trim().toLowerCase() === POSTING_LINK_LABEL &&
              !href.startsWith("http://") &&
              !href.startsWith("https://") &&
              !href.startsWith("mailto:")
            ) {
              return null;
            }
            if (isHarperOwnedUrl(href)) {
              const shouldShowHrefText =
                isUrlText(childText) ||
                childText.trim() === href ||
                !childText.trim();
              const contentNode = shouldShowHrefText
                ? compactUrlLabel(childText || href)
                : renderNodeWithHighlights(
                    children,
                    "link-disabled",
                    trailingInlineNode
                  );

              if (onHarperLinkClick) {
                return (
                  <button
                    type="button"
                    onClick={() => onHarperLinkClick(href)}
                    title={href}
                    aria-label={href}
                    className={careerCx(
                      "inline cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] wrap-break-word underline decoration-dotted underline-offset-2 text-beige900 transition-colors hover:text-beige900/75",
                      shouldShowHrefText &&
                        "max-w-full px-1 py-0.5 text-[13px] font-medium leading-5"
                    )}
                  >
                    {contentNode}
                  </button>
                );
              }

              return (
                <span className="wrap-break-word text-inherit" title={href}>
                  {contentNode}
                </span>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                title={href}
                aria-label={href}
                className={careerCx(
                  "wrap-break-word underline decoration-dotted underline-offset-2 text-beige900 transition-colors hover:text-beige900/75",
                  isUrlText(childText) ||
                    (childText.trim() === href &&
                      "inline-flex max-w-full items-center px-1 py-0.5 text-[13px] font-medium leading-5")
                )}
              >
                {isUrlText(childText) || childText.trim() === href
                  ? compactUrlLabel(childText || href)
                  : renderNodeWithHighlights(
                      children,
                      "link",
                      trailingInlineNode
                    )}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="mt-4 border-l-2 border-beige900/20 bg-white/45 px-4 py-2 text-sm leading-6 text-beige900/70 first:mt-0 [&_p]:mt-0 [&_p]:text-inherit">
              {renderNodeWithHighlights(
                children,
                "blockquote",
                trailingInlineNode
              )}
            </blockquote>
          ),
          hr: () => (
            <hr className="my-4 border-0 border-t border-beige900/10" />
          ),
          table: ({ children }) => (
            <div className="mt-4 overflow-x-auto first:mt-0">
              <table className="min-w-full border-collapse text-left text-sm leading-6 text-beige900/80">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-beige900/10 bg-white/55 px-3 py-2 font-medium text-beige900">
              {renderNodeWithHighlights(children, "th", trailingInlineNode)}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-beige900/10 px-3 py-2 align-top">
              {renderNodeWithHighlights(children, "td", trailingInlineNode)}
            </td>
          ),
          pre: ({ children }) => (
            <pre className="mt-4 overflow-x-auto rounded-[8px] border border-beige900/10 bg-white/65 px-4 py-3 font-mono text-[12px] leading-5 text-beige900 first:mt-0">
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const text = String(children).replace(/\n$/, "");
            const isBlockCode = Boolean(className) || text.includes("\n");

            if (!isBlockCode) {
              return (
                <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[12px] text-beige900">
                  {children}
                </code>
              );
            }

            return (
              <code
                className={careerCx(
                  "font-mono text-[12px] leading-5 text-beige900",
                  className
                )}
              >
                {text}
              </code>
            );
          },
          em: ({ children }) => (
            <em className="italic text-beige900/80">
              {renderNodeWithHighlights(children, "em", trailingInlineNode)}
            </em>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-beige900">
              {renderNodeWithHighlights(children, "strong", trailingInlineNode)}
            </strong>
          ),
        }}
      >
        {markdownContent}
      </ReactMarkdown>
    </div>
  );
}
