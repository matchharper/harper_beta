import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import type { ExaContentsClient } from "@/lib/tools/exaClient";

const MAX_URL_LENGTH = 2_048;
const MAX_REMOTE_BODY_CHARS = 2_000_000;
const MAX_DESCRIPTION_CHARS = 40_000;
const MAX_DESCRIPTION_SUMMARY_CHARS = 4_000;
const DIRECT_FETCH_TIMEOUT_MS = 8_000;
const EXA_CONTENT_MAX_AGE_HOURS = 24;
const EXA_EMPLOYMENT_TYPES = new Set([
  "full_time",
  "part_time",
  "contract",
  "internship",
]);

const EXA_JOB_POSTING_SUMMARY_QUERY = [
  "Extract only explicit facts for the single job opening at this URL.",
  "Inspect both the compact job-info metadata near the title and the full posting body; metadata can contain location, salary, and employment type that are not repeated in the body.",
  "Use the visible job heading as roleTitle rather than the browser or document title, and preserve the exact hiring-company name, geographic location, and salary text.",
  "A displayed city is a location but does not by itself prove onsite work.",
  "Return salary only when the posting itself explicitly prints it; otherwise return an empty string.",
  "Produce a comprehensive deduplicated jobDescription that keeps all substantive role sections once and removes navigation, footer, cookies, application forms, legal boilerplate, site chrome, and repeated blocks.",
  "Produce a separate factual 3-to-6-sentence summary in the posting language.",
  "Never infer, calculate, normalize, or enrich missing facts.",
].join(" ");

const EXA_JOB_POSTING_SUMMARY_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Structured job posting",
  type: "object",
  additionalProperties: false,
  properties: {
    isJobPosting: {
      type: "boolean",
      description:
        "True only when this page describes one specific job opening.",
    },
    roleTitle: {
      type: "string",
      description:
        "Exact role-title heading for this opening, preserving seniority, punctuation, and qualifiers. Use the job heading, not the browser or document title. Never prepend the company or site name and a separator unless that prefix is part of the job heading itself. Empty if absent.",
    },
    hiringCompany: {
      type: "string",
      description:
        "Exact displayed hiring organization name, never a job board or platform; empty if absent.",
    },
    salaryRange: {
      type: "string",
      description:
        "Compensation copied exactly from the posting metadata or body, including currency and period as shown. Never calculate, normalize, estimate, or infer. Empty when no compensation amount is explicitly printed.",
    },
    employmentTypes: {
      type: "array",
      items: {
        type: "string",
        enum: ["full_time", "part_time", "contract", "internship"],
      },
      description:
        "Employment types normalized only from explicit posting metadata or body; empty array if absent.",
    },
    jobLocation: {
      type: "string",
      description:
        "Exact geographic job location printed in the posting metadata, header, or body, including city, region, country, or Remote as shown. Empty only when no location is explicitly printed.",
    },
    workArrangement: {
      type: "string",
      enum: ["remote", "hybrid", "onsite", ""],
      description:
        "Work mode normalized only from explicit remote, hybrid, or onsite language. Do not infer onsite from a city or commuting benefit. Empty when absent or ambiguous.",
    },
    jobDescription: {
      type: "string",
      description:
        "Comprehensive clean role-description content. Keep all available substantive sections once: overview, responsibilities, qualifications, technologies, compensation, and benefits. Preserve headings and bullets as readable plain text. Remove navigation, headers, footers, cookies, site chrome, and repeated copies. Do not summarize or add facts. Empty when unavailable.",
    },
    roleSummary: {
      type: "string",
      description:
        "Factual summary in the posting language, exactly 3 to 6 complete sentences, covering role mission, responsibilities, important qualifications or stack, and explicit working conditions. Do not judge candidate fit or infer missing facts. Empty if content is insufficient.",
    },
  },
  required: [
    "isJobPosting",
    "roleTitle",
    "hiringCompany",
    "salaryRange",
    "employmentTypes",
    "jobLocation",
    "workArrangement",
    "jobDescription",
    "roleSummary",
  ],
} as const;

