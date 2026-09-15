import BlogAuthorAvatar from "@/components/blog/BlogAuthorAvatar";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import { MuteButton } from "@/components/ui/button";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";
import type { BlogCategorySummary, BlogLocale, BlogPostMeta } from "@/lib/blog";
import { formatBlogDate, getBlogDisplayTitle, toIsoDate } from "@/lib/blog";
import { postBlogEvent } from "@/lib/blogMetrics";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://matchharper.com")
  .trim()
  .replace(/\/$/, "");
const BLOG_CANONICAL_URL = `${SITE_URL}/blog`;
const ALL_CATEGORY = "__all__";

const BLOG_LIST_COPY = {
  ko: {
    all: "전체",
    categories: "카테고리",
    description:
      "커리어와 채용 시장에서 새롭게 등장하는 역할과 일하는 방식을 Harper가 정리합니다.",
    empty: "이 카테고리에는 아직 게시된 글이 없습니다.",
    heading: "모든 글",
    readArticle: "글 읽기",
    title: "Harper 블로그",
  },
  en: {
    all: "All",
    categories: "Categories",
    description:
      "Harper's field notes on emerging roles, career decisions, and how hiring is changing.",
    empty: "There are no published posts in this category yet.",
    heading: "All",
    readArticle: "Read article",
    title: "Harper Blog",
  },
} as const;

type BlogListPageProps = {
  categories: BlogCategorySummary[];
  locale: BlogLocale;
  posts: BlogPostMeta[];
};

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export const getServerSideProps: GetServerSideProps<
  BlogListPageProps
> = async ({ req, res }) => {
  const {
    getAllPostsMeta,
    getCategorySummaries,
    resolveBlogLocaleFromRequest,
  } = await import("@/lib/blog.server");
  const locale = resolveBlogLocaleFromRequest(req);
  const posts = await getAllPostsMeta(locale);
  res.setHeader("Content-Language", locale === "ko" ? "ko-KR" : "en-US");
  res.setHeader("Vary", "Cookie, Accept-Language");

  return {
    props: {
      categories: getCategorySummaries(posts),
      locale,
      posts,
    },
  };
};

