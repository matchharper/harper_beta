import TurndownService from "turndown";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

type OfficialJobRow = Pick<
  Database["public"]["Tables"]["official_jobs"]["Row"],
  | "ashby_job_posting_id"
  | "company_description_markdown"
  | "company_website_url"
  | "id"
  | "seniority"
  | "short_description"
  | "slug"
  | "vertical"
>;

type AshbyPublicJob = {
  address?: {
    postalAddress?: {
      addressCountry?: string | null;
      addressLocality?: string | null;
      addressRegion?: string | null;
    } | null;
  } | null;
  applyUrl?: string | null;
  compensation?: {
    compensationTierSummary?: string | null;
    scrapeableCompensationSalarySummary?: string | null;
  } | null;
  department?: string | null;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  employmentType?: string | null;
  id?: string | null;
  isListed?: boolean | null;
  isRemote?: boolean | null;
  jobUrl?: string | null;
  location?: string | null;
  publishedAt?: string | null;
  secondaryLocations?: Array<{ location?: string | null }> | null;
  shortDescription?: string | null;
  socialDescription?: string | null;
  social_description?: string | null;
  team?: string | null;
  title?: string | null;
  workplaceType?: string | null;
};

type AshbyPublicJobsResponse = {
  jobs?: AshbyPublicJob[];
};

export type AshbyOfficialJobsSyncSummary = {
  ashbyJobBoardName: string;
  fetched: number;
  inserted: number;
  skipped: number;
  unpublished: number;
  updated: number;
};

const DEFAULT_ASHBY_JOB_BOARD_NAME = "harper";
const ASHBY_PROVIDER_VERTICAL = "Ashby";
const COMPANY_SECTION_LABELS = ["Company"];
const COMPANY_DESCRIPTION_SECTION_LABELS = ["Company description"];
const HARPER_SECTION_LABELS = ["How Harper helps"];
const PROCESS_SECTION_LABELS = ["진행 과정", "진행과정"];
const SENIORITY_SECTION_LABELS = ["Seniority"];
const VERTICAL_SECTION_LABELS = ["Vertical"];

const turndown = new TurndownService({
  bulletListMarker: "-",
  headingStyle: "atx",
});

turndown.remove(["script", "style"]);

function normalizeOptionalString(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeExistingVertical(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  return normalized.toLowerCase() === ASHBY_PROVIDER_VERTICAL.toLowerCase()
    ? null
    : normalized;
}

function normalizeRequiredString(value: unknown, fallback: string) {
  return normalizeOptionalString(value) ?? fallback;
}

function normalizeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "ashby-job";
}

