import BlogAuthorAvatar from "@/components/blog/BlogAuthorAvatar";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import { showToast } from "@/components/toast/toast";
import { BareButton, MuteButton } from "@/components/ui/button";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";
import type { BlogLocale, BlogPost, BlogPostMeta } from "@/lib/blog";
import {
  buildBlogTalkToHarperHref,
  formatBlogDate,
  getBlogDisplayTitle,
  toIsoDate,
} from "@/lib/blog";
import { postBlogEvent } from "@/lib/blogMetrics";
import type { OfficialJobListItem } from "@/lib/officialJobs";
import { ArrowRight, LinkIcon } from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import {
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://matchharper.com")
  .trim()
  .replace(/\/$/, "");

const BLOG_DOT_BACKGROUND_STYLE = {
  backgroundImage:
    "radial-gradient(rgba(11, 9, 8, 0.16) 0.9px, transparent 0.9px)",
  backgroundSize: "20px 20px",
  opacity: 0.35,
};

const BLOG_DETAIL_COPY = {
  ko: {
    allJobs: "열린 자리 전체 보기",
    back: "블로그로 돌아가기",
    blogMore: "블로그 더보기",
    copied: "링크가 복사되었습니다.",
    copyFailed: "링크 복사에 실패했습니다.",
    copyLink: "링크 복사",
    jobsDescription:
      "Harper가 지금 살펴보고 있는 자리입니다. 관심 있는 자리가 보이면 알려주세요.",
    jobsEmpty:
      "지금 공개된 자리가 없습니다. 관심 있는 방향을 Harper에게 남겨주세요.",
    jobsTitle: "Harper가 살펴보고 있는 자리",
    tableOfContents: "목차",
    talk: "Talk to Harper",
    viewAll: "전체 보기",
  },
  en: {
    allJobs: "View all open roles",
    back: "Back to blog",
    blogMore: "More from the blog",
    copied: "Link copied.",
    copyFailed: "Could not copy the link.",
    copyLink: "Copy link",
    jobsDescription:
      "These are roles Harper is watching now. If one catches your eye, let me know.",
    jobsEmpty:
      "There are no public roles right now. Tell Harper what you are looking for.",
    jobsTitle: "Roles Harper is watching",
    tableOfContents: "Table of contents",
    talk: "Talk to Harper",
    viewAll: "View all",
  },
} as const;

type BlogPostPageProps = {
  jobs: OfficialJobListItem[];
  locale: BlogLocale;
  morePosts: BlogPostMeta[];
  post: BlogPost;
};

type MarkdownTocItem = {
  id: string;
  text: string;
};

type FaqItem = {
  answer: string;
  question: string;
};

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function toHeadingSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/\s+#+\s*$/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "section";
}

