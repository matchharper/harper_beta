import Link from "next/link";
import { type ReactNode } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { ArrowRight, Check, Copy, Info } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Code } from "@/components/ui/code";
import { Text } from "@/components/ui/text";

export type OrgDocumentsHeading = {
  id: string;
  level: 1 | 2 | 3;
  text: string;
};

type OrgDocumentsMarkdownProps = {
  copied: boolean;
  headings: readonly OrgDocumentsHeading[];
  linkTargets: Record<string, string>;
  markdown: string;
  onCopy: () => void;
};

/**
 * Markdown 요소별 표현을 한곳에서 관리합니다.
 * 문서 내용은 `src/content/org-documents.md`에서, 디자인은 이 객체에서 바꿉니다.
 */
export const ORG_DOCUMENTS_MARKDOWN_STYLES = {
  action:
    "mt-8 font-normal focus-visible:ring-black/10 focus-visible:ring-offset-white",
  blockquote:
    "mt-6 border-l-2 border-[#d8d1cc] py-0.5 pl-5 text-[16px] font-normal italic leading-7 text-[#504a46]",
  callout: {
    container:
      "mt-6 flex gap-3.5 rounded-xl border border-[#eee7e3] bg-[#faf7f5] px-4 py-4",
    content:
      "mt-1 text-[15px] leading-[1.7] text-[#504a46] [&_p:first-child]:mt-0",
    icon: "mt-0.5 size-[17px] shrink-0 text-[#8a766a]",
    label: "text-[14px] font-semibold leading-5 text-[#272321]",
  },
  code: "rounded-md bg-[#f4f1ef] px-1.5 py-0.5 font-mono text-[0.88em] text-[#272321]",
  codeBlock:
    "mt-5 rounded-xl border-[#e9e4e1] bg-[#f7f5f4] text-[13px] leading-6 text-[#2b2725]",
  codeBlockLabel: "mb-2 text-[13px] font-medium leading-5 text-[#716b67]",
  em: "italic text-[#504a46]",
  h1: "scroll-mt-36 text-[34px] font-medium leading-[1.2] tracking-[-0.035em] text-[#181717] sm:text-[36px] xl:scroll-mt-12",
  eyebrow: "normal-case text-primary",
  h2: "mt-2 text-[23px] font-medium leading-8 tracking-[-0.025em] text-[#181717] sm:text-[24px]",
  h3: "scroll-mt-36 mt-11 text-[18px] font-medium leading-7 tracking-[-0.012em] text-[#272321] xl:scroll-mt-12",
  h4: "scroll-mt-36 mt-9 text-[16px] font-semibold leading-7 text-[#272321] xl:scroll-mt-12",
  hr: "my-12 border-[#e9e6e4]",
  image: "mt-6 h-auto max-w-full rounded-xl border border-[#ebe7e4]",
  lead: "mt-2 text-[18px] font-normal leading-7 text-[#504a46]",
  link: "text-[#7c4f35] underline decoration-[#c9a994] decoration-1 underline-offset-4 transition-colors hover:text-[#573824] hover:decoration-current focus-visible:outline-none focus-visible:decoration-current",
  list: "mt-3 list-disc space-y-2 pl-[19px] text-[16px] font-normal leading-7 text-[#403f3f] marker:text-[#a39b96] [&>li]:pl-1",
  orderedList:
    "mt-3 list-decimal space-y-2.5 pl-[22px] text-[16px] font-normal leading-7 text-[#403f3f] marker:font-medium marker:text-[#716b67] [&>li]:pl-1",
  paragraph: "mt-4 text-[16px] font-normal leading-7 text-[#403f3f] first:mt-0",
  quote: {
    container: "mt-6",
    content:
      "mt-2 border-l-2 border-[#d8d1cc] py-0.5 pl-5 text-[16px] font-normal italic leading-7 text-[#504a46] [&_p:first-child]:mt-0",
    label: "text-[13px] font-medium leading-5 text-[#716b67]",
  },
  strong: "font-semibold text-[#272321]",
  table:
    "w-full border-collapse text-left text-[14px] leading-6 text-[#504a46]",
  tableCell: "border-t border-[#ebe7e4] px-4 py-3 align-top",
  tableHead: "bg-[#f7f5f4] px-4 py-3 font-semibold text-[#272321]",
  tableWrapper: "mt-6 overflow-x-auto rounded-xl border border-[#ebe7e4]",
} as const;