const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^mc_cid$/i,
  /^mc_eid$/i,
  /^gh_src$/i,
  /^lever-source$/i,
  /^source$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^trackingId$/i,
];

export type CareerJobProvider =
  | "ashby"
  | "greenhouse"
  | "jumpit"
  | "lever"
  | "linkedin"
  | "wanted"
  | "workday"
  | "other";

export type CareerJobUrlIdentity = {
  canonicalUrl: string;
  provider: CareerJobProvider;
  providerCompanyId: string | null;
  providerCompanyUrl: string | null;
  providerJobId: string | null;
  roleUrlVariants: string[];
  userSubmittedSourceJobId: string;
};

export type CareerJobPostingDraft = CareerJobUrlIdentity & {
  companyLogoUrl: string | null;
  companyName: string;
  description: string | null;
  descriptionSummary: string | null;
  employmentTypes: string[];
  extractedBy:
    | "ashby_jsonld"
    | "exa_summary"
    | "greenhouse_api"
    | "jumpit_html"
    | "lever_jsonld"
    | "lever_api"
    | "wanted_jsonld"
    | "manual";
  location: string | null;
  salaryRange: string | null;
  title: string;
  workMode: "hybrid" | "onsite" | "remote" | null;
};

export type CareerJobPostingManualFields = {
  companyName?: string | null;
  title?: string | null;
};

type FetchCareerJobPostingArgs = {
  exa?: ExaContentsClient;
  fetcher?: typeof fetch;
  manual?: CareerJobPostingManualFields;
  url: string;
};

type JsonRecord = Record<string, unknown>;

const turndown = new TurndownService({
  bulletListMarker: "-",
  headingStyle: "atx",
});

turndown.remove(["script", "style", "noscript", "iframe"]);

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function cleanText(value: unknown, maxLength = 20_000) {
  const text =
    typeof value === "string"
      ? value
          .replace(/\u0000/g, "")
          .replace(/\r/g, "")
          .trim()
      : "";
  return text ? text.slice(0, maxLength) : "";
}

function optionalText(value: unknown, maxLength?: number) {
  return cleanText(value, maxLength) || null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function isLinkedinHost(hostname: string) {
  return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
}

function normalizedHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function stripTrackingParams(url: URL) {
  for (const key of Array.from(url.searchParams.keys())) {
    if (TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key))) {
      url.searchParams.delete(key);
    }
  }
}

function stableUrlSourceId(url: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `url:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function workdayIdentity(url: URL) {
  const host = normalizedHost(url.hostname);
  if (!host.endsWith(".myworkdayjobs.com")) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const jobIndex = segments.findIndex(
    (segment) => segment.toLowerCase() === "job"
  );
  const site = jobIndex > 0 ? segments[jobIndex - 1] : null;
  const finalSegment = segments.at(-1) ?? "";
  const providerJobId = optionalText(
    finalSegment.match(/_([^_/]+)$/)?.[1],
    240
  );
  const tenant = host.split(".")[0] ?? "";
  return {
    providerCompanyId: site ? `${tenant}:${site}`.toLowerCase() : tenant,
    providerCompanyUrl: site
      ? `https://${host}/${segments.slice(0, jobIndex).join("/")}/${site}`
      : `https://${host}`,
    providerJobId,
  };
}

