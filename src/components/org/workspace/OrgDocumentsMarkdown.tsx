import Link from "next/link";
import { type ReactNode } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { ArrowRight } from "lucide-react";
import { MuteButton } from "@/components/ui/button";

export type OrgDocumentsHeading = {
  id: string;
  level: 1 | 2;
  text: string;
};

type OrgDocumentsMarkdownProps = {
  headings: readonly OrgDocumentsHeading[];
  linkTargets: Record<string, string>;
  markdown: string;
};

/**
 * Markdown 요소별 표현을 한곳에서 관리합니다.
 * 문서 내용은 `src/content/org-documents.md`에서, 디자인은 이 객체에서 바꿉니다.
 */
export const ORG_DOCUMENTS_MARKDOWN_STYLES = {
  action:
    "mt-8 font-normal focus-visible:ring-neutral-1000-a10 focus-visible:ring-offset-bg-default",
  blockquote:
    "mt-5 border-l-2 border-neutral-1000 bg-bg-weak px-4 py-3.5 text-[15px] font-normal leading-7 text-neutral-muted",
  callout: {
    container: "mt-6 border-l-2 border-neutral-1000 bg-bg-weak px-4 py-3.5",
    content:
      "mt-1.5 text-[14px] leading-7 text-neutral-muted [&_p:first-child]:mt-0",
    label: "text-[12px] font-medium leading-5 text-neutral-primary",
  },
  code: "rounded bg-bg-weak px-1.5 py-0.5 font-mono text-[0.9em] text-neutral-primary",
  codeBlock:
    "mt-5 overflow-x-auto bg-neutral-1000 px-4 py-3.5 text-[13px] leading-6 text-neutral-00",
  codeBlockCode: "font-mono whitespace-pre-wrap",
  codeBlockLabel: "mb-2 text-[12px] font-medium leading-5 text-neutral-soft",
  em: "italic text-neutral-muted",
  h1: "scroll-mt-36 text-[38px] font-normal leading-tight tracking-[-0.04em] text-neutral-primary sm:text-[44px] lg:scroll-mt-12",
  h2: "scroll-mt-36 mt-16 border-t border-neutral-1000-a10 pt-16 text-[26px] font-normal leading-[1.35] tracking-[-0.025em] text-neutral-primary first:mt-0 first:border-t-0 first:pt-0 sm:text-[29px] lg:scroll-mt-12",
  h3: "scroll-mt-36 mt-10 text-[17px] font-medium leading-7 text-neutral-primary lg:scroll-mt-12",
  h4: "scroll-mt-36 mt-8 text-[16px] font-medium leading-7 text-neutral-primary lg:scroll-mt-12",
  hr: "my-10 border-neutral-1000-a10",
  image: "mt-5 h-auto max-w-full",
  link: "text-link underline decoration-current/30 underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:decoration-current",
  list: "mt-3 list-disc space-y-2.5 pl-[18px] text-[15px] font-normal leading-[1.75] text-neutral-muted marker:text-neutral-soft [&>li]:pl-1",
  orderedList:
    "mt-3 list-decimal space-y-3 pl-[22px] text-[15px] font-normal leading-[1.75] text-neutral-muted marker:text-neutral-muted [&>li]:pl-1",
  paragraph:
    "mt-4 text-[15px] font-normal leading-[1.75] text-neutral-muted first:mt-0",
  quote: {
    container: "mt-5 border-l-2 border-neutral-1000 bg-bg-weak px-4 py-3.5",
    content:
      "mt-1.5 text-[15px] font-normal leading-7 text-neutral-muted [&_p:first-child]:mt-0",
    label: "text-[12px] font-medium leading-5 text-neutral-soft",
  },
  strong: "font-medium text-neutral-primary",
  table:
    "mt-5 w-full border-collapse text-left text-[14px] leading-6 text-neutral-muted",
  tableCell: "border border-neutral-1000-a10 px-3 py-2 align-top",
  tableHead:
    "border border-neutral-1000-a10 bg-bg-weak px-3 py-2 font-medium text-neutral-primary",
} as const;

const HEADING_ID_COMMENT = /\s*<!--\s*id:\s*[A-Za-z0-9_-]+\s*-->\s*$/;
const HEADING_ID_PATTERN = /<!--\s*id:\s*([A-Za-z0-9_-]+)\s*-->/;

