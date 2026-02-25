import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BlogPost, formatBlogDate, toIsoDate } from "@/lib/blog";
import Footer from "@/components/landing/Footer";
import LandingHeader from "@/components/landing/LandingHeader";
import { LinkIcon } from "lucide-react";
import { HERO_DOT_BACKGROUND_STYLE } from "..";
import { useRouter } from "next/router";
import { useIsMobile } from "@/hooks/useIsMobile";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/toast/toast";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://matchharper.com")
  .trim()
  .replace(/\/$/, "");

type BlogPostPageProps = {
  post: BlogPost;
};

type MarkdownH1TocItem = {
  id: string;
  text: string;
};

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
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

function extractMarkdownH1Toc(content: string): MarkdownH1TocItem[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const slugCountByBase = new Map<string, number>();
  const toc: MarkdownH1TocItem[] = [];
  let isInsideCodeFence = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^(```|~~~)/.test(line)) {
      isInsideCodeFence = !isInsideCodeFence;
      continue;
    }

    if (isInsideCodeFence) {
      continue;
    }

    const match = line.match(/^#\s+(.+)$/);
    if (!match) {
      continue;
    }

    const text = match[1].replace(/\s+#+\s*$/, "").trim();
    if (!text) {
      continue;
    }

    const slugBase = `h1-${toHeadingSlug(text)}`;
    const usedCount = slugCountByBase.get(slugBase) ?? 0;
    slugCountByBase.set(slugBase, usedCount + 1);
    const id = usedCount === 0 ? slugBase : `${slugBase}-${usedCount + 1}`;

    toc.push({ id, text });
  }

  return toc;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(ta);
  return copied;
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { getAllPostSlugs } = await import("@/lib/blog.server");
  const slugs = getAllPostSlugs();

  return {
    paths: slugs.map((slug) => ({ params: { slug } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<BlogPostPageProps> = async ({
  params,
}) => {
  const { getPostBySlug } = await import("@/lib/blog.server");
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      post,
    },
    revalidate: 3600,
  };
};

export default function BlogPostPage({ post }: BlogPostPageProps) {
  const router = useRouter();
  const [activeHeadingId, setActiveHeadingId] = useState<string>("");
  const canonicalUrl = `${SITE_URL}/blog/${post.slug}`;
  const title = post.seoTitle || `${post.title} | Harper Blog`;
  const description = post.seoDescription || post.excerpt;
  const ogImageUrl = toAbsoluteUrl(post.thumbnail);
  const publishedIsoDate = toIsoDate(post.publishedAt);
  const updatedIsoDate = toIsoDate(post.updatedAt);
  const markdownH1Toc = useMemo(
    () => extractMarkdownH1Toc(post.content),
    [post.content]
  );
  const isMobile = useIsMobile();

  const scrollToHeading = useCallback((id: string) => {
    if (typeof window === "undefined") return;

    const target = document.getElementById(id);
    if (!target) return;

    const fixedHeaderOffset = 96;
    const top =
      target.getBoundingClientRect().top + window.scrollY - fixedHeaderOffset;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || markdownH1Toc.length === 0) {
      setActiveHeadingId("");
      return;
    }

    const updateActiveHeading = () => {
      const viewportOffset = 130;
      let nextActiveId = markdownH1Toc[0].id;
      let hasHeadingInDom = false;

      for (const item of markdownH1Toc) {
        const heading = document.getElementById(item.id);
        if (!heading) {
          continue;
        }

        hasHeadingInDom = true;

        if (heading.getBoundingClientRect().top - viewportOffset <= 0) {
          nextActiveId = item.id;
        } else {
          break;
        }
      }

      if (!hasHeadingInDom) {
        return;
      }

      setActiveHeadingId((prev) =>
        prev === nextActiveId ? prev : nextActiveId
      );
    };

    updateActiveHeading();

    let isTicking = false;
    const handleScroll = () => {
      if (isTicking) return;
      isTicking = true;

      window.requestAnimationFrame(() => {
        updateActiveHeading();
        isTicking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [markdownH1Toc]);

  const blogPostingStructuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description,
    image: ogImageUrl,
    url: canonicalUrl,
    datePublished: publishedIsoDate,
    dateModified: updatedIsoDate,
    inLanguage: "en-US",
    articleSection: post.category,
    keywords: post.tags.join(", "),
    author: {
      "@type": "Person",
      name: post.author,
    },
    publisher: {
      "@type": "Organization",
      name: "Harper",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/images/logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
  };

  let renderedHeadingIndex = 0;
  const markdownComponents: Components = {
    h1: ({ node: _node, ...props }) => {
      const headingId = markdownH1Toc[renderedHeadingIndex]?.id;
      renderedHeadingIndex += 1;
      return <h1 id={headingId} {...props} />;
    },
  };

  const moveToHome = async () => {
    let landingId = localStorage.getItem("harper_landing_id_0209");
    if (!landingId) landingId = "";

    const body = {
      local_id: landingId,
      type: "blog_post_click",
      is_mobile: isMobile,
      country_lang: "",
    };
    await supabase.from("landing_logs").insert(body);

    router.push("/");
  };

  const copyPostLink = useCallback(async () => {
    const postUrl =
      typeof window !== "undefined" ? window.location.href : canonicalUrl;

    try {
      const copied = await copyToClipboard(postUrl);
      if (!copied) {
        throw new Error("Failed to copy link");
      }

      showToast({
        message: "링크가 복사되었습니다.",
        variant: "white",
      });
    } catch {
      showToast({
        message: "링크 복사에 실패했습니다.",
        variant: "error",
      });
    }
  }, [canonicalUrl]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="Harper" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:alt" content={post.title} />
        <meta property="article:published_time" content={publishedIsoDate} />
        <meta property="article:modified_time" content={updatedIsoDate} />
        <meta property="article:section" content={post.category} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageUrl} />
        <script
          key={`ld-blog-${post.slug}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(blogPostingStructuredData),
          }}
        />
      </Head>

      <div
        className="pointer-events-none fixed inset-0 z-0 top-0 left-0"
        style={HERO_DOT_BACKGROUND_STYLE}
      />
      <main className="min-h-screen text-hgray1000 font-sans relative">
        <LandingHeader />
        {markdownH1Toc.length > 0 && (
          <aside className="hidden lg:flex fixed top-24 left-6">
            <nav className="sticky top-24 pt-6" aria-label="Table of contents">
              <div className="flex flex-col gap-2">
                {markdownH1Toc.map((item) => {
                  const isActive = item.id === activeHeadingId;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => scrollToHeading(item.id)}
                      className={`bg-transparent border-0 p-0 text-left leading-snug transition-all duration-200 ${
                        isActive
                          ? "text-hgray1000 text-base"
                          : "text-hgray500 text-sm hover:text-hgray700"
                      }`}
                    >
                      {item.text}
                    </button>
                  );
                })}
              </div>
            </nav>
          </aside>
        )}
        <section className="mx-auto w-full max-w-[1024px] pb-16 pt-0 md:pb-24 md:pt-12 border-x border-white/10 bg-black z-30">
          <div className="flex flex-col px-6">
            <header className="mt-8 flex flex-col items-center justify-center pt-8 pb-20 w-full">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm text-hgray900 transition-colors hover:text-hgray1000"
              >
                <span aria-hidden="true">←</span>
                <span>Back to blog</span>
              </Link>
              <br />
              <br />
              <p className="text-base font-normal text-accenta1">
                {post.category}
              </p>
              <h1 className="max-w-[70%] md:max-w-[80%] mt-4 font-medium text-3xl leading-normal md:text-4xl md:leading-normal text-center break-keep">
                {post.title}
              </h1>

              <div className="mt-9 flex flex-wrap items-center gap-2.5 text-sm text-hgray900">
                <div className="relative h-5 w-5 overflow-hidden rounded-full ring-1 ring-white/20">
                  <Image
                    src={post.authorAvatar}
                    alt={post.author}
                    fill
                    className="object-cover"
                    sizes="28px"
                  />
                </div>
                <span>{post.author}</span>
              </div>
            </header>

            <div className="flex flex-row items-center justify-between w-full text-hgray700 text-sm font-light py-4">
              <button
                type="button"
                onClick={copyPostLink}
                className="flex flex-row items-center gap-2 text-accenta1 bg-transparent border-0 p-0 cursor-pointer transition-colors hover:text-accenta1/80"
                aria-label="게시글 링크 복사"
              >
                <LinkIcon className="w-3.5 h-3.5" strokeWidth={2} />
                <span>링크 복사</span>
              </button>
              <time dateTime={post.publishedAt}>
                {formatBlogDate(post.publishedAt)}
              </time>
            </div>
            <div className="relative mt-10 h-[240px] overflow-hidden bg-white/5 ring-1 ring-white/10 md:h-[420px]">
              <Image
                src={post.thumbnail}
                alt={`${post.title} hero image`}
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 768px, 100vw"
              />
            </div>

            <article className="blog-markdown mt-12 text-hgray800 flex items-center justify-center">
              <div className="max-w-[712px] w-full">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {post.content}
                </ReactMarkdown>
              </div>
            </article>
          </div>
          <div className="mt-52 relative overflow-hidden border-y border-white/10 py-20">
            {/* background image */}
            <Image
              src="/images/bb.jpg" // 원하는 이미지
              alt=""
              fill
              priority={false}
              className="object-cover"
            />

            {/* dark overlay (가독성용) */}
            <div className="absolute inset-0 bg-black/80" />

            {/* content */}
            <div className="relative z-10 flex flex-col items-center justify-center text-center text-2xl md:text-3xl font-medium text-hgray1000">
              Harper를 사용해서
              <br />
              원하는 사람을 즉시 발견하세요.
              <button
                onClick={moveToHome}
                className="cursor-pointer hover:bg-accenta1/90 transition-all duration-200 mt-8 text-sm font-medium text-black bg-accenta1 px-5 py-3 rounded-full"
              >
                시작하기
              </button>
              <div className="mt-8 text-sm text-hgray800 font-normal">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-col md:flex-row gap-2 items-center justify-center">
                    <div
                      onClick={moveToHome}
                      className="cursor-pointer hover:text-white transition-all duration-200"
                    >
                      Rust 오픈소스 기여 엔지니어
                    </div>
                    <div>/</div>
                    <div
                      onClick={moveToHome}
                      className="cursor-pointer hover:text-white transition-all duration-200"
                    >
                      최근 6개월 내 Seed 또는 Series A 투자를 받은 AI 스타트업
                      Founder…
                    </div>
                  </div>
                  <div className="md:flex flex-row gap-2 items-center justify-center hidden">
                    <div
                      onClick={moveToHome}
                      className="cursor-pointer hover:text-white transition-all duration-200"
                    >
                      LLM 기반 제품 디자이너
                    </div>
                    <div>/</div>
                    <div
                      onClick={moveToHome}
                      className="cursor-pointer hover:text-white transition-all duration-200"
                    >
                      일본 문화를 이해하고 있는 한국인 SNS 마케터
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <Footer />
      </main>
      <style jsx global>{`
        .blog-markdown {
          color: rgba(255, 255, 255, 0.88);
          font-size: 17px;
          line-height: 1.75;
          letter-spacing: 0.005em;
          word-break: keep-all;
        }

        /* ---------- Headings ---------- */

        .blog-markdown h1,
        .blog-markdown h2,
        .blog-markdown h3 {
          font-family: var(--font-sans), serif;
          color: #ffffff;
          line-height: 1.28;
          letter-spacing: -0.015em;
        }

        .blog-markdown h1 {
          font-family: var(--font-sans), serif;
          font-size: 1.6rem;
          margin-top: 3.2rem;
          margin-bottom: 1.4rem;
        }

        .blog-markdown h2 {
          font-size: 1.4rem;
          margin-top: 2.6rem;
          margin-bottom: 1rem;
        }

        .blog-markdown h3 {
          font-size: 1.2rem;
          margin-top: 1.8rem;
          margin-bottom: 0.6rem;
        }

        /* 첫 heading은 위 여백 제거 */
        .blog-markdown > h1:first-child {
          margin-top: 0;
        }

        /* ---------- Paragraph ---------- */

        .blog-markdown p {
          margin: 1.25rem 0;
          font-weight: 300;
          color: rgba(255, 255, 255, 0.86);
        }

        /* ---------- Strong ---------- */

        .blog-markdown strong {
          color: #ffffff;
          font-weight: 600;
        }

        /* ---------- Lists ---------- */

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
          position: relative;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }

        .blog-markdown ul li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.75em;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.45);
        }

        .blog-markdown ol {
          list-style-type: decimal;
        }

        .blog-markdown li {
          font-weight: 300;
          color: rgba(255, 255, 255, 0.86);
          line-height: 1.75;
        }

        /* Heading 바로 아래 리스트 간격 보정 */
        .blog-markdown h3 + ul,
        .blog-markdown h3 + ol {
          margin-top: 0.4rem;
        }

        /* Heading 바로 아래 리스트 간격 보정 */
        .blog-markdown p + ul,
        .blog-markdown p + ol {
          margin-top: 0.4rem;
        }

        /* ---------- Blockquote ---------- */

        .blog-markdown blockquote {
          margin: 2rem 0;
          padding: 1rem 1.2rem;
          border-left: 3px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.78);
          font-style: italic;
          border-radius: 0.6rem;
        }

        /* ---------- Links ---------- */

        .blog-markdown a {
          color: rgba(255, 255, 255, 0.95);
          text-decoration: underline;
          text-decoration-style: dotted;
          text-underline-offset: 3px;
          transition: opacity 0.2s ease;
        }

        .blog-markdown a:hover {
          opacity: 0.7;
        }

        /* ---------- Divider ---------- */

        .blog-markdown hr {
          margin: 3rem 0;
          border: 0;
          border-top: 1px solid rgba(255, 255, 255, 0.14);
        }

        /* ---------- Code block ---------- */

        .blog-markdown pre {
          margin: 1.8rem 0;
          border-radius: 0.8rem;
          background: rgba(0, 0, 0, 0.85);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.14);
          padding: 1.2rem 1.4rem;
          overflow-x: auto;
          font-size: 0.9rem;
          line-height: 1.7;
        }

        /* Inline code */

        .blog-markdown code {
          border-radius: 0.4rem;
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          padding: 0.15rem 0.45rem;
          font-size: 0.88em;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        }

        .blog-markdown pre code {
          background: transparent;
          padding: 0;
        }

        /* ---------- Images ---------- */

        .blog-markdown img {
          margin: 2rem auto;
          border-radius: 0rem;
          max-width: 100%;
        }

        /* ---------- Spacing rhythm helper ---------- */

        .blog-markdown > * + * {
          margin-top: 0;
        }
      `}</style>
    </>
  );
}