export function parseCareerJobUrl(rawUrl: string): CareerJobUrlIdentity {
  const raw = cleanText(rawUrl, MAX_URL_LENGTH + 1);
  if (!raw || raw.length > MAX_URL_LENGTH) {
    throw new Error("invalid_job_url");
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) {
    throw new Error("invalid_job_url");
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("invalid_job_url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("invalid_job_url");
  }
  if (url.username || url.password || !url.hostname) {
    throw new Error("invalid_job_url");
  }

  url.protocol = "https:";
  url.hash = "";
  stripTrackingParams(url);
  url.hostname = normalizedHost(url.hostname);
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");

  const host = url.hostname;
  const segments = url.pathname.split("/").filter(Boolean);
  let provider: CareerJobProvider = "other";
  let providerCompanyId: string | null = null;
  let providerCompanyUrl: string | null = null;
  let providerJobId: string | null = null;

  if (
    (host === "job-boards.greenhouse.io" || host === "boards.greenhouse.io") &&
    segments.length >= 3 &&
    segments[1]?.toLowerCase() === "jobs"
  ) {
    provider = "greenhouse";
    providerCompanyId = cleanText(segments[0], 240).toLowerCase();
    providerJobId = optionalText(segments[2], 240);
    providerCompanyUrl = `https://job-boards.greenhouse.io/${segments[0]}`;
    url.hostname = "job-boards.greenhouse.io";
    url.pathname = `/${segments[0]}/jobs/${segments[2]}`;
    url.search = "";
  } else if (
    (host === "jobs.lever.co" || host === "jobs.eu.lever.co") &&
    segments.length >= 2
  ) {
    provider = "lever";
    providerCompanyId = cleanText(segments[0], 240).toLowerCase();
    providerJobId = optionalText(segments[1], 240);
    providerCompanyUrl = `https://${host}/${segments[0]}`;
    url.pathname = `/${segments[0]}/${segments[1]}`;
    url.search = "";
  } else if (host === "jobs.ashbyhq.com" && segments.length >= 2) {
    provider = "ashby";
    providerCompanyId = cleanText(segments[0], 240).toLowerCase();
    providerJobId = optionalText(segments[1], 240);
    providerCompanyUrl = `https://jobs.ashbyhq.com/${segments[0]}`;
    url.pathname = `/${segments[0]}/${segments[1]}`;
    url.search = "";
  } else if (
    host === "wanted.co.kr" &&
    segments[0]?.toLowerCase() === "wd" &&
    /^\d+$/.test(segments[1] ?? "")
  ) {
    provider = "wanted";
    providerJobId = segments[1];
    url.pathname = `/wd/${segments[1]}`;
    url.search = "";
  } else if (
    host === "jumpit.saramin.co.kr" &&
    segments[0]?.toLowerCase() === "position" &&
    /^\d+$/.test(segments[1] ?? "")
  ) {
    provider = "jumpit";
    providerJobId = segments[1];
    url.pathname = `/position/${segments[1]}`;
    url.search = "";
  } else if (isLinkedinHost(host)) {
    provider = "linkedin";
    const currentJobId = url.searchParams.get("currentJobId")?.trim();
    const pathJobId =
      segments[0]?.toLowerCase() === "jobs" &&
      segments[1]?.toLowerCase() === "view"
        ? segments[2]
        : null;
    providerJobId = optionalText(
      currentJobId && /^\d+$/.test(currentJobId) ? currentJobId : pathJobId,
      240
    );
    if (providerJobId) {
      url.pathname = `/jobs/view/${providerJobId}`;
      url.search = "";
    }
  } else {
    const workday = workdayIdentity(url);
    if (workday) {
      provider = "workday";
      providerCompanyId = workday.providerCompanyId;
      providerCompanyUrl = workday.providerCompanyUrl;
      providerJobId = workday.providerJobId;
    }
  }

  const canonicalUrl = url.toString();
  const alternateUrl = new URL(canonicalUrl);
  if (alternateUrl.pathname.endsWith("/") && alternateUrl.pathname !== "/") {
    alternateUrl.pathname = alternateUrl.pathname.replace(/\/+$/, "");
  } else if (alternateUrl.pathname !== "/") {
    alternateUrl.pathname = `${alternateUrl.pathname}/`;
  }
  const providerScopedJobId =
    providerJobId && provider !== "other"
      ? `${provider}:${providerJobId}`
      : stableUrlSourceId(canonicalUrl);
  const providerRoleUrlVariants =
    provider === "greenhouse" && providerCompanyId && providerJobId
      ? [
          `https://job-boards.greenhouse.io/${providerCompanyId}/jobs/${providerJobId}`,
          `https://boards.greenhouse.io/${providerCompanyId}/jobs/${providerJobId}`,
        ]
      : [];

  return {
    canonicalUrl,
    provider,
    providerCompanyId,
    providerCompanyUrl,
    providerJobId,
    roleUrlVariants: uniqueStrings([
      raw,
      withProtocol,
      canonicalUrl,
      alternateUrl.toString(),
      ...providerRoleUrlVariants,
    ]),
    userSubmittedSourceJobId: providerScopedJobId,
  };
}

function isJobPostingType(value: unknown) {
  return (Array.isArray(value) ? value : [value]).some(
    (item) => cleanText(item, 80).toLowerCase() === "jobposting"
  );
}

function findJobPosting(value: unknown): JsonRecord | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findJobPosting(item);
      if (result) return result;
    }
    return null;
  }

  const candidate = record(value);
  if (!candidate) return null;
  if (isJobPostingType(candidate["@type"])) return candidate;
  return findJobPosting(candidate["@graph"]);
}

