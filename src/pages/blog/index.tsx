import type { GetStaticProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BlogCategorySummary,
  BlogPostMeta,
  formatBlogDate,
  toIsoDate,
} from "@/lib/blog";
import Footer from "@/components/landing/Footer";
import LandingHeader from "@/components/landing/LandingHeader";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://matchharper.com")
  .trim()
  .replace(/\/$/, "");
const BLOG_CANONICAL_URL = `${SITE_URL}/blog`;
const ALL_ARTICLES_LABEL = "All Articles";

type BlogListPageProps = {
  posts: BlogPostMeta[];
  categories: BlogCategorySummary[];
};

type CategoryItem = {
  name: string;
  count: number;
};

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export const getStaticProps: GetStaticProps<BlogListPageProps> = async () => {
  const { getAllPostsMeta, getCategorySummaries } =
    await import("@/lib/blog.server");
  const posts = getAllPostsMeta();
  const categories = getCategorySummaries(posts);

  return {
    props: { posts, categories },
    revalidate: 3600,
  };
};

export default function BlogListPage({ posts, categories }: BlogListPageProps) {
  const [activeCategory, setActiveCategory] =
    useState<string>(ALL_ARTICLES_LABEL);

  const categoryItems = useMemo<CategoryItem[]>(
    () => [{ name: ALL_ARTICLES_LABEL, count: posts.length }, ...categories],
    [categories, posts.length]
  );

  const filteredPosts = useMemo(
    () =>
      activeCategory === ALL_ARTICLES_LABEL
        ? posts
        : posts.filter((post) => post.category === activeCategory),
    [activeCategory, posts]
  );

  const blogStructuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Harper Blog",
      url: BLOG_CANONICAL_URL,
      description:
        "Insights about recruiting, engineering, and product execution from the Harper team.",
      inLanguage: "en-US",
      blogPost: posts.map((post) => ({
        "@type": "BlogPosting",
        headline: post.title,
        description: post.excerpt,
        url: `${BLOG_CANONICAL_URL}/${post.slug}`,
        datePublished: toIsoDate(post.publishedAt),
        dateModified: toIsoDate(post.updatedAt),
        image: toAbsoluteUrl(post.thumbnail),
        author: { "@type": "Person", name: post.author },
      })),
    }),
    [posts]
  );

  const headingLabel =
    activeCategory === ALL_ARTICLES_LABEL ? "All" : activeCategory;

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

  const topPostSlugs = useMemo(
    () => new Set(topPosts.map((post) => post.slug)),
    [topPosts]
  );

  const restList = useMemo(
    () => filteredPosts,
    // () => filteredPosts.filter((post) => !topPostSlugs.has(post.slug)),
    [filteredPosts, topPostSlugs]
  );

  return (
    <>
      <Head>
        <title>Harper Blog | Recruiting, Engineering, Product</title>
        <meta
          name="description"
          content="Insights about recruiting, engineering, and product execution from the Harper team."
        />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <link rel="canonical" href={BLOG_CANONICAL_URL} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Harper" />
        <meta property="og:title" content="Harper Blog" />
        <meta
          property="og:description"
          content="Insights about recruiting, engineering, and product execution from the Harper team."
        />
        <meta property="og:url" content={BLOG_CANONICAL_URL} />
        <meta property="og:image" content={`${SITE_URL}/images/usemain.png`} />
        <meta property="og:image:alt" content="Harper Blog" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Harper Blog" />
        <meta
          name="twitter:description"
          content="Insights about recruiting, engineering, and product execution from the Harper team."
        />
        <meta name="twitter:image" content={`${SITE_URL}/images/usemain.png`} />
        <script
          key="ld-blog"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(blogStructuredData),
          }}
        />
      </Head>

      <main className="relative min-h-screen overflow-hidden bg-black text-hgray1000 font-sans">
        <LandingHeader />
        <div className="relative z-10 mx-auto w-full max-w-[1280px] px-4 pb-20 pt-24 md:px-16 md:pb-28 md:pt-28">
          {/* header */}
          <header className="relative overflow-hidden mb-12 md:mb-14 bg-black text-center flex flex-col items-center justify-center py-12">
            <Image
              src="/images/bb.jpg" // 원하는 이미지
              alt=""
              fill
              priority={false}
              className="object-cover"
            />
            {/* dark overlay (가독성용) */}
            <div className="absolute inset-0 bg-black/80" />

            <h1 className="z-10 mt-3 font-garamond text-4xl leading-[0.95] md:text-5xl">
              Blog
            </h1>
            <p className="z-10 mt-5 max-w-2xl text-base leading-6 text-white/65 md:text-lg">
              Insights, updates, and stories from the Harper team.
            </p>
          </header>

          {/* top: featured grid (screenshot 2 vibe) */}
          {featured ? (
            <section className="mb-14 md:mb-16">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-11 lg:gap-8">
                {/* left: big featured */}
                <Link
                  href={`/blog/${featured.slug}`}
                  className="group relative overflow-hidden bg-white/5 ring-1 ring-white/10 lg:col-span-6"
                  aria-label={`Read ${featured.title}`}
                >
                  <div className="relative aspect-[16/8] w-full overflow-hidden">
                    {/* ✅ requested thumbnail style */}
                    <Image
                      src={featured.thumbnail}
                      alt={`${featured.title} hero image`}
                      fill
                      priority
                      className="object-cover"
                      sizes="(min-width: 768px) 512px, 100vw"
                    />
                    {/* dark overlay for readability */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
                  </div>

                  <div className="p-6 md:p-8">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                        {featured.category}
                      </span>
                    </div>

                    <h2 className="mt-3 text-xl leading-[1.05] text-white md:text-2xl">
                      {featured.title}
                    </h2>

                    <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 md:text-[15px]">
                      {featured.excerpt}
                    </p>

                    <div className="mt-6 flex items-center gap-3 text-sm text-white/70">
                      <div className="relative h-5 w-5 overflow-hidden rounded-full ring-1 ring-white/15">
                        <Image
                          src={featured.authorAvatar}
                          alt={featured.author}
                          fill
                          className="object-cover"
                          sizes="28px"
                        />
                      </div>
                      <span>{featured.author}</span>
                      <span className="text-white/35">•</span>
                      <time
                        dateTime={featured.publishedAt}
                        className="text-sm text-white/55 font-normal"
                      >
                        {formatBlogDate(featured.publishedAt)}
                      </time>
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="absolute inset-0 bg-white/5" />
                  </div>
                </Link>

                {/* right: stacked cards */}
                <div className="flex flex-col gap-4 lg:col-span-5">
                  {rightRail.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blog/${post.slug}`}
                      className="group flex gap-4 bg-white/[0.04] ring-1 ring-white/10 transition-colors hover:bg-white/[0.06]"
                      aria-label={`Read ${post.title}`}
                    >
                      <div className="relative h-[112px] w-[112px] flex-none overflow-hidden bg-white/5 ring-1 ring-white/10">
                        <Image
                          src={post.thumbnail}
                          alt={`${post.title} thumbnail`}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          sizes="96px"
                        />
                      </div>

                      <div className="h-full flex flex-col items-start justify-center pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">
                            {post.category}
                          </span>
                        </div>
                        <h3 className="mt-1 truncate text-base leading-[1.1] text-white">
                          {post.title}
                        </h3>

                        <div className="mt-2 flex items-center gap-2 text-xs text-white/60">
                          <div className="relative h-5 w-5 overflow-hidden rounded-full ring-1 ring-white/15">
                            <Image
                              src={post.authorAvatar}
                              alt={post.author}
                              fill
                              className="object-cover"
                              sizes="20px"
                            />
                          </div>
                          <span className="truncate">{post.author}</span>
                          <span className="text-white/30">•</span>
                          <time
                            dateTime={post.publishedAt}
                            className="text-xs text-white/50"
                          >
                            {formatBlogDate(post.publishedAt)}
                          </time>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* bottom: categories + list (screenshot 1 vibe) */}
          <section className="grid grid-cols-1 gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
            <aside className="self-start lg:sticky lg:top-8">
              <div className="md:p-6">
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-white/55">
                  Categories
                </h2>

                <div className="mt-4 flex flex-col gap-1.5">
                  {categoryItems.map((category) => {
                    const isActive = category.name === activeCategory;
                    return (
                      <button
                        key={category.name}
                        type="button"
                        onClick={() => setActiveCategory(category.name)}
                        className={[
                          "flex items-center justify-between rounded-md px-3 py-2.5 text-left text-[15px] transition-colors",
                          isActive
                            ? "bg-white/10 text-white"
                            : "text-white/90 hover:bg-white/5",
                        ].join(" ")}
                      >
                        <span className="font-medium">{category.name}</span>
                        <span className="text-sm text-white/45">
                          ({category.count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div>
              <div className="flex items-center gap-4">
                <h2 className="font-garamond text-2xl md:text-3xl">
                  {headingLabel}
                </h2>
                <div className="h-px flex-1 bg-white/15" />
              </div>

              <div className="mt-8">
                {restList.map((post, index) => (
                  <article key={post.slug} className="py-5">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="group block"
                      aria-label={`Read ${post.title}`}
                    >
                      <div className="grid grid-cols-1 gap-4 md:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs font-normal uppercase tracking-[0.18em] text-white/55">
                              {post.category}
                            </span>
                            <h3 className="min-w-0 flex-1 truncate text-base leading-[1.15] text-white transition-colors group-hover:text-white/90">
                              {post.title}
                            </h3>
                            <div className="flex flex-row items-center gap-2">
                              <div className="relative h-5 w-5 overflow-hidden rounded-full ring-1 ring-white/15">
                                <Image
                                  src={post.authorAvatar}
                                  alt={post.author}
                                  fill
                                  className="object-cover"
                                  sizes="20px"
                                />
                              </div>
                              <span className="text-sm whitespace-nowrap">
                                {post.author}
                              </span>
                            </div>
                            <time
                              dateTime={post.publishedAt}
                              className="text-sm text-white/55 md:justify-self-end"
                            >
                              {formatBlogDate(post.publishedAt)}
                            </time>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>

              {filteredPosts.length === 0 && (
                <p className="mt-6 text-sm text-white/60">
                  No posts found for this category.
                </p>
              )}
            </div>
          </section>
        </div>
        <div className="h-[40vh]"></div>

        <Footer />
      </main>
    </>
  );
}