function htmlToMarkdown(html: string | null | undefined) {
  const normalizedHtml = String(html ?? "").trim();
  if (!normalizedHtml) return "";

  return turndown
    .turndown(normalizedHtml)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findSectionIndex(markdown: string, labels: string[]) {
  const indexes = labels
    .flatMap((label) => {
      const escapedLabel = escapeRegExp(label);
      return [
        markdown.search(
          new RegExp(
            `(^|\\n)\\s*\\*\\*\\s*${escapedLabel}\\s*:?\\s*\\*\\*\\s*:?`,
            "i"
          )
        ),
        markdown.search(
          new RegExp(`^\\s{0,3}#{1,6}\\s+${escapedLabel}\\s*:?\\s*$`, "im")
        ),
      ];
    })
    .filter((index) => index >= 0);

  return indexes.length > 0 ? Math.min(...indexes) : -1;
}

function minPositive(values: number[]) {
  const positiveValues = values.filter((value) => value >= 0);
  return positiveValues.length > 0 ? Math.min(...positiveValues) : -1;
}

function sliceSection(
  markdown: string,
  sectionIndex: number,
  boundaryIndexes: number[]
) {
  if (sectionIndex < 0) return "";

  const endIndex = minPositive(
    boundaryIndexes.filter((index) => index > sectionIndex)
  );
  return (
    endIndex >= 0
      ? markdown.slice(sectionIndex, endIndex)
      : markdown.slice(sectionIndex)
  ).trim();
}

function stripSectionHeading(markdown: string, labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  return markdown
    .replace(
      new RegExp(
        `^\\s*\\*\\*\\s*(?:${labelPattern})\\s*:?\\s*\\*\\*\\s*:?\\s*`,
        "i"
      ),
      ""
    )
    .replace(
      new RegExp(`^\\s{0,3}#{1,6}\\s*(?:${labelPattern})\\s*:?\\s*`, "i"),
      ""
    )
    .trim();
}

function normalizeSectionScalar(markdown: string) {
  const normalized = normalizeOptionalString(markdown);
  if (!normalized) return null;

  const value = normalized
    .split(/\n+/)
    .map((line) =>
      line
        .trim()
        .replace(/^[-*]\s+/, "")
        .replace(/^>\s*/, "")
        .replace(/^\*\*(.+)\*\*$/, "$1")
        .trim()
    )
    .filter(Boolean)
    .join(" / ");

  return normalizeOptionalString(value);
}

function splitDescription(markdown: string) {
  const companyNameIndex = findSectionIndex(markdown, COMPANY_SECTION_LABELS);
  const companyIndex = findSectionIndex(
    markdown,
    COMPANY_DESCRIPTION_SECTION_LABELS
  );
  const harperIndex = findSectionIndex(markdown, HARPER_SECTION_LABELS);
  const processIndex = findSectionIndex(markdown, PROCESS_SECTION_LABELS);
  const seniorityIndex = findSectionIndex(markdown, SENIORITY_SECTION_LABELS);
  const verticalIndex = findSectionIndex(markdown, VERTICAL_SECTION_LABELS);
  const boundaryIndexes = [
    companyNameIndex,
    companyIndex,
    harperIndex,
    processIndex,
    seniorityIndex,
    verticalIndex,
  ].filter((index) => index >= 0);
  const roleEndIndex = minPositive(boundaryIndexes);
  const roleDescriptionMarkdown =
    roleEndIndex >= 0 ? markdown.slice(0, roleEndIndex).trim() : markdown;

  const companyName = normalizeSectionScalar(
    stripSectionHeading(
      sliceSection(markdown, companyNameIndex, boundaryIndexes),
      COMPANY_SECTION_LABELS
    )
  );
  const seniority = normalizeSectionScalar(
    stripSectionHeading(
      sliceSection(markdown, seniorityIndex, boundaryIndexes),
      SENIORITY_SECTION_LABELS
    )
  );
  const vertical = normalizeSectionScalar(
    stripSectionHeading(
      sliceSection(markdown, verticalIndex, boundaryIndexes),
      VERTICAL_SECTION_LABELS
    )
  );

  return {
    companyName,
    roleDescriptionMarkdown,
    seniority,
    vertical,
  };
}

function parseCompanyName(rawTitle: string) {
  const title = rawTitle.trim();
  const separator = " at ";
  const index = title.toLowerCase().lastIndexOf(separator);
  if (index <= 0) return null;

  return normalizeOptionalString(title.slice(index + separator.length));
}

function normalizeLocation(job: AshbyPublicJob) {
  const locations = [
    normalizeOptionalString(job.location),
    ...(job.secondaryLocations ?? []).map((item) =>
      normalizeOptionalString(item.location)
    ),
  ].filter((value): value is string => Boolean(value));

  return locations.length > 0 ? locations.join(" / ") : "Remote";
}

function normalizeEmploymentType(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  if (normalized === "FullTime") return "Full-time";
  if (normalized === "PartTime") return "Part-time";
  if (normalized === "Intern") return "Internship";
  return normalized;
}

function getAshbyJobBoardName() {
  return (
    process.env.ASHBY_JOB_BOARD_NAME?.trim() || DEFAULT_ASHBY_JOB_BOARD_NAME
  );
}

async function fetchAshbyPublicJobs(jobBoardName: string) {
  const url = new URL(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
      jobBoardName
    )}`
  );
  url.searchParams.set("includeCompensation", "true");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Ashby job board fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as AshbyPublicJobsResponse;
  return (payload.jobs ?? []).filter((job) => job.isListed !== false);
}

async function fetchExistingOfficialJobs() {
  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select(
      "ashby_job_posting_id,company_description_markdown,company_website_url,id,seniority,short_description,slug,vertical"
    );

  if (error) {
    throw new Error(error.message ?? "Failed to load official jobs");
  }

  return (data ?? []) as OfficialJobRow[];
}

function buildUniqueSlug(args: {
  ashbyJobId: string;
  baseSlug: string;
  existingRows: OfficialJobRow[];
}) {
  const matchingRow = args.existingRows.find(
    (row) => row.ashby_job_posting_id === args.ashbyJobId
  );
  if (matchingRow?.slug) return matchingRow.slug;

  const rowWithBaseSlug = args.existingRows.find(
    (row) => row.slug === args.baseSlug
  );
  if (!rowWithBaseSlug || !rowWithBaseSlug.ashby_job_posting_id) {
    return args.baseSlug;
  }

  return normalizeSlug(`${args.baseSlug}-${args.ashbyJobId.slice(0, 8)}`);
}

function buildPayload(job: AshbyPublicJob, existingRows: OfficialJobRow[]) {
  const ashbyJobId = normalizeRequiredString(job.id, "");
  if (!ashbyJobId) return null;

  const roleTitle = normalizeRequiredString(job.title, "Untitled role");
  const descriptionMarkdown =
    htmlToMarkdown(job.descriptionHtml) ??
    normalizeOptionalString(job.descriptionPlain) ??
    "";
  const {
    companyName: companyNameFromDescription,
    roleDescriptionMarkdown,
    seniority,
    vertical,
  } = splitDescription(descriptionMarkdown);
  const companyName =
    companyNameFromDescription ?? parseCompanyName(roleTitle) ?? "";
  const baseSlug = normalizeSlug(`${companyName} ${roleTitle}`);
  const slug = buildUniqueSlug({ ashbyJobId, baseSlug, existingRows });
  const existingRow = existingRows.find(
    (row) => row.ashby_job_posting_id === ashbyJobId || row.slug === slug
  );

  return {
    ashbyJobId,
    payload: {
      ashby_job_posting_id: ashbyJobId,
      company_description_markdown:
        existingRow?.company_description_markdown ?? "",
      company_logo_url: null,
      company_name: companyName,
      company_website_url: normalizeOptionalString(
        existingRow?.company_website_url
      ),
      compensation: normalizeOptionalString(
        job.compensation?.compensationTierSummary ??
          job.compensation?.scrapeableCompensationSalarySummary
      ),
      display_order: 0,
      employment_type: normalizeEmploymentType(job.employmentType),
      is_published: true,
      location: normalizeLocation(job),
      published_at: normalizeOptionalString(job.publishedAt),
      role_description_markdown: roleDescriptionMarkdown || descriptionMarkdown,
      role_title: normalizeRequiredString(roleTitle, "Untitled role"),
      seniority: seniority ?? normalizeOptionalString(existingRow?.seniority),
      short_description:
        normalizeOptionalString(
          job.socialDescription ?? job.social_description
        ) ??
        normalizeOptionalString(job.shortDescription) ??
        normalizeOptionalString(existingRow?.short_description) ??
        "",
      slug,
      vertical:
        vertical ??
        normalizeExistingVertical(existingRow?.vertical) ??
        "",
    },
  };
}

export async function runAshbyOfficialJobsSync(options?: {
  unpublishMissing?: boolean;
}): Promise<AshbyOfficialJobsSyncSummary> {
  const ashbyJobBoardName = getAshbyJobBoardName();
  const [ashbyJobs, existingRows] = await Promise.all([
    fetchAshbyPublicJobs(ashbyJobBoardName),
    fetchExistingOfficialJobs(),
  ]);

  const summary: AshbyOfficialJobsSyncSummary = {
    ashbyJobBoardName,
    fetched: ashbyJobs.length,
    inserted: 0,
    skipped: 0,
    unpublished: 0,
    updated: 0,
  };
  const activeAshbyIds = new Set<string>();

  for (const ashbyJob of ashbyJobs) {
    const built = buildPayload(ashbyJob, existingRows);
    if (!built) {
      summary.skipped += 1;
      continue;
    }

    activeAshbyIds.add(built.ashbyJobId);
    const existingRow = existingRows.find(
      (row) =>
        row.ashby_job_posting_id === built.ashbyJobId ||
        (!row.ashby_job_posting_id && row.slug === built.payload.slug)
    );

    const query = existingRow
      ? supabaseServer
          .from("official_jobs")
          .update(built.payload)
          .eq("id", existingRow.id)
      : supabaseServer.from("official_jobs").insert(built.payload);

    const { data, error } = await query.select("id,slug").single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to sync Ashby job posting");
    }

    if (existingRow) {
      summary.updated += 1;
    } else {
      summary.inserted += 1;
      existingRows.push({
        ashby_job_posting_id: built.ashbyJobId,
        company_description_markdown:
          built.payload.company_description_markdown,
        company_website_url: built.payload.company_website_url,
        id: data.id,
        seniority: built.payload.seniority,
        short_description: built.payload.short_description,
        slug: data.slug,
        vertical: built.payload.vertical,
      });
    }
  }

  if (options?.unpublishMissing ?? true) {
    const missingRows = existingRows.filter(
      (row) =>
        row.ashby_job_posting_id &&
        !activeAshbyIds.has(row.ashby_job_posting_id)
    );

    for (const row of missingRows) {
      const { error } = await supabaseServer
        .from("official_jobs")
        .update({
          is_published: false,
          published_at: null,
        })
        .eq("id", row.id);

      if (error) {
        throw new Error(error.message ?? "Failed to unpublish missing job");
      }
      summary.unpublished += 1;
    }
  }

  return summary;
}