function toHeadingText(source: string) {
  return source
    .replace(HEADING_ID_COMMENT, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[\\`*_~]/g, "")
    .trim();
}

function makeHeadingId(text: string, index: number) {
  const normalized = text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

  return normalized || `heading-${index + 1}`;
}

/** H1/H2만 목차와 anchor로 사용합니다. 코드 펜스 안의 #은 무시합니다. */
export function extractOrgDocumentsHeadings(markdown: string) {
  const headings: OrgDocumentsHeading[] = [];
  const usedIds = new Set<string>();
  let inFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;

    const match = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const level = match[1].length as 1 | 2;
    const source = match[2];
    const explicitId = HEADING_ID_PATTERN.exec(source)?.[1];
    const baseId =
      explicitId ?? makeHeadingId(toHeadingText(source), headings.length);
    let id = baseId;
    let duplicateIndex = 2;

    while (usedIds.has(id)) {
      id = `${baseId}-${duplicateIndex}`;
      duplicateIndex += 1;
    }

    usedIds.add(id);
    headings.push({ id, level, text: toHeadingText(source) });
  }

  return headings;
}

function removeHeadingIdComments(markdown: string) {
  return markdown.replace(
    /^(#{1,2}\s+.*?)\s*<!--\s*id:\s*[A-Za-z0-9_-]+\s*-->\s*$/gm,
    "$1"
  );
}

function getDirective(node: unknown) {
  const element = node as {
    children?: Array<{
      children?: Array<{ value?: string }>;
      properties?: { className?: string | string[] };
    }>;
  };
  const code = element.children?.[0];
  const className = code?.properties?.className;
  const classNames = Array.isArray(className)
    ? className
    : typeof className === "string"
      ? className.split(" ")
      : [];
  const language = classNames
    .find((value) => value.startsWith("language-"))
    ?.slice("language-".length);
  const content = code?.children?.[0]?.value;

  return language && typeof content === "string" ? { content, language } : null;
}

function splitLabelAndBody(content: string) {
  const [label = "", ...body] = content.trim().split(/\r?\n/);
  return { body: body.join("\n").trim(), label };
}

function isOrgDocumentTarget(href: string | undefined) {
  return Boolean(href?.startsWith("#org-"));
}

function getOrgDocumentTarget(
  href: string | undefined,
  linkTargets: Record<string, string>
) {
  if (!href) return null;

  const key = href.startsWith("#org-")
    ? href.slice("#org-".length)
    : href.startsWith("org:")
      ? href.slice("org:".length)
      : null;

  return key ? (linkTargets[key] ?? null) : null;
}

function createMarkdownComponents({
  headings,
  linkTargets,
}: Pick<OrgDocumentsMarkdownProps, "headings" | "linkTargets">) {
  let renderedHeadingIndex = 0;
  let components: Components;

  const renderNestedMarkdown = (markdown: string) => (
    <ReactMarkdown
      components={components}
      rehypePlugins={[rehypeSanitize]}
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={(url) =>
        isOrgDocumentTarget(url) ? url : defaultUrlTransform(url)
      }
    >
      {markdown}
    </ReactMarkdown>
  );

  const renderLink = (children: ReactNode, href?: string) => {
    const target = getOrgDocumentTarget(href, linkTargets);
    if (target) {
      return (
        <Link className={ORG_DOCUMENTS_MARKDOWN_STYLES.link} href={target}>
          {children}
        </Link>
      );
    }

    const safeHref = href ?? "#";
    const external = /^https?:\/\//.test(safeHref);
    return (
      <a
        className={ORG_DOCUMENTS_MARKDOWN_STYLES.link}
        href={safeHref}
        rel={external ? "noreferrer" : undefined}
        target={external ? "_blank" : undefined}
      >
        {children}
      </a>
    );
  };

  components = {
    a: ({ children, href }) => renderLink(children, href),
    blockquote: ({ children }) => (
      <blockquote className={ORG_DOCUMENTS_MARKDOWN_STYLES.blockquote}>
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => {
      if (className) {
        return (
          <code className={ORG_DOCUMENTS_MARKDOWN_STYLES.codeBlockCode}>
            {children}
          </code>
        );
      }

      return (
        <code className={ORG_DOCUMENTS_MARKDOWN_STYLES.code}>{children}</code>
      );
    },
    del: ({ children }) => <del className="line-through">{children}</del>,
    em: ({ children }) => (
      <em className={ORG_DOCUMENTS_MARKDOWN_STYLES.em}>{children}</em>
    ),
    h1: ({ children }) => {
      const heading = headings[renderedHeadingIndex];
      renderedHeadingIndex += 1;
      return (
        <h1 className={ORG_DOCUMENTS_MARKDOWN_STYLES.h1} id={heading?.id}>
          {children}
        </h1>
      );
    },
    h2: ({ children }) => {
      const heading = headings[renderedHeadingIndex];
      renderedHeadingIndex += 1;
      return (
        <h2 className={ORG_DOCUMENTS_MARKDOWN_STYLES.h2} id={heading?.id}>
          {children}
        </h2>
      );
    },
    h3: ({ children }) => (
      <h3 className={ORG_DOCUMENTS_MARKDOWN_STYLES.h3}>{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className={ORG_DOCUMENTS_MARKDOWN_STYLES.h4}>{children}</h4>
    ),
    hr: () => <hr className={ORG_DOCUMENTS_MARKDOWN_STYLES.hr} />,
    img: ({ alt, src }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt ?? ""}
        className={ORG_DOCUMENTS_MARKDOWN_STYLES.image}
        src={src}
      />
    ),
    li: ({ children }) => <li>{children}</li>,
    ol: ({ children }) => (
      <ol className={ORG_DOCUMENTS_MARKDOWN_STYLES.orderedList}>{children}</ol>
    ),
    p: ({ children }) => (
      <p className={ORG_DOCUMENTS_MARKDOWN_STYLES.paragraph}>{children}</p>
    ),
    pre: ({ children, node }) => {
      const directive = getDirective(node);

      if (directive?.language === "callout") {
        const { body, label } = splitLabelAndBody(directive.content);
        return (
          <aside className={ORG_DOCUMENTS_MARKDOWN_STYLES.callout.container}>
            {label ? (
              <p className={ORG_DOCUMENTS_MARKDOWN_STYLES.callout.label}>
                {label}
              </p>
            ) : null}
            {body ? (
              <div className={ORG_DOCUMENTS_MARKDOWN_STYLES.callout.content}>
                {renderNestedMarkdown(body)}
              </div>
            ) : null}
          </aside>
        );
      }

      if (directive?.language === "quote") {
        const { body, label } = splitLabelAndBody(directive.content);
        return (
          <figure className={ORG_DOCUMENTS_MARKDOWN_STYLES.quote.container}>
            {label ? (
              <figcaption className={ORG_DOCUMENTS_MARKDOWN_STYLES.quote.label}>
                {label}
              </figcaption>
            ) : null}
            {body ? (
              <blockquote
                className={ORG_DOCUMENTS_MARKDOWN_STYLES.quote.content}
              >
                {renderNestedMarkdown(body)}
              </blockquote>
            ) : null}
          </figure>
        );
      }

      if (directive?.language === "action") {
        const [label, destination] = directive.content
          .trim()
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const target = getOrgDocumentTarget(destination, linkTargets);

        if (label && target) {
          return (
            <MuteButton
              asChild
              className={ORG_DOCUMENTS_MARKDOWN_STYLES.action}
              size="lg"
              variant="dark"
            >
              <Link href={target}>
                {label}
                <ArrowRight className="size-4" />
              </Link>
            </MuteButton>
          );
        }
      }

      if (directive?.language === "example") {
        const { body, label } = splitLabelAndBody(directive.content);
        return (
          <figure className="mt-5">
            {label ? (
              <figcaption
                className={ORG_DOCUMENTS_MARKDOWN_STYLES.codeBlockLabel}
              >
                {label}
              </figcaption>
            ) : null}
            <pre className={ORG_DOCUMENTS_MARKDOWN_STYLES.codeBlock}>
              <code className={ORG_DOCUMENTS_MARKDOWN_STYLES.codeBlockCode}>
                {body}
              </code>
            </pre>
          </figure>
        );
      }

      return (
        <pre className={ORG_DOCUMENTS_MARKDOWN_STYLES.codeBlock}>
          {children}
        </pre>
      );
    },
    strong: ({ children }) => (
      <strong className={ORG_DOCUMENTS_MARKDOWN_STYLES.strong}>
        {children}
      </strong>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto">
        <table className={ORG_DOCUMENTS_MARKDOWN_STYLES.table}>
          {children}
        </table>
      </div>
    ),
    td: ({ children }) => (
      <td className={ORG_DOCUMENTS_MARKDOWN_STYLES.tableCell}>{children}</td>
    ),
    th: ({ children }) => (
      <th className={ORG_DOCUMENTS_MARKDOWN_STYLES.tableHead}>{children}</th>
    ),
    ul: ({ children }) => (
      <ul className={ORG_DOCUMENTS_MARKDOWN_STYLES.list}>{children}</ul>
    ),
  };

  return components;
}

export function OrgDocumentsMarkdown({
  headings,
  linkTargets,
  markdown,
}: OrgDocumentsMarkdownProps) {
  const components = createMarkdownComponents({ headings, linkTargets });

  return (
    <ReactMarkdown
      components={components}
      rehypePlugins={[rehypeSanitize]}
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={(url) =>
        isOrgDocumentTarget(url) ? url : defaultUrlTransform(url)
      }
    >
      {removeHeadingIdComments(markdown)}
    </ReactMarkdown>
  );
}