export function extractJobPostingJsonLd(html: string) {
  const fragment = JSDOM.fragment(html);
  const scripts = Array.from(
    fragment.querySelectorAll('script[type="application/ld+json"]')
  );
  for (const script of scripts) {
    try {
      const posting = findJobPosting(
        JSON.parse(script.textContent?.trim() ?? "")
      );
      if (posting) return posting;
    } catch {
      // Continue until a valid JobPosting block is found.
    }
  }
  return null;
}

function htmlToMarkdown(value: unknown) {
  const html = cleanText(value, MAX_REMOTE_BODY_CHARS);
  if (!html) return null;
  return optionalText(turndown.turndown(html), MAX_DESCRIPTION_CHARS);
}

function decodeHtmlEntities(value: unknown) {
  const input = cleanText(value, MAX_REMOTE_BODY_CHARS);
  if (!input) return "";
  const fragment = JSDOM.fragment(`<textarea>${input}</textarea>`);
  return fragment.querySelector("textarea")?.textContent ?? input;
}

function normalizeEmploymentTypes(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  const normalized: string[] = [];
  for (const item of values) {
    const text = cleanText(item, 120)
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (!text) continue;
    const resolved =
      text === "fulltime" || text === "full_time"
        ? "full_time"
        : text === "parttime" || text === "part_time"
          ? "part_time"
          : text.includes("intern")
            ? "internship"
            : text.includes("contract") || text.includes("temporary")
              ? "contract"
              : text;
    if (!normalized.includes(resolved)) normalized.push(resolved);
  }
  return normalized.slice(0, 8);
}

function validateExaEmploymentTypes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value.map((item) => {
      const text = cleanText(item, 80);
      return EXA_EMPLOYMENT_TYPES.has(text) ? text : null;
    })
  );
}

function extractLocation(value: unknown) {
  const locations = Array.isArray(value) ? value : [value];
  const names: string[] = [];
  for (const locationValue of locations) {
    const location = record(locationValue);
    if (!location) continue;
    const address = record(location.address);
    const name = cleanText(location.name, 300);
    const addressParts = address
      ? [
          cleanText(address.addressLocality, 160),
          cleanText(address.addressRegion, 160),
          cleanText(address.addressCountry, 160),
        ].filter(Boolean)
      : [];
    const result = name || addressParts.join(", ");
    if (result && !names.includes(result)) names.push(result);
  }
  return names.join(" · ") || null;
}

