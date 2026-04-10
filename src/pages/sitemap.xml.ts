import type { GetServerSideProps } from "next";
import { toIsoDate } from "@/lib/blog";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://matchharper.com")
  .trim()
  .replace(/\/$/, "");

type SitemapEntry = {
  loc: string;
  changefreq?: "daily" | "weekly" | "monthly" | "yearly";
  priority?: number;
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

function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const children = [
        `<loc>${escapeXml(entry.loc)}</loc>`,
        entry.changefreq ? `<changefreq>${entry.changefreq}</changefreq>` : "",
        typeof entry.priority === "number"
          ? `<priority>${entry.priority.toFixed(1)}</priority>`
          : "",
        entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "",
      ]
        .filter(Boolean)
        .join("");

      return `<url>${children}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const { getAllPostsMeta } = await import("@/lib/blog.server");
  const posts = getAllPostsMeta();

  const staticEntries: SitemapEntry[] = [
    {
      loc: `${SITE_URL}/`,
      changefreq: "weekly",
      priority: 1.0,
    },
    {
      loc: `${SITE_URL}/search`,
      changefreq: "weekly",
      priority: 0.9,
    },
    {
      loc: `${SITE_URL}/blog`,
      changefreq: "weekly",
      priority: 0.9,
    },
  ];

  const postEntries: SitemapEntry[] = posts.map((post) => ({
    loc: `${SITE_URL}/blog/${post.slug}`,
    changefreq: "monthly",
    priority: 0.7,
    lastmod: toIsoDate(post.updatedAt),
  }));

  const sitemap = buildSitemapXml([...staticEntries, ...postEntries]);
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
};

export default function SitemapXmlPage() {
  return null;
}
