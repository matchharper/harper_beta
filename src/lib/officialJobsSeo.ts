import type { OfficialJob } from "@/lib/officialJobs";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://matchharper.com"
)
  .trim()
  .replace(/\/$/, "");

export const OFFICIAL_JOBS_LIST_TITLE = "Jobs Harper Is Watching | Harper";
export const OFFICIAL_JOBS_LIST_DESCRIPTION =
  "Harper가 먼저 살펴보는 역할을 보고, 관심 있는 기회가 있으면 대화로 더 좁혀보세요.";
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

export function buildOfficialJobTitle(job: OfficialJob) {
  return `${job.roleTitle} at ${job.companyName} | Harper Jobs`;
}

export function buildOfficialJobDescription(job: OfficialJob) {
  return (
    toText(job.shortDescription) ||
    `${job.companyName}의 ${job.roleTitle} 포지션을 Harper를 통해 확인하고 지원하세요.`
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

export function buildOfficialJobsCollectionStructuredData(jobs: OfficialJob[]) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: OFFICIAL_JOBS_LIST_TITLE,
    description: OFFICIAL_JOBS_LIST_DESCRIPTION,
    url: OFFICIAL_JOBS_CANONICAL_URL,
    inLanguage: "ko-KR",
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

export function buildOfficialJobStructuredData(job: OfficialJob) {
  const canonicalUrl = buildOfficialJobCanonicalUrl(job.slug);
  const description = [
    buildOfficialJobDescription(job),
    toText(job.roleDescriptionMarkdown),
    toText(job.companyDescriptionMarkdown),
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
      name: "Harper official job",
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