function salaryRangeFromJsonLd(posting: JsonRecord) {
  const baseSalary = record(posting.baseSalary);
  const quantitative = record(baseSalary?.value);
  const min = Number(quantitative?.minValue);
  const max = Number(quantitative?.maxValue);
  const currency = optionalText(baseSalary?.currency, 16);
  const period =
    optionalText(quantitative?.unitText, 40)?.toLowerCase() ?? null;
  return Number.isFinite(min) || Number.isFinite(max)
    ? [
        currency,
        Number.isFinite(min) ? min.toLocaleString("en-US") : null,
        Number.isFinite(max) ? `–${max.toLocaleString("en-US")}` : null,
        period ? `/${period}` : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null;
}

function draftFromJsonLd(
  identity: CareerJobUrlIdentity,
  posting: JsonRecord,
  extractedBy: CareerJobPostingDraft["extractedBy"]
): CareerJobPostingDraft {
  const organization = record(posting.hiringOrganization);
  const location = extractLocation(posting.jobLocation);
  const remote =
    cleanText(posting.jobLocationType, 80).toLowerCase() === "telecommute";
  return {
    ...identity,
    companyLogoUrl: optionalText(organization?.logo, MAX_URL_LENGTH),
    companyName: cleanText(organization?.name, 240),
    description: htmlToMarkdown(posting.description),
    descriptionSummary: null,
    employmentTypes: normalizeEmploymentTypes(posting.employmentType),
    extractedBy,
    location:
      location ??
      (remote
        ? (extractLocation(posting.applicantLocationRequirements) ?? "Remote")
        : null),
    salaryRange: salaryRangeFromJsonLd(posting),
    title: cleanText(posting.title, 500),
    workMode:
      remote || location?.toLowerCase().includes("remote") ? "remote" : null,
  };
}

async function fetchJson(fetcher: typeof fetch, url: string) {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "HarperJobPostingReader/1.0",
    },
    redirect: "error",
    signal: AbortSignal.timeout(DIRECT_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`job_fetch_failed:${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_REMOTE_BODY_CHARS) {
    throw new Error("job_page_too_large");
  }
  const text = await response.text();
  if (text.length > MAX_REMOTE_BODY_CHARS)
    throw new Error("job_page_too_large");
  return JSON.parse(text) as JsonRecord;
}

async function fetchHtml(fetcher: typeof fetch, url: string) {
  const response = await fetcher(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "HarperJobPostingReader/1.0",
    },
    redirect: "error",
    signal: AbortSignal.timeout(DIRECT_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`job_fetch_failed:${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.includes("text/html")) {
    throw new Error("job_page_not_html");
  }
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_REMOTE_BODY_CHARS) {
    throw new Error("job_page_too_large");
  }
  const text = await response.text();
  if (text.length > MAX_REMOTE_BODY_CHARS)
    throw new Error("job_page_too_large");
  return text;
}