function extractMarkdownToc(content: string): MarkdownTocItem[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const usedIds = new Set<string>();
  const toc: MarkdownTocItem[] = [];
  let isInsideCodeFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^(```|~~~)/.test(line)) {
      isInsideCodeFence = !isInsideCodeFence;
      continue;
    }
    if (isInsideCodeFence) continue;

    const match = line.match(/^##\s+(.+)$/);
    if (!match) continue;
    const text = match[1].replace(/\s+#+\s*$/, "").trim();
    if (!text) continue;

    const id = `section-${toHeadingSlug(text)}`;
    if (usedIds.has(id)) continue;
    usedIds.add(id);
    toc.push({ id, text });
  }

  return toc;
}

function getReactNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(getReactNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getReactNodeText(node.props.children);
  }
  return "";
}

function extractFaqItems(content: string): FaqItem[] {
  const faqSection = content.match(
    /(?:^|\n)##\s+FAQ\s*\n([\s\S]*?)(?=\n##\s+|$)/i
  )?.[1];
  if (!faqSection) return [];

  const matches = Array.from(
    faqSection.matchAll(
      /(?:^|\n)\*\*(.+?\?)\*\*\s*\n([\s\S]*?)(?=\n\*\*.+?\?\*\*|$)/g
    )
  );
  return matches
    .map((match) => ({
      answer: match[2].trim().replace(/\n+/g, " "),
      question: match[1].trim(),
    }))
    .filter((item) => item.answer && item.question);
}

function countMarkdownWords(content: string): number {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\[\]()!-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function extractExternalLinks(content: string): string[] {
  return [
    ...new Set(
      Array.from(
        content.matchAll(/(?<!!)\[[^\]]*\]\((https?:\/\/[^\s)]+)[^)]*\)/g)
      )
        .map((match) => match[1])
        .filter(Boolean)
    ),
  ];
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

export const getServerSideProps: GetServerSideProps<
  BlogPostPageProps
> = async ({ params, req, res }) => {
  const { getBlogPageData, resolveBlogLocaleFromRequest } =
    await import("@/lib/blog.server");
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const locale = resolveBlogLocaleFromRequest(req);
  const data = await getBlogPageData(slug, locale);

  if (!data) return { notFound: true };
  res.setHeader("Content-Language", locale === "ko" ? "ko-KR" : "en-US");
  res.setHeader("Vary", "Cookie, Accept-Language");
  return { props: { ...data, locale } };
};

export default function BlogPostPage({
  jobs,
  locale,
  morePosts,
  post,
}: BlogPostPageProps) {
  const copy = BLOG_DETAIL_COPY[locale];
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart({
    trackingEnabled: false,
  });
  const canonicalUrl = `${SITE_URL}/blog/${post.slug}`;
  const displayTitle = getBlogDisplayTitle(post.title);
  const title = post.seoTitle || `${displayTitle} | Harper Blog`;
  const description = post.seoDescription || post.excerpt;
  const ogImageUrl = toAbsoluteUrl(post.thumbnail);
  const publishedIsoDate = toIsoDate(post.publishedAt);
  const updatedIsoDate = toIsoDate(post.updatedAt);
  const markdownToc = useMemo(
    () => extractMarkdownToc(post.content),
    [post.content]
  );
  const faqItems = useMemo(() => extractFaqItems(post.content), [post.content]);
  const talkToHarperHref = buildBlogTalkToHarperHref(post.slug);
  const dateLocale = locale === "ko" ? "ko-KR" : "en-US";
  const languageTag = locale === "ko" ? "ko-KR" : "en-US";
  const ogLocale = locale === "ko" ? "ko_KR" : "en_US";
  const citations = useMemo(
    () => extractExternalLinks(post.content),
    [post.content]
  );
  const wordCount = useMemo(
    () => countMarkdownWords(post.content),
    [post.content]
  );

  const scrollToHeading = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (markdownToc.length === 0) return;

    const updateActiveHeading = () => {
      let nextId = markdownToc[0]?.id ?? "";
      for (const item of markdownToc) {
        const element = document.getElementById(item.id);
        if (element && element.getBoundingClientRect().top <= 130) {
          nextId = item.id;
        }
      }
      setActiveHeadingId((previousId) =>
        previousId === nextId ? previousId : nextId
      );
    };
    const initialFrame = window.requestAnimationFrame(updateActiveHeading);

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        updateActiveHeading();
        ticking = false;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [markdownToc]);

  useEffect(() => {
    void postBlogEvent({ eventType: "post_view", locale, postSlug: post.slug });
  }, [locale, post.slug]);

  const trackTalkToHarper = () => {
    void postBlogEvent({
      eventType: "talk_click",
      locale,
      postSlug: post.slug,
    });
  };

  const copyPostLink = useCallback(async () => {
    try {
      const copied = await copyToClipboard(window.location.href);
      if (!copied) throw new Error("copy failed");
      void postBlogEvent({
        eventType: "copy_link",
        locale,
        postSlug: post.slug,
      });
      showToast({ message: copy.copied, variant: "white" });
    } catch {
      showToast({ message: copy.copyFailed, variant: "error" });
    }
  }, [copy.copied, copy.copyFailed, locale, post.slug]);

  const blogPostingStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${canonicalUrl}#article`,
        "@type": "BlogPosting",
        about: [post.category, ...post.tags].map((name) => ({
          "@type": "Thing",
          name,
        })),
        abstract: post.excerpt,
        articleSection: post.category,
        author: { "@type": "Person", name: post.author },
        citation: citations,
        dateModified: updatedIsoDate,
        datePublished: publishedIsoDate,
        description,
        headline: displayTitle,
        image: { "@type": "ImageObject", url: ogImageUrl },
        inLanguage: languageTag,
        isAccessibleForFree: true,
        isPartOf: {
          "@id": `${SITE_URL}/blog#blog`,
          "@type": "Blog",
          name: "Harper Blog",
        },
        keywords: post.tags.join(", "),
        mainEntityOfPage: { "@id": canonicalUrl, "@type": "WebPage" },
        publisher: {
          "@type": "Organization",
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/images/logo.png`,
          },
          name: "Harper",
          url: SITE_URL,
        },
        speakable: {
          "@type": "SpeakableSpecification",
          cssSelector: [".blog-post-title", ".blog-markdown"],
        },
        timeRequired: `PT${post.readingMinutes}M`,
        url: canonicalUrl,
        wordCount,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            item: SITE_URL,
            name: "Harper",
            position: 1,
          },
          {
            "@type": "ListItem",
            item: `${SITE_URL}/blog`,
            name: "Blog",
            position: 2,
          },
          {
            "@type": "ListItem",
            item: canonicalUrl,
            name: displayTitle,
            position: 3,
          },
        ],
      },
    ],
  };
  const faqStructuredData =
    post.schemaType === "faq" && faqItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems.map((item) => ({
            "@type": "Question",
            acceptedAnswer: { "@type": "Answer", text: item.answer },
            name: item.question,
          })),
        }
      : null;

  const markdownComponents: Components = {
    h2: ({ children, node: _node, ...props }) => {
      const headingId = `section-${toHeadingSlug(getReactNodeText(children))}`;
      return (
        <h2 id={headingId} {...props}>
          {children}
        </h2>
      );
    },
  };

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="author" content={post.author} />
        <meta name="keywords" content={post.tags.join(", ")} />
        <meta httpEquiv="content-language" content={languageTag} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <link rel="canonical" href={canonicalUrl} />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Harper Blog RSS"
          href={`${SITE_URL}/blog/feed.xml?lang=${locale}`}
        />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="Harper" />
        <meta property="og:locale" content={ogLocale} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:alt" content={displayTitle} />
        <meta property="article:published_time" content={publishedIsoDate} />
        <meta property="article:modified_time" content={updatedIsoDate} />
        <meta property="article:section" content={post.category} />
        {post.tags.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageUrl} />
        <meta name="twitter:image:alt" content={displayTitle} />
        {post.schemaType !== "none" ? (
          <script
            id={`blog-post-json-ld-${post.slug}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(blogPostingStructuredData),
            }}
          />
        ) : null}
        {faqStructuredData ? (
          <script
            id={`blog-faq-json-ld-${post.slug}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(faqStructuredData),
            }}
          />
        ) : null}
      </Head>

      <div
        id="top"
        className="min-h-screen bg-bg-basement font-sans text-neutral-primary antialiased"
      >
        <CareerAppBar
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          locale={locale}
          sectionHrefPrefix="/"
          bgColor="neutral-100"
        />

        <main className="relative min-h-screen">
          <div
            className="pointer-events-none fixed inset-0 z-0"
            style={BLOG_DOT_BACKGROUND_STYLE}
          />

          {markdownToc.length > 0 ? (
            <aside className="fixed left-6 top-24 z-20 hidden lg:flex">
              <nav
                className="sticky top-24 pt-6"
                aria-label={copy.tableOfContents}
              >
                <div className="flex flex-col gap-2">
                  {markdownToc.map((item) => {
                    const isActive = item.id === activeHeadingId;
                    return (
                      <BareButton
                        key={item.id}
                        type="button"
                        onClick={() => scrollToHeading(item.id)}
                        aria-current={isActive ? "location" : undefined}
                        className={`border-0 bg-transparent p-0 text-left leading-snug transition-colors duration-200 ${
                          isActive
                            ? "text-base text-neutral-primary"
                            : "text-sm text-neutral-muted hover:text-neutral-primary"
                        }`}
                      >
                        {item.text}
                      </BareButton>
                    );
                  })}
                </div>
              </nav>
            </aside>
          ) : null}

          <section className="relative z-10 mx-auto w-full max-w-[1024px] border-x border-neutral-1000-a10 bg-bg-basement pb-16 pt-0 md:pb-24 md:pt-12">
            <div className="flex flex-col px-6">
              <header className="mt-8 flex w-full flex-col items-center justify-center pb-20 pt-8">
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-2 text-sm text-neutral-muted transition-colors hover:text-neutral-primary"
                >
                  <span aria-hidden="true">←</span>
                  <span>{copy.back}</span>
                </Link>
                <br />
                <br />
                <p className="text-base font-normal text-primary">
                  {post.category}
                </p>
                <h1 className="blog-post-title mt-4 max-w-[70%] break-keep text-center text-3xl font-medium leading-normal text-neutral-primary md:max-w-[80%] md:text-4xl md:leading-normal">
                  {displayTitle}
                </h1>

                <div className="mt-9 flex flex-wrap items-center gap-2.5 text-sm text-neutral-muted">
                  <BlogAuthorAvatar
                    author={post.author}
                    avatarUrl={post.authorAvatar}
                    withRing
                  />
                  <span>{post.author}</span>
                </div>
              </header>

              <div className="flex w-full flex-row items-center justify-between py-4 text-sm font-normal text-neutral-soft">
                <BareButton
                  type="button"
                  onClick={copyPostLink}
                  className="flex cursor-pointer flex-row items-center gap-2 border-0 bg-transparent p-0 text-primary transition-colors hover:text-neutral-primary"
                >
                  <LinkIcon className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>{copy.copyLink}</span>
                </BareButton>
                <time dateTime={post.publishedAt}>
                  {formatBlogDate(post.publishedAt, dateLocale)}
                </time>
              </div>

              <div className="relative mt-10 h-[240px] overflow-hidden bg-bg-weak ring-1 ring-neutral-1000-a10 md:h-[420px]">
                <Image
                  src={post.thumbnail}
                  alt={displayTitle}
                  fill
                  priority
                  className="object-cover"
                  sizes="(min-width: 1024px) 768px, 100vw"
                />
              </div>

              <article className="blog-markdown mt-12 flex items-center justify-center text-neutral-900">
                <div className="w-full max-w-[712px]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {post.content}
                  </ReactMarkdown>
                </div>
              </article>
            </div>

            <div className="mt-52 border-t border-neutral-100/0 px-6 pt-14">
              <div className="mx-auto w-full max-w-[712px]">
                <section>
                  <h2 className="text-xl font-medium leading-tight text-neutral-primary">
                    {copy.jobsTitle}
                  </h2>
                  <p className="mt-3 break-keep text-[15px] font-light leading-6 text-neutral-muted">
                    {copy.jobsDescription}
                  </p>

                  {jobs.length > 0 ? (
                    <div className="mt-8 space-y-3">
                      {jobs.map((job) => (
                        <Link
                          key={job.id}
                          href={`/jobs/${job.slug}`}
                          onClick={() => {
                            void postBlogEvent({
                              eventType: "job_open",
                              locale,
                              postSlug: post.slug,
                              targetSlug: job.slug,
                            });
                          }}
                          className="group flex items-center justify-between gap-4 py-1 text-[15px] font-light leading-6 text-neutral-primary transition-colors hover:text-neutral-muted"
                        >
                          <span className="min-w-0 break-keep">
                            {job.roleTitle}
                            <span className="text-neutral-muted">
                              {" "}
                              · {job.companyName}
                            </span>
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-8 text-[14px] font-light leading-6 text-neutral-muted">
                      {copy.jobsEmpty}
                    </p>
                  )}

                  <div className="mt-9 flex flex-col gap-2 sm:flex-row">
                    <MuteButton asChild variant="primary" size="lg">
                      <Link href={talkToHarperHref} onClick={trackTalkToHarper}>
                        {copy.talk}
                        <ArrowRight className="size-4" />
                      </Link>
                    </MuteButton>
                    <MuteButton asChild size="lg">
                      <Link
                        href="/jobs"
                        onClick={() => {
                          void postBlogEvent({
                            eventType: "all_jobs_open",
                            locale,
                            postSlug: post.slug,
                          });
                        }}
                      >
                        {copy.allJobs}
                      </Link>
                    </MuteButton>
                  </div>
                </section>

                {morePosts.length > 0 ? (
                  <section className="mt-16 border-t border-neutral-1000-a10 pt-12">
                    <div className="flex items-baseline justify-between gap-4">
                      <h2 className="text-xl font-medium leading-tight text-neutral-primary">
                        {copy.blogMore}
                      </h2>
                      <Link
                        href="/blog"
                        className="inline-flex shrink-0 items-center gap-1.5 text-sm text-neutral-muted transition-colors hover:text-neutral-primary"
                      >
                        {copy.viewAll}
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </div>

                    <div className="mt-[18px] grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3">
                      {morePosts.map((item) => (
                        <Link
                          key={item.slug}
                          href={`/blog/${item.slug}`}
                          onClick={() => {
                            void postBlogEvent({
                              eventType: "post_open",
                              locale,
                              postSlug: post.slug,
                              surface: "related",
                              targetSlug: item.slug,
                            });
                          }}
                          className="block min-w-0"
                        >
                          <div className="relative aspect-[1200/630] overflow-hidden rounded-[5px] border border-neutral-1000-a10 bg-bg-weak">
                            <Image
                              src={item.thumbnail}
                              alt={getBlogDisplayTitle(item.title)}
                              fill
                              sizes="(max-width: 767px) 50vw, 220px"
                              className="object-cover"
                            />
                          </div>
                          <h3 className="mt-2.5 line-clamp-2 break-keep text-[14.5px] font-semibold leading-[1.4] text-neutral-primary">
                            {getBlogDisplayTitle(item.title)}
                          </h3>
                          <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.55] text-neutral-muted">
                            {item.excerpt}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        </main>

        <CareerLandingFooter
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          locale={locale}
        />
      </div>

      <style jsx global>{`
        .blog-markdown {
          color: var(--color-neutral-900);
          font-size: 17px;
          line-height: 1.75;
          letter-spacing: 0.005em;
          word-break: keep-all;
        }

        .blog-markdown h1,
        .blog-markdown h2,
        .blog-markdown h3 {
          color: var(--color-neutral-1000);
          font-family: var(--font-sans), sans-serif;
          line-height: 1.28;
          letter-spacing: -0.015em;
        }

        .blog-markdown h1 {
          font-size: 1.6rem;
          margin-bottom: 1.4rem;
          margin-top: 3.2rem;
        }

        .blog-markdown h2 {
          font-size: 1.4rem;
          margin-bottom: 1rem;
          margin-top: 2.6rem;
        }

        .blog-markdown h3 {
          font-size: 1.2rem;
          margin-bottom: 0.6rem;
          margin-top: 1.8rem;
        }

        .blog-markdown > h1:first-child {
          margin-top: 0;
        }

        .blog-markdown p {
          color: var(--color-neutral-900);
          font-weight: 300;
          margin: 1.25rem 0;
        }

        .blog-markdown strong {
          color: var(--color-neutral-1000);
          font-weight: 600;
        }

        .blog-markdown ul,
        .blog-markdown ol {
          margin: 1.2rem 0;
          padding-left: 1.4rem;
        }

        .blog-markdown ul {
          list-style: none;
          padding-left: 0;
        }

        .blog-markdown ul li {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
          position: relative;
        }

        .blog-markdown ul li::before {
          background: var(--color-neutral-600);
          border-radius: 50%;
          content: "";
          height: 6px;
          left: 0;
          position: absolute;
          top: 0.75em;
          width: 6px;
        }

        .blog-markdown ol {
          list-style-type: decimal;
        }

        .blog-markdown li {
          color: var(--color-neutral-900);
          font-weight: 300;
          line-height: 1.75;
        }

        .blog-markdown h3 + ul,
        .blog-markdown h3 + ol,
        .blog-markdown p + ul,
        .blog-markdown p + ol {
          margin-top: 0.4rem;
        }

        .blog-markdown blockquote {
          background: var(--color-bg-weak);
          border-left: 3px solid var(--color-neutral-400);
          border-radius: 0.6rem;
          color: var(--color-neutral-800);
          font-style: italic;
          margin: 2rem 0;
          padding: 1rem 1.2rem;
        }

        .blog-markdown a {
          color: var(--color-neutral-1000);
          text-decoration: underline;
          text-decoration-style: dotted;
          text-underline-offset: 3px;
          transition: opacity 0.2s ease;
        }

        .blog-markdown a:hover {
          opacity: 0.7;
        }

        .blog-markdown hr {
          border: 0;
          border-top: 1px solid var(--color-neutral-300);
          margin: 3rem 0;
        }

        .blog-markdown pre {
          background: var(--color-neutral-1000);
          border: 1px solid var(--color-neutral-800);
          border-radius: 0.8rem;
          color: var(--color-neutral-00);
          font-size: 0.9rem;
          line-height: 1.7;
          margin: 1.8rem 0;
          overflow-x: auto;
          padding: 1.2rem 1.4rem;
        }

        .blog-markdown code {
          background: var(--color-bg-weak);
          border-radius: 0.4rem;
          color: var(--color-neutral-1000);
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          font-size: 0.88em;
          padding: 0.15rem 0.45rem;
        }

        .blog-markdown pre code {
          background: transparent;
          color: inherit;
          padding: 0;
        }

        .blog-markdown img {
          border-radius: 0;
          margin: 2rem auto;
          max-width: 100%;
        }

        .blog-markdown > * + * {
          margin-top: 0;
        }
      `}</style>
    </>
  );
}
