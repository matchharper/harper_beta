import type { OfficialJob } from "@/lib/officialJobs";
import {
  formatOfficialJobsCopy,
  getOfficialJobsCopy,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://matchharper.com"
)
  .trim()
  .replace(/\/$/, "");

export const OFFICIAL_JOBS_LIST_TITLE =
  getOfficialJobsCopy("ko").seo.listTitle;
export const OFFICIAL_JOBS_LIST_DESCRIPTION =
  getOfficialJobsCopy("ko").seo.listDescription;
export const OFFICIAL_JOBS_CANONICAL_URL = `${SITE_URL}/jobs`;
export const OFFICIAL_JOBS_OG_IMAGE_URL = `${SITE_URL}/images/usemain.png`;

function stripMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/^-+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toText(value: string | null | undefined) {
  return stripMarkdown(String(value ?? ""));
}

function cleanUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T;
}

export function toAbsoluteUrl(url: string | null | undefined) {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${SITE_URL}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

export function toIsoDateTime(value: string | null | undefined) {
  const timestamp = Date.parse(String(value ?? ""));
  if (Number.isNaN(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

export function buildOfficialJobCanonicalUrl(slug: string) {
  return `${OFFICIAL_JOBS_CANONICAL_URL}/${encodeURIComponent(slug)}`;
}

export function getOfficialJobsListSeo(locale: OfficialJobsLocale) {
  return getOfficialJobsCopy(locale).seo;
}

export function buildOfficialJobTitle(
  job: OfficialJob,
  locale: OfficialJobsLocale = "ko"
) {
  return formatOfficialJobsCopy(getOfficialJobsCopy(locale).seo.detailTitle, {
    company: job.companyName,
    role: job.roleTitle,
  });
}

export function buildOfficialJobDescription(
  job: OfficialJob,
  locale: OfficialJobsLocale = "ko"
) {
  return (
    toText(job.shortDescription) ||
    formatOfficialJobsCopy(
      getOfficialJobsCopy(locale).seo.detailDescriptionFallback,
      {
        company: job.companyName,
        role: job.roleTitle,
      }
    )
  );
}

function toSchemaEmploymentType(value: string | null) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  const employmentTypeByValue: Record<string, string> = {
    full_time: "FULL_TIME",
    part_time: "PART_TIME",
    contract: "CONTRACTOR",
    contractor: "CONTRACTOR",
    internship: "INTERN",
    intern: "INTERN",
    temporary: "TEMPORARY",
    volunteer: "VOLUNTEER",
    per_diem: "PER_DIEM",
    fractional: "OTHER",
  };

  return employmentTypeByValue[normalized];
}

function buildJobLocation(location: string) {
  const locationText = toText(location);
  if (!locationText) return undefined;

  return {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: locationText,
      addressCountry: locationText.toLowerCase().includes("korea")
        ? "KR"
        : undefined,
    },
  };
}

export function buildOfficialJobsCollectionStructuredData(
  jobs: OfficialJob[],
  locale: OfficialJobsLocale = "ko"
) {
  const copy = getOfficialJobsCopy(locale);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: copy.seo.listTitle,
    description: copy.seo.listDescription,
    url: OFFICIAL_JOBS_CANONICAL_URL,
    inLanguage: copy.seo.inLanguage,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: jobs.map((job, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${job.roleTitle} at ${job.companyName}`,
        url: buildOfficialJobCanonicalUrl(job.slug),
      })),
    },
  };
}

export function buildOfficialJobStructuredData(
  job: OfficialJob,
  locale: OfficialJobsLocale = "ko"
) {
  const canonicalUrl = buildOfficialJobCanonicalUrl(job.slug);
  const copy = getOfficialJobsCopy(locale);
  const description = [
    buildOfficialJobDescription(job, locale),
    toText(job.roleDescriptionMarkdown),
  ]
    .filter(Boolean)
    .join(" ");
  const datePosted =
    toIsoDateTime(job.publishedAt) ?? toIsoDateTime(job.updatedAt);
  const dateModified = toIsoDateTime(job.updatedAt) ?? datePosted;
  const logoUrl = toAbsoluteUrl(job.companyLogoUrl);

  const jobPosting = cleanUndefined({
    "@type": "JobPosting",
    "@id": `${canonicalUrl}#jobposting`,
    title: job.roleTitle,
    description,
    url: canonicalUrl,
    datePosted,
    dateModified,
    employmentType: toSchemaEmploymentType(job.employmentType),
    industry: toText(job.vertical) || undefined,
    occupationalCategory: toText(job.vertical) || undefined,
    identifier: {
      "@type": "PropertyValue",
      name: copy.seo.structuredDataName,
      value: job.ashbyJobPostingId ?? job.id,
    },
    hiringOrganization: cleanUndefined({
      "@type": "Organization",
      name: job.companyName,
      sameAs: toAbsoluteUrl(job.companyWebsiteUrl),
      logo: logoUrl,
    }),
    jobLocation: buildJobLocation(job.location),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
  });

  const breadcrumbs = {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Jobs",
        item: OFFICIAL_JOBS_CANONICAL_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: `${job.roleTitle} at ${job.companyName}`,
        item: canonicalUrl,
      },
    ],
  };

  return {
    "@context": "https://schema.org",
    "@graph": [jobPosting, breadcrumbs],
  };
}