async function fetchGreenhousePosting(
  identity: CareerJobUrlIdentity,
  fetcher: typeof fetch
) {
  if (!identity.providerCompanyId || !identity.providerJobId) return null;
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    identity.providerCompanyId
  )}/jobs/${encodeURIComponent(identity.providerJobId)}?content=true`;
  const posting = await fetchJson(fetcher, url);
  const description = htmlToMarkdown(decodeHtmlEntities(posting.content));
  const location = optionalText(record(posting.location)?.name, 500);
  const rawCompanyName = cleanText(posting.company_name, 240);
  // Greenhouse uses this fixed suffix for some customer board labels; it is
  // board chrome rather than part of the hiring organization's legal name.
  const companyName =
    rawCompanyName.replace(/\s+External Website$/i, "").trim() ||
    rawCompanyName;
  return {
    ...identity,
    companyLogoUrl: null,
    companyName,
    description,
    descriptionSummary: null,
    employmentTypes: [],
    extractedBy: "greenhouse_api" as const,
    location,
    salaryRange: null,
    title: cleanText(posting.title, 500),
    workMode: location?.toLowerCase().includes("remote")
      ? ("remote" as const)
      : null,
  };
}

async function fetchLeverPosting(
  identity: CareerJobUrlIdentity,
  fetcher: typeof fetch
): Promise<CareerJobPostingDraft | null> {
  if (!identity.providerCompanyId || !identity.providerJobId) return null;
  try {
    const html = await fetchHtml(fetcher, identity.canonicalUrl);
    const posting = extractJobPostingJsonLd(html);
    if (posting) return draftFromJsonLd(identity, posting, "lever_jsonld");
  } catch {
    // The public API remains a deterministic fallback if the rendered page fails.
  }

  const apiHost = identity.canonicalUrl.includes("jobs.eu.lever.co")
    ? "api.eu.lever.co"
    : "api.lever.co";
  const posting = await fetchJson(
    fetcher,
    `https://${apiHost}/v0/postings/${encodeURIComponent(
      identity.providerCompanyId
    )}/${encodeURIComponent(identity.providerJobId)}?mode=json`
  );
  const categories = record(posting.categories);
  const location = optionalText(categories?.location, 500);
  const commitment = optionalText(categories?.commitment, 120);
  const workplaceType = cleanText(posting.workplaceType, 80).toLowerCase();
  return {
    ...identity,
    companyLogoUrl: null,
    companyName: cleanText(posting.company, 240) || identity.providerCompanyId,
    description:
      optionalText(posting.descriptionPlain, MAX_DESCRIPTION_CHARS) ??
      htmlToMarkdown(posting.description),
    descriptionSummary: null,
    employmentTypes: normalizeEmploymentTypes(commitment),
    extractedBy: "lever_api" as const,
    location,
    salaryRange: null,
    title: cleanText(posting.text, 500),
    workMode:
      workplaceType === "remote" || location?.toLowerCase().includes("remote")
        ? "remote"
        : workplaceType === "hybrid"
          ? "hybrid"
          : workplaceType === "onsite"
            ? "onsite"
            : null,
  };
}

async function fetchAshbyPosting(
  identity: CareerJobUrlIdentity,
  fetcher: typeof fetch
) {
  const html = await fetchHtml(fetcher, identity.canonicalUrl);
  const posting = extractJobPostingJsonLd(html);
  return posting ? draftFromJsonLd(identity, posting, "ashby_jsonld") : null;
}

async function fetchWantedPosting(
  identity: CareerJobUrlIdentity,
  fetcher: typeof fetch
) {
  if (!identity.providerJobId) return null;
  const html = await fetchHtml(
    fetcher,
    `https://www.wanted.co.kr/wd/${encodeURIComponent(identity.providerJobId)}`
  );
  const posting = extractJobPostingJsonLd(html);
  return posting ? draftFromJsonLd(identity, posting, "wanted_jsonld") : null;
}

async function fetchJumpitPosting(
  identity: CareerJobUrlIdentity,
  fetcher: typeof fetch
): Promise<CareerJobPostingDraft | null> {
  const html = await fetchHtml(fetcher, identity.canonicalUrl);
  const fragment = JSDOM.fragment(html);
  const main = fragment.querySelector("main");
  const companyName = cleanText(
    main?.querySelector('a[href^="/company/"] span')?.textContent,
    240
  );
  const title = cleanText(main?.querySelector("h1")?.textContent, 500);
  if (!companyName || !title) return null;

  return {
    ...identity,
    companyLogoUrl: optionalText(
      fragment
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content"),
      MAX_URL_LENGTH
    ),
    companyName,
    description: htmlToMarkdown(main?.innerHTML),
    descriptionSummary: null,
    employmentTypes: [],
    extractedBy: "jumpit_html",
    location: null,
    salaryRange: null,
    title,
    workMode: null,
  };
}

function mergeManualFields(
  draft: CareerJobPostingDraft,
  manual?: CareerJobPostingManualFields
) {
  return {
    ...draft,
    companyName: cleanText(manual?.companyName, 240) || draft.companyName,
    title: cleanText(manual?.title, 500) || draft.title,
  };
}

function validateDraft(draft: CareerJobPostingDraft) {
  if (!draft.title || !draft.companyName)
    throw new Error("job_details_required");
  return draft;
}

