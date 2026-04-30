import React, {
  Fragment,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";
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

function looksLikeHtml(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return HTML_BLOCK_TAG_PATTERN.test(trimmed) || HTML_PAIR_PATTERN.test(trimmed);
}

function normalizeRichText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (!looksLikeHtml(trimmed)) {
    return trimmed;
  }

  const markdown = turndownService
    .turndown(trimmed)
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return markdown || trimmed;
}

function renderTextWithHighlights(content: string, keyPrefix: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  HIGHLIGHT_PATTERN.lastIndex = 0;
  while ((match = HIGHLIGHT_PATTERN.exec(content)) !== null) {
    const matchIndex = match.index;

    if (lastIndex < matchIndex) {
      nodes.push(
        <Fragment key={`${keyPrefix}-text-${matchIndex}`}>
          {content.slice(lastIndex, matchIndex)}
        </Fragment>
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
    nodes.push(
      <Fragment key={`${keyPrefix}-tail-${lastIndex}`}>
        {content.slice(lastIndex)}
      </Fragment>
    );
  }

  if (nodes.length === 0) return content;
  return nodes.length === 1 ? nodes[0] : nodes;
}

function renderNodeWithHighlights(node: ReactNode, keyPrefix: string): ReactNode {
  if (typeof node === "string") {
    return renderTextWithHighlights(node, keyPrefix);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => (
      <Fragment key={`${keyPrefix}-${index}`}>
        {renderNodeWithHighlights(child, `${keyPrefix}-${index}`)}
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
      renderNodeWithHighlights(childProps.children, `${keyPrefix}-child`)
    );
  }

  return node;
}

export default function CareerRichText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const normalizedContent = normalizeRichText(content);

  if (!normalizedContent) return null;

  return (
    <div className={careerCx("max-w-none text-sm leading-6", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-5 text-base font-semibold leading-6 text-beige900 first:mt-0">
              {renderNodeWithHighlights(children, "h1")}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-5 text-[15px] font-semibold leading-6 text-beige900 first:mt-0">
              {renderNodeWithHighlights(children, "h2")}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 text-sm font-semibold leading-6 text-beige900 first:mt-0">
              {renderNodeWithHighlights(children, "h3")}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-beige900/80 first:mt-0">
              {renderNodeWithHighlights(children, "p")}
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
              {renderNodeWithHighlights(children, "li")}
            </li>
          ),
          a: ({ href, children }) => {
            if (!href) {
              return <span>{renderNodeWithHighlights(children, "link-fallback")}</span>;
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="break-all text-beige900 underline decoration-dotted underline-offset-2 transition-colors hover:text-beige900/75"
              >
                {renderNodeWithHighlights(children, "link")}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="mt-4 border-l-2 border-beige900/20 bg-white/45 px-4 py-2 text-sm leading-6 text-beige900/70 first:mt-0 [&_p]:mt-0 [&_p]:text-inherit">
              {renderNodeWithHighlights(children, "blockquote")}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-0 border-t border-beige900/10" />,
          table: ({ children }) => (
            <div className="mt-4 overflow-x-auto first:mt-0">
              <table className="min-w-full border-collapse text-left text-sm leading-6 text-beige900/80">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-beige900/10 bg-white/55 px-3 py-2 font-medium text-beige900">
              {renderNodeWithHighlights(children, "th")}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-beige900/10 px-3 py-2 align-top">
              {renderNodeWithHighlights(children, "td")}
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
              {renderNodeWithHighlights(children, "em")}
            </em>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-beige900">
              {renderNodeWithHighlights(children, "strong")}
            </strong>
          ),
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
