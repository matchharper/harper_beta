import type { GetServerSideProps } from "next";
import {
  getCompanyLanguageEntryUrl,
  getCompanyLocaleUrl,
} from "@/lib/companyLandingSeo";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";

const SITE_URL = getConfiguredPublicSiteUrl();

export type SitemapEntry = {
  loc: string;
  alternates?: Array<{
    href: string;
    hrefLang: "en" | "ko" | "x-default";
  }>;
  images?: Array<{
    loc: string;
    title?: string;
  }>;
  lastmod?: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const children = [
        `<loc>${escapeXml(entry.loc)}</loc>`,
        ...(entry.alternates ?? []).map(
          (alternate) =>
            `<xhtml:link rel="alternate" hreflang="${alternate.hrefLang}" href="${escapeXml(alternate.href)}"/>`
        ),
        ...(entry.images ?? []).map(
          (image) =>
            `<image:image><image:loc>${escapeXml(image.loc)}</image:loc>${
              image.title
                ? `<image:title>${escapeXml(image.title)}</image:title>`
                : ""
            }</image:image>`
        ),
        entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "",
      ]
        .filter(Boolean)
        .join("");

      return `<url>${children}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
}

export function buildStaticSitemapEntries(): SitemapEntry[] {
  const landingAlternates: SitemapEntry["alternates"] = [
    { href: `${SITE_URL}/en`, hrefLang: "en" },
    { href: `${SITE_URL}/ko`, hrefLang: "ko" },
    { href: `${SITE_URL}/`, hrefLang: "x-default" },
  ];
  const companyAlternates: SitemapEntry["alternates"] = [
    { href: getCompanyLocaleUrl("en"), hrefLang: "en" },
    { href: getCompanyLocaleUrl("ko"), hrefLang: "ko" },
    { href: getCompanyLanguageEntryUrl(), hrefLang: "x-default" },
  ];

  return [
    {
      loc: `${SITE_URL}/`,
      alternates: landingAlternates,
    },
    {
      loc: `${SITE_URL}/ko`,
      alternates: landingAlternates,
    },
    {
      loc: `${SITE_URL}/en`,
      alternates: landingAlternates,
    },
    {
      loc: getCompanyLocaleUrl("ko"),
      alternates: companyAlternates,
    },
    {
      loc: getCompanyLocaleUrl("en"),
      alternates: companyAlternates,
    },
    {
      loc: `${SITE_URL}/blog`,
    },
    {
      loc: `${SITE_URL}/about`,
    },
    {
      loc: `${SITE_URL}/jobs`,
    },
    {
      loc: `${SITE_URL}/refer`,
    },
  ];
}

function toSitemapDateTime(value: string | null | undefined) {
  const timestamp = Date.parse(String(value ?? ""));
  if (Number.isNaN(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const [{ getPublishedPostSitemapRows }, { getPublicOfficialJobs }] =
    await Promise.all([
      import("@/lib/blog.server"),
      import("@/lib/officialJobs/server"),
    ]);
  const [posts, jobs] = await Promise.all([
    getPublishedPostSitemapRows(),
    getPublicOfficialJobs(),
  ]);
  const staticEntries = buildStaticSitemapEntries();
  const newestPostUpdatedAt = posts.reduce<string | undefined>(
    (newest, post) =>
      !newest || Date.parse(post.updatedAt) > Date.parse(newest)
        ? post.updatedAt
        : newest,
    undefined
  );
  const blogEntry = staticEntries.find(
    (entry) => entry.loc === `${SITE_URL}/blog`
  );
  if (blogEntry) blogEntry.lastmod = toSitemapDateTime(newestPostUpdatedAt);

  const postEntries: SitemapEntry[] = posts.map((post) => ({
    images: post.thumbnail
      ? [
          {
            loc: /^https?:\/\//i.test(post.thumbnail)
              ? post.thumbnail
              : `${SITE_URL}${post.thumbnail.startsWith("/") ? "" : "/"}${post.thumbnail}`,
            title: post.title,
          },
        ]
      : undefined,
    loc: `${SITE_URL}/blog/${post.slug}`,
    lastmod: toSitemapDateTime(post.updatedAt),
  }));

  const jobEntries: SitemapEntry[] = jobs.map((job) => ({
    loc: `${SITE_URL}/jobs/${encodeURIComponent(job.slug)}`,
    lastmod:
      toSitemapDateTime(job.updatedAt) ?? toSitemapDateTime(job.publishedAt),
  }));

  const sitemap = buildSitemapXml([
    ...staticEntries,
    ...postEntries,
    ...jobEntries,
  ]);
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=900, stale-while-revalidate=86400"
  );
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
};

export default function SitemapXmlPage() {
  return null;
}
