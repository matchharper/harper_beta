import React, {
  Fragment,
  cloneElement,
  isValidElement,
  useMemo,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import {
  ReferenceLink,
  getLinkText,
  renderUrlLinkParagraph,
} from "@/components/ui/reference-link";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import { remarkUnderline } from "@/lib/markdown/remarkUnderline";
import TurndownService from "turndown";
import { cn } from "@/lib/utils";
import { typographyVariants, type TypographyVariant } from "./typography";
import {
  OPPORTUNITY_RUN_MARKER_LABEL,
  stripOpportunityRunMarkers,
} from "@/lib/opportunityDiscovery/messageMarker";

const turndownService = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx",
  hr: "---",
  strongDelimiter: "**",
});

turndownService.remove(["script", "style"]);
turndownService.addRule("underline", {
  filter: "u",
  replacement: (content) => `<u>${content}</u>`,
});

const HTML_BLOCK_TAG_PATTERN =
  /<(p|br|ul|ol|li|strong|em|a|h[1-6]|div|span|blockquote|pre|code|table|thead|tbody|tr|td|th)\b/i;
const HTML_PAIR_PATTERN = /<([a-z][\w:-]*)(\s[^>]*)?>[\s\S]*<\/\1>/i;
const HIGHLIGHT_PATTERN = /<<([\s\S]+?)>>/g;
const INLINE_FORMAT_TRAILING_BREAKS_PATTERN =
  /(<(strong|b|em|i)\b[^>]*>)([\s\S]*?)(\s*(?:<br\s*\/?>\s*)+)<\/\2>/gi;
const TRAILING_INLINE_NODE_MARKER = "[[CAREER_TRAILING_INLINE_NODE]]";