export const ORG_DOCUMENTS_SECTION_EYEBROWS: Record<string, string> = {
  "accept-or-decline": "연결 결정",
  "ask-harper": "후보자 추가 확인",
  "create-a-role": "채용 기준 정리",
  faq: "도움말",
  "getting-started": "사용 준비",
  "harper-introduction": "Harper 알아보기",
  pipeline: "연결 이후 관리",
  "review-recommendations": "후보자 검토",
  slack: "알림과 팀 협업",
};

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
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

  return normalized || `heading-${index + 1}`;
}

/** H1/H2/H3를 anchor로 사용합니다. 코드 펜스 안의 #은 무시합니다. */
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

    const match = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const level = match[1].length as 1 | 2 | 3;
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
  copied,
  headings,
  linkTargets,
  onCopy,
}: Pick<
  OrgDocumentsMarkdownProps,
  "copied" | "headings" | "linkTargets" | "onCopy"
>) {
  let renderedHeadingIndex = 0;
  let renderedH2Index = 0;
  let renderedParagraphIndex = 0;
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
        return <>{children}</>;
      }

      return (
        <Code className={ORG_DOCUMENTS_MARKDOWN_STYLES.code}>{children}</Code>
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
      const isFirstH2 = renderedH2Index === 0;
      const eyebrow = heading
        ? ORG_DOCUMENTS_SECTION_EYEBROWS[heading.id]
        : undefined;
      renderedHeadingIndex += 1;
      renderedH2Index += 1;
      return (
        <div
          className={`${isFirstH2 ? "mt-9" : "mt-20"} scroll-mt-36 xl:scroll-mt-12`}
          id={heading?.id}
        >
          {eyebrow ? (
            <Text
              as="p"
              className={ORG_DOCUMENTS_MARKDOWN_STYLES.eyebrow}
              data-documents-copy-exclude
              type="eyebrow"
            >
              {eyebrow}
            </Text>
          ) : null}
          <h2 className={ORG_DOCUMENTS_MARKDOWN_STYLES.h2}>{children}</h2>
        </div>
      );
    },
    h3: ({ children }) => {
      const heading = headings[renderedHeadingIndex];
      renderedHeadingIndex += 1;
      return (
        <h3 className={ORG_DOCUMENTS_MARKDOWN_STYLES.h3} id={heading?.id}>
          {children}
        </h3>
      );
    },
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
    p: ({ children }) => {
      const isLead = renderedParagraphIndex === 0;
      renderedParagraphIndex += 1;
      if (isLead) {
        return (
          <>
            <p className={ORG_DOCUMENTS_MARKDOWN_STYLES.lead}>{children}</p>
            <MuteButton
              className="mt-3 font-normal focus-visible:ring-black/10 focus-visible:ring-offset-white"
              data-documents-copy-exclude
              onClick={onCopy}
              size="md"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
              <span aria-live="polite">
                {copied ? "복사됨" : "페이지 복사"}
              </span>
            </MuteButton>
          </>
        );
      }

      return (
        <p className={ORG_DOCUMENTS_MARKDOWN_STYLES.paragraph}>{children}</p>
      );
    },
    pre: ({ children, node }) => {
      const directive = getDirective(node);

      if (directive?.language === "callout") {
        const { body, label } = splitLabelAndBody(directive.content);
        return (
          <aside
            className={ORG_DOCUMENTS_MARKDOWN_STYLES.callout.container}
            role="note"
          >
            <Info
              aria-hidden="true"
              className={ORG_DOCUMENTS_MARKDOWN_STYLES.callout.icon}
              strokeWidth={2}
            />
            <div className="min-w-0 flex-1">
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
            </div>
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
              size="md"
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
            <Code
              className={ORG_DOCUMENTS_MARKDOWN_STYLES.codeBlock}
              type="block"
            >
              {body}
            </Code>
          </figure>
        );
      }

      return (
        <Code className={ORG_DOCUMENTS_MARKDOWN_STYLES.codeBlock} type="block">
          {children}
        </Code>
      );
    },
    strong: ({ children }) => (
      <strong className={ORG_DOCUMENTS_MARKDOWN_STYLES.strong}>
        {children}
      </strong>
    ),
    table: ({ children }) => (
      <div className={ORG_DOCUMENTS_MARKDOWN_STYLES.tableWrapper}>
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
  copied,
  headings,
  linkTargets,
  markdown,
  onCopy,
}: OrgDocumentsMarkdownProps) {
  const components = createMarkdownComponents({
    copied,
    headings,
    linkTargets,
    onCopy,
  });

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