export default function BlogListPage({
  categories,
  locale,
  posts,
}: BlogListPageProps) {
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);
  const copy = BLOG_LIST_COPY[locale];
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart({
    trackingEnabled: false,
  });

  const categoryItems = useMemo(
    () => [{ count: posts.length, name: ALL_CATEGORY }, ...categories],
    [categories, posts.length]
  );
  const filteredPosts = useMemo(
    () =>
      activeCategory === ALL_CATEGORY
        ? posts
        : posts.filter((post) => post.category === activeCategory),
    [activeCategory, posts]
  );
  const pinnedPosts = useMemo(
    () => posts.filter((post) => post.isPinned),
    [posts]
  );
  const topPosts = useMemo(
    () => (pinnedPosts.length > 0 ? pinnedPosts : posts.slice(0, 5)),
    [pinnedPosts, posts]
  );
  const featured = topPosts[0];
  const rightRail = topPosts.slice(1, 5);
  const headingLabel =
    activeCategory === ALL_CATEGORY ? copy.heading : activeCategory;
  const languageTag = locale === "ko" ? "ko-KR" : "en-US";
  const ogLocale = locale === "ko" ? "ko_KR" : "en_US";
  const keywords =
    locale === "ko"
      ? "커리어, 채용, 이직, 스타트업, AI, Harper"
      : "careers, hiring, jobs, startups, AI, Harper";

  const blogStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": `${BLOG_CANONICAL_URL}#webpage`,
        "@type": "CollectionPage",
        description: copy.description,
        inLanguage: languageTag,
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: { "@id": `${BLOG_CANONICAL_URL}#blog` },
        name: copy.title,
        url: BLOG_CANONICAL_URL,
      },
      {
        "@id": `${BLOG_CANONICAL_URL}#blog`,
        "@type": "Blog",
        blogPost: posts.map((post) => ({
          "@id": `${BLOG_CANONICAL_URL}/${post.slug}#article`,
          "@type": "BlogPosting",
          author: { "@type": "Person", name: post.author },
          dateModified: toIsoDate(post.updatedAt),
          datePublished: toIsoDate(post.publishedAt),
          description: post.excerpt,
          headline: getBlogDisplayTitle(post.title),
          image: toAbsoluteUrl(post.thumbnail),
          inLanguage: languageTag,
          url: `${BLOG_CANONICAL_URL}/${post.slug}`,
        })),
        description: copy.description,
        inLanguage: languageTag,
        name: copy.title,
        publisher: {
          "@type": "Organization",
          name: "Harper",
          url: SITE_URL,
        },
        url: BLOG_CANONICAL_URL,
      },
      {
        "@type": "ItemList",
        itemListElement: posts.map((post, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${BLOG_CANONICAL_URL}/${post.slug}`,
        })),
        numberOfItems: posts.length,
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
            item: BLOG_CANONICAL_URL,
            name: "Blog",
            position: 2,
          },
        ],
      },
    ],
  };

  const dateLocale = locale === "ko" ? "ko-KR" : "en-US";

  useEffect(() => {
    void postBlogEvent({ eventType: "list_view", locale });
  }, [locale]);

  return (
    <>
      <Head>
        <title>{copy.title} | Harper</title>
        <meta name="description" content={copy.description} />
        <meta name="author" content="Harper" />
        <meta name="keywords" content={keywords} />
        <meta httpEquiv="content-language" content={languageTag} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <link rel="canonical" href={BLOG_CANONICAL_URL} />
        <link
          rel="alternate"
          type="application/rss+xml"
          title={`${copy.title} RSS`}
          href={`${BLOG_CANONICAL_URL}/feed.xml?lang=${locale}`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Harper" />
        <meta property="og:locale" content={ogLocale} />
        <meta property="og:title" content={copy.title} />
        <meta property="og:description" content={copy.description} />
        <meta property="og:url" content={BLOG_CANONICAL_URL} />
        <meta
          property="og:image"
          content={`${SITE_URL}/images/logos/thumbnail.png`}
        />
        <meta property="og:image:alt" content={copy.title} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={copy.title} />
        <meta name="twitter:description" content={copy.description} />
        <meta
          name="twitter:image"
          content={`${SITE_URL}/images/logos/thumbnail.png`}
        />
        <meta name="twitter:image:alt" content={copy.title} />
        <script
          id="blog-list-json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(blogStructuredData),
          }}
        />
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

        <main className="relative min-h-screen overflow-hidden">
          <div className="relative z-10 mx-auto w-full max-w-[1280px] px-4 pb-20 pt-24 md:px-16 md:pb-28 md:pt-28">
            <header className="mb-12 flex flex-col items-center justify-center py-10 text-center md:mb-14 md:py-12">
              <h1 className="font-hedvig text-5xl leading-none text-neutral-primary md:text-7xl">
                Blog
              </h1>
            </header>

            {featured ? (
              <section className="mb-14 md:mb-16">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-11 lg:gap-8">
                  <Link
                    href={`/blog/${featured.slug}`}
                    className="group relative overflow-hidden bg-neutral-00/60 ring-1 ring-neutral-1000-a05 lg:col-span-6"
                    aria-label={`${copy.readArticle}: ${getBlogDisplayTitle(featured.title)}`}
                    onClick={() => {
                      void postBlogEvent({
                        eventType: "post_open",
                        locale,
                        surface: "featured",
                        targetSlug: featured.slug,
                      });
                    }}
                  >
                    <div className="relative aspect-16/8 w-full overflow-hidden">
                      <Image
                        src={featured.thumbnail}
                        alt={getBlogDisplayTitle(featured.title)}
                        fill
                        priority
                        className="object-cover"
                        sizes="(min-width: 768px) 512px, 100vw"
                      />
                    </div>

                    <div className="p-6 md:p-8">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-primary text-[11px] font-semibold uppercase">
                          {featured.category}
                        </span>
                      </div>

                      <h2 className="mt-3 text-xl leading-tight text-neutral-primary md:text-2xl md:leading-[1.05]">
                        {getBlogDisplayTitle(featured.title)}
                      </h2>

                      <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-muted md:text-[15px]">
                        {featured.excerpt}
                      </p>

                      <div className="mt-6 flex items-center gap-3 text-sm text-neutral-muted">
                        <BlogAuthorAvatar
                          author={featured.author}
                          avatarUrl={featured.authorAvatar}
                          withRing
                        />
                        <span>{featured.author}</span>
                        <span className="text-neutral-soft">•</span>
                        <time
                          dateTime={featured.publishedAt}
                          className="text-sm font-normal text-neutral-soft"
                        >
                          {formatBlogDate(featured.publishedAt, dateLocale)}
                        </time>
                      </div>
                    </div>

                    <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <div className="absolute inset-0 bg-black/3" />
                    </div>
                  </Link>

                  <div className="hidden flex-col gap-4 md:flex lg:col-span-5">
                    {rightRail.map((post) => (
                      <Link
                        key={post.slug}
                        href={`/blog/${post.slug}`}
                        className="group flex gap-4 bg-neutral-00/60 ring-1 ring-neutral-1000-a05 transition-colors hover:bg-neutral-00/80"
                        aria-label={`${copy.readArticle}: ${getBlogDisplayTitle(post.title)}`}
                        onClick={() => {
                          void postBlogEvent({
                            eventType: "post_open",
                            locale,
                            surface: "rail",
                            targetSlug: post.slug,
                          });
                        }}
                      >
                        <div className="relative h-[112px] w-[112px] flex-none overflow-hidden bg-bg-weak ring-1 ring-neutral-1000-a05">
                          <Image
                            src={post.thumbnail}
                            alt={getBlogDisplayTitle(post.title)}
                            fill
                            className="object-cover"
                            sizes="112px"
                          />
                        </div>

                        <div className="flex h-full min-w-0 flex-col items-start justify-center pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-primary text-[11px] font-medium uppercase">
                              {post.category}
                            </span>
                          </div>
                          <h3 className="mt-1 max-w-full truncate text-base leading-[1.2] text-neutral-primary md:leading-[1.1]">
                            {getBlogDisplayTitle(post.title)}
                          </h3>

                          <div className="mt-2 flex items-center gap-2 text-xs text-neutral-muted">
                            <BlogAuthorAvatar
                              author={post.author}
                              avatarUrl={post.authorAvatar}
                              withRing
                            />
                            <span className="truncate">{post.author}</span>
                            <span className="text-neutral-soft">•</span>
                            <time
                              dateTime={post.publishedAt}
                              className="text-xs text-neutral-soft"
                            >
                              {formatBlogDate(post.publishedAt, dateLocale)}
                            </time>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid grid-cols-1 gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
              <aside className="self-start lg:sticky lg:top-8">
                <div className="md:p-6">
                  <h2 className="text-xs font-medium uppercase text-neutral-muted">
                    {copy.categories}
                  </h2>

                  <div className="mt-4 flex flex-col gap-1.5">
                    {categoryItems.map((category) => {
                      const isActive = category.name === activeCategory;
                      return (
                        <MuteButton
                          key={category.name}
                          type="button"
                          variant={isActive ? "neutral" : "transparent"}
                          size="lg"
                          onClick={() => setActiveCategory(category.name)}
                          aria-pressed={isActive}
                          className="w-full justify-between px-3 py-2.5 text-left text-[15px] shadow-none"
                        >
                          <span className="font-medium">
                            {category.name === ALL_CATEGORY
                              ? copy.all
                              : category.name}
                          </span>
                          <span className="text-sm text-neutral-soft">
                            ({category.count})
                          </span>
                        </MuteButton>
                      );
                    })}
                  </div>
                </div>
              </aside>

              <div>
                <div className="flex items-start justify-start gap-4">
                  <h2 className="font-hedvig text-2xl md:text-3xl">
                    {headingLabel}
                  </h2>
                </div>

                <div className="mt-4 md:mt-8">
                  {filteredPosts.map((post) => (
                    <article key={post.slug} className="py-5">
                      <Link
                        href={`/blog/${post.slug}`}
                        className="group block"
                        aria-label={`${copy.readArticle}: ${getBlogDisplayTitle(post.title)}`}
                        onClick={() => {
                          void postBlogEvent({
                            eventType: "post_open",
                            locale,
                            surface: "list",
                            targetSlug: post.slug,
                          });
                        }}
                      >
                        <div className="min-w-0">
                          <div className="md:hidden">
                            <h3 className="line-clamp-2 break-keep text-[17px] font-medium leading-[1.4] text-neutral-primary transition-colors group-hover:text-neutral-muted">
                              {getBlogDisplayTitle(post.title)}
                            </h3>
                            <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-neutral-muted">
                              <span className="shrink-0">{post.category}</span>
                              <span aria-hidden="true" className="text-[10px]">
                                •
                              </span>
                              <time
                                dateTime={post.publishedAt}
                                className="shrink-0"
                              >
                                {formatBlogDate(post.publishedAt, dateLocale)}
                              </time>
                            </div>
                          </div>

                          <div className="hidden flex-wrap items-center justify-between gap-3 md:flex md:justify-start">
                            <span className="text-xs font-normal uppercase text-neutral-muted">
                              {post.category}
                            </span>
                            <h3 className="min-w-0 flex-1 truncate text-base leading-[1.15] text-neutral-primary transition-colors group-hover:text-neutral-muted">
                              {getBlogDisplayTitle(post.title)}
                            </h3>
                            <div className="flex flex-row items-center justify-between gap-3">
                              <div className="flex flex-row items-center gap-2">
                                <BlogAuthorAvatar
                                  author={post.author}
                                  avatarUrl={post.authorAvatar}
                                />
                                <span className="whitespace-nowrap text-sm">
                                  {post.author}
                                </span>
                              </div>
                              <time
                                dateTime={post.publishedAt}
                                className="text-sm text-neutral-soft md:justify-self-end"
                              >
                                {formatBlogDate(post.publishedAt, dateLocale)}
                              </time>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </article>
                  ))}
                </div>

                {filteredPosts.length === 0 ? (
                  <p className="mt-6 text-sm text-neutral-muted">
                    {copy.empty}
                  </p>
                ) : null}
              </div>
            </section>
          </div>

          <div className="h-[40vh]" />
        </main>

        <CareerLandingFooter
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          locale={locale}
        />
      </div>
    </>
  );
}