function looksLikeHtml(value: string) {
  // Inline underline is part of our Markdown contract, not a full HTML document.
  const trimmed = value.trim().replace(/<\/?u>/g, "");
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
          className="box-decoration-clone rounded-sm bg-bg-weak px-1.5 py-0.5 font-medium text-neutral-primary"
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

function removeMarkdownBreakFormattingNewlines(children: ReactNode) {
  if (!Array.isArray(children)) return children;

  return children.map((child, index) => {
    if (typeof child !== "string" || index === 0) return child;

    const previousChild = children[index - 1];
    if (!isValidElement(previousChild) || previousChild.type !== "br") {
      return child;
    }

    // react-markdown emits a formatting newline after every <br>. Since these
    // paragraphs preserve whitespace, keeping both would render two breaks.
    return child.replace(/^\n/, "");
  });
}

function isStandaloneStrongParagraph(children: ReactNode) {
  const meaningfulChildren = React.Children.toArray(children).filter(
    (child) => typeof child !== "string" || child.trim()
  );

  if (meaningfulChildren.length !== 1) return false;

  const child = meaningfulChildren[0];
  return (
    isValidElement<{ node?: { tagName?: string } }>(child) &&
    child.props.node?.tagName === "strong"
  );
}

export type RichTextVariant = "default" | "career";

// Markdown prose inherits the selected typography, including caller overrides.
const proseTypographyClass =
  "[&_:is(p,ul,ol,blockquote,table,h1,h2,h3,h4,h5,h6)]:text-[length:inherit] [&_:is(p,ul,ol,blockquote,table,h1,h2,h3,h4,h5,h6)]:leading-[inherit] [&_:is(p,blockquote,em,h1,h2,h3,h4,h5,h6,strong)]:text-inherit [&_:is(h1,h2,h3,h4,h5,h6)]:font-medium";
export type RichTextTypography = TypographyVariant;

export default function RichText({
  content,
  children,
  className,
  onHarperLinkClick,
  renderEmailLinksAsText = false,
  referenceLinks = false,
  variant = "default",
  typography,
  trailingInlineNode,
  additionalRemarkPlugins = [],
  renderLink,
}: {
  className?: string;
  onHarperLinkClick?: (href: string) => void;
  renderEmailLinksAsText?: boolean;
  /** Render external web sources as compact inline references; Markdown stays unchanged. */
  referenceLinks?: boolean;
  variant?: RichTextVariant;
  typography?: RichTextTypography;
  trailingInlineNode?: ReactNode;
  additionalRemarkPlugins?: React.ComponentProps<
    typeof ReactMarkdown
  >["remarkPlugins"];
  renderLink?: (args: {
    href: string;
    children: ReactNode;
    text: string;
  }) => ReactNode | undefined;
} & (
  | { content: string; children?: never }
  | { children: string; content?: never }
)) {
  // Keep Markdown element types stable while streaming appends text.
  const components = useMemo<
    React.ComponentProps<typeof ReactMarkdown>["components"]
  >(
    () => ({
      h1: ({ children }) => (
        <h1
          className={cn(
            "mt-5 text-neutral-primary first:mt-0",
            "text-xl font-medium leading-7 [&_strong]:font-medium"
          )}
        >
          {renderNodeWithHighlights(children, "h1", trailingInlineNode)}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="mt-5 text-[17px] font-medium leading-6 text-neutral-primary first:mt-0">
          {renderNodeWithHighlights(children, "h2", trailingInlineNode)}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-4 text-base font-medium leading-6 text-neutral-primary first:mt-0">
          {renderNodeWithHighlights(children, "h3", trailingInlineNode)}
        </h3>
      ),
      h4: ({ children }) => (
        <h4 className="mt-4 text-sm font-semibold leading-6 text-neutral-primary first:mt-0">
          {renderNodeWithHighlights(children, "h4", trailingInlineNode)}
        </h4>
      ),
      h5: ({ children }) => (
        <h5 className="mt-4 text-sm font-semibold leading-6 text-neutral-primary first:mt-0">
          {renderNodeWithHighlights(children, "h5", trailingInlineNode)}
        </h5>
      ),
      h6: ({ children }) => (
        <h6 className="mt-4 text-sm font-semibold leading-6 text-neutral-primary first:mt-0">
          {renderNodeWithHighlights(children, "h6", trailingInlineNode)}
        </h6>
      ),
      p: ({ children }) => {
        const normalizedChildren =
          removeMarkdownBreakFormattingNewlines(children);

        if (isStandaloneStrongParagraph(normalizedChildren)) {
          return (
            <p
              className="mt-5 wrap-break-word text-sm leading-6 first:mt-0"
              data-rich-text-section-title="true"
            >
              {renderNodeWithHighlights(
                normalizedChildren,
                "section-title",
                trailingInlineNode
              )}
            </p>
          );
        }

        return (
          renderUrlLinkParagraph(
            normalizedChildren,
            renderEmailLinksAsText
          ) ?? (
            <p className="mt-4 whitespace-pre-wrap wrap-break-word text-sm leading-6 first:mt-0">
              {renderNodeWithHighlights(
                normalizedChildren,
                "p",
                trailingInlineNode
              )}
            </p>
          )
        );
      },
      ul: ({ children }) => (
        <ul className="mt-4 mb-1 list-disc space-y-1 pl-5 text-sm leading-6 first:mt-0">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="mt-0 list-decimal space-y-1 pl-5 text-sm leading-6 first:mt-0">
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
        const customLink = renderLink?.({
          href,
          children,
          text: getLinkText(children),
        });
        if (customLink !== undefined) return customLink;
        const childText = getLinkText(children);
        if (childText.trim().toLowerCase() === OPPORTUNITY_RUN_MARKER_LABEL) {
          return null;
        }
        return (
          <ReferenceLink
            href={href}
            variant={
              referenceLinks || variant === "career" ? "assistant" : "default"
            }
            onHarperLinkClick={onHarperLinkClick}
            renderEmailLinksAsText={renderEmailLinksAsText}
          >
            {renderNodeWithHighlights(children, "link", trailingInlineNode)}
          </ReferenceLink>
        );
      },
      blockquote: ({ children }) => (
        <blockquote className="mt-4 border-l-2 border-neutral-1000-a10 bg-bg-floating px-4 py-2 text-sm leading-6 text-neutral-muted first:mt-0 [&_p]:mt-0 [&_p]:text-inherit">
          {renderNodeWithHighlights(children, "blockquote", trailingInlineNode)}
        </blockquote>
      ),
      hr: () => (
        <hr className="my-4 border-0 border-t border-neutral-1000-a05" />
      ),
      table: ({ children }) => (
        <div
          className="mt-4 overflow-x-auto first:mt-0"
          data-rich-text-table="true"
        >
          <table
            className={cn(
              "min-w-full border-collapse text-left text-sm leading-6 text-neutral-primary",
              variant === "career" && "[&_tbody>tr:last-child>td]:border-b-0"
            )}
          >
            {children}
          </table>
        </div>
      ),
      th: ({ children, style }) => (
        <th
          style={style}
          className={cn(
            "px-3 font-medium text-neutral-primary",
            variant === "career"
              ? "border-b border-neutral-1000-a10 py-3 first:pl-0 last:pr-0"
              : "border border-neutral-1000-a05 bg-bg-floating py-2"
          )}
        >
          {renderNodeWithHighlights(children, "th", trailingInlineNode)}
        </th>
      ),
      td: ({ children, style }) => (
        <td
          style={style}
          className={cn(
            "px-3 align-top text-neutral-primary [&_em]:text-neutral-primary [&_blockquote]:text-neutral-primary",
            variant === "career"
              ? "border-b border-neutral-1000-a05 py-3 first:pl-0 last:pr-0"
              : "border border-neutral-1000-a05 py-2"
          )}
        >
          {renderNodeWithHighlights(children, "td", trailingInlineNode)}
        </td>
      ),
      pre: ({ children }) => (
        <pre className="mt-4 overflow-x-auto rounded-md border border-neutral-1000-a05 bg-bg-floating px-4 py-3 font-mono text-[12px] leading-5 text-neutral-primary first:mt-0">
          {children}
        </pre>
      ),
      code: ({ children, className }) => {
        const text = String(children).replace(/\n$/, "");
        const isBlockCode = Boolean(className) || text.includes("\n");

        if (!isBlockCode) {
          return (
            <code className="rounded bg-bg-weak px-1.5 py-0.5 font-mono text-[12px] text-neutral-primary">
              {children}
            </code>
          );
        }

        return (
          <code
            className={cn(
              "font-mono text-[12px] leading-5 text-neutral-primary",
              className
            )}
          >
            {text}
          </code>
        );
      },
      u: ({ children }) => (
        <u className="decoration-1 underline-offset-4 text-neutral-primary">
          {renderNodeWithHighlights(children, "u", trailingInlineNode)}
        </u>
      ),
      em: ({ children }) => (
        <em className="italic text-neutral-muted">
          {renderNodeWithHighlights(children, "em", trailingInlineNode)}
        </em>
      ),
      strong: ({ children }) => (
        <strong className="font-semibold text-neutral-primary">
          {renderNodeWithHighlights(children, "strong", trailingInlineNode)}
        </strong>
      ),
    }),
    [
      trailingInlineNode,
      renderEmailLinksAsText,
      renderLink,
      referenceLinks,
      variant,
      onHarperLinkClick,
    ]
  );

  const normalizedContent = normalizeRichText(
    stripOpportunityRunMarkers(content ?? children ?? "")
  );
  const markdownContent = trailingInlineNode
    ? `${normalizedContent}${TRAILING_INLINE_NODE_MARKER}`
    : normalizedContent;

  if (!normalizedContent) {
    return trailingInlineNode ? (
      <div
        className={cn(
          "max-w-none text-sm leading-6",
          typography && [typographyVariants[typography], proseTypographyClass],
          className
        )}
        data-career-i18n-skip="true"
      >
        {trailingInlineNode}
      </div>
    ) : null;
  }

  return (
    <div
      className={cn(
        "max-w-none text-sm leading-6 [&_:is(h1,h2,h3,h4,h5,h6,[data-rich-text-section-title])+:is(p,ul,ol,blockquote,pre,[data-rich-text-table])]:mt-2",
        typography && [typographyVariants[typography], proseTypographyClass],
        className
      )}
      data-career-i18n-skip="true"
    >
      <ReactMarkdown
        remarkPlugins={[
          [remarkGfm, { singleTilde: false }],
          ...(variant === "career" ? [remarkCjkFriendly] : []),
          remarkUnderline,
          ...(additionalRemarkPlugins ?? []),
        ]}
        components={components}
      >
        {markdownContent}
      </ReactMarkdown>
    </div>
  );
}