async function fetchUnstructuredPosting(
  identity: CareerJobUrlIdentity,
  args: FetchCareerJobPostingArgs
): Promise<CareerJobPostingDraft | null> {
  if (!args.exa) return null;
  const submittedUrl = identity.roleUrlVariants.find((value) =>
    value.startsWith("https://")
  );
  const retrievalUrls = uniqueStrings([
    submittedUrl,
    identity.canonicalUrl,
    identity.roleUrlVariants.at(-1),
  ]).slice(0, 2);

  for (const retrievalUrl of retrievalUrls) {
    const response = await args.exa.getContents([retrievalUrl], {
      maxAgeHours: EXA_CONTENT_MAX_AGE_HOURS,
      summary: {
        query: EXA_JOB_POSTING_SUMMARY_QUERY,
        schema: EXA_JOB_POSTING_SUMMARY_SCHEMA,
      },
    });
    const result = response.results[0];
    if (!result?.summary) continue;

    let extracted: JsonRecord | null = null;
    try {
      extracted = record(JSON.parse(result.summary));
    } catch {
      continue;
    }
    if (!extracted || extracted.isJobPosting !== true) return null;

    const extractedWorkMode = extracted.workArrangement;
    const workMode =
      extractedWorkMode === "remote" ||
      extractedWorkMode === "hybrid" ||
      extractedWorkMode === "onsite"
        ? extractedWorkMode
        : null;

    return {
      ...identity,
      companyLogoUrl: null,
      companyName: cleanText(extracted.hiringCompany, 240),
      description: optionalText(
        extracted.jobDescription,
        MAX_DESCRIPTION_CHARS
      ),
      descriptionSummary: optionalText(
        extracted.roleSummary,
        MAX_DESCRIPTION_SUMMARY_CHARS
      ),
      employmentTypes: validateExaEmploymentTypes(extracted.employmentTypes),
      extractedBy: "exa_summary",
      location: optionalText(extracted.jobLocation, 500),
      salaryRange: optionalText(extracted.salaryRange, 240),
      title: cleanText(extracted.roleTitle, 500),
      workMode,
    };
  }

  return null;
}

function manualOnlyDraft(
  identity: CareerJobUrlIdentity,
  manual?: CareerJobPostingManualFields
): CareerJobPostingDraft | null {
  const companyName = cleanText(manual?.companyName, 240);
  const title = cleanText(manual?.title, 500);
  if (!companyName || !title) return null;
  return {
    ...identity,
    companyLogoUrl: null,
    companyName,
    description: null,
    descriptionSummary: null,
    employmentTypes: [],
    extractedBy: "manual",
    location: null,
    salaryRange: null,
    title,
    workMode: null,
  };
}

export async function fetchCareerJobPosting(
  args: FetchCareerJobPostingArgs
): Promise<CareerJobPostingDraft> {
  const identity = parseCareerJobUrl(args.url);
  const fetcher = args.fetcher ?? fetch;
  let draft: CareerJobPostingDraft | null = null;

  try {
    if (identity.provider === "greenhouse") {
      draft = await fetchGreenhousePosting(identity, fetcher);
    } else if (identity.provider === "lever") {
      draft = await fetchLeverPosting(identity, fetcher);
    } else if (identity.provider === "ashby") {
      draft = await fetchAshbyPosting(identity, fetcher);
    } else if (identity.provider === "wanted") {
      draft = await fetchWantedPosting(identity, fetcher);
    } else if (identity.provider === "jumpit") {
      draft = await fetchJumpitPosting(identity, fetcher);
    }
  } catch {
    // Known ATS pages can change or briefly fail; use the general retrieval path.
  }

  if (!draft) {
    try {
      draft = await fetchUnstructuredPosting(identity, args);
    } catch {
      // Manual title/company input remains available when public retrieval fails.
    }
  }

  draft = draft
    ? mergeManualFields(draft, args.manual)
    : manualOnlyDraft(identity, args.manual);
  if (!draft) throw new Error("job_details_required");
  return validateDraft(draft);
}
