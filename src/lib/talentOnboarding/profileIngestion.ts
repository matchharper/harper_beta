import { ApifyClient } from "apify-client";
import { logger } from "@/utils/logger";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";

const DEFAULT_LINKEDIN_ACTOR_ID = "LpVuK3Zozwuipa5bp";
const NULL_CHAR_RE = /\u0000/g;

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export type TalentExperienceDraft = {
  role: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  months: number | null;
  company_name: string | null;
  company_location: string | null;
  memo: string | null;
};

export type TalentEducationDraft = {
  school: string | null;
  degree: string | null;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  memo: string | null;
};

export type TalentExtraDraft = {
  title: string | null;
  description: string | null;
  date: string | null;
  memo: string | null;
};

type TalentUserDraft = {
  name: string | null;
  profile_picture: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
};

type LlmEnrichmentDraft = {
  talentUserPatch?: Partial<TalentUserDraft>;
  talentUser?: Partial<TalentUserDraft>;
  talentExperiences?: TalentExperienceDraft[];
  talentEducations?: TalentEducationDraft[];
  talentExtras?: TalentExtraDraft[];
  notes?: string;
};

export type TalentProfileIngestionResult = {
  ok: boolean;
  linkedinUrl: string;
  scholarLinks: string[];
  stats: {
    experiencesFromLinkedin: number;
    educationsFromLinkedin: number;
    extrasFromLinkedin: number;
    experiencesFromLlm: number;
    educationsFromLlm: number;
    extrasFromLlm: number;
    experiencesSaved: number;
    educationsSaved: number;
    extrasSaved: number;
  };
  talentUser: TalentUserDraft;
  experiences: TalentExperienceDraft[];
  educations: TalentEducationDraft[];
  talentExtras: TalentExtraDraft[];
  llm: {
    used: boolean;
    notes: string | null;
    raw: string | null;
  };
};

type IngestArgs = {
  admin: any;
  userId: string;
  links: string[];
  resumeText?: string | null;
  resumeFileName?: string | null;
  resumeStoragePath?: string | null;
};

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function cleanText(value: unknown, maxLength = 4000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(NULL_CHAR_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function cleanMultilineText(value: unknown, maxLength = 8000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(NULL_CHAR_RE, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function normalizeLink(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeLinkedinProfileUrl(raw: string): string | null {
  try {
    const withProtocol = normalizeLink(raw);
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!(host === "linkedin.com" || host.endsWith(".linkedin.com")))
      return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    if (segments[0] !== "in") return null;
    return `https://www.linkedin.com/in/${segments[1]}`;
  } catch {
    return null;
  }
}

function pickLinkedinUrl(links: string[]): string | null {
  for (const raw of links) {
    const normalized = normalizeLinkedinProfileUrl(raw);
    if (normalized) return normalized;
  }
  return null;
}

function pickScholarLinks(links: string[]): string[] {
  return links
    .map((link) => normalizeLink(link))
    .filter((link) => /scholar\.google\.[^/]+\/citations/i.test(link));
}

function parseYearMonth(raw: string): { year: number; month: number } | null {
  const normalized = raw.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  const yearOnly = normalized.match(/^(\d{4})$/);
  if (yearOnly) {
    return { year: Number(yearOnly[1]), month: 1 };
  }

  const isoYearMonth = normalized.match(/^(\d{4})[-/](\d{1,2})$/);
  if (isoYearMonth) {
    const year = Number(isoYearMonth[1]);
    const month = Number(isoYearMonth[2]);
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      year >= 1900 &&
      year <= 2200 &&
      month >= 1 &&
      month <= 12
    ) {
      return { year, month };
    }
  }

  const koreanYearMonth = normalized.match(/^(\d{4})년\s*(\d{1,2})월$/);
  if (koreanYearMonth) {
    const year = Number(koreanYearMonth[1]);
    const month = Number(koreanYearMonth[2]);
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      year >= 1900 &&
      year <= 2200 &&
      month >= 1 &&
      month <= 12
    ) {
      return { year, month };
    }
  }

  const koreanMonthYear = normalized.match(/^(\d{1,2})월\s*(\d{4})$/);
  if (koreanMonthYear) {
    const month = Number(koreanMonthYear[1]);
    const year = Number(koreanMonthYear[2]);
    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      year >= 1900 &&
      year <= 2200 &&
      month >= 1 &&
      month <= 12
    ) {
      return { year, month };
    }
  }

  const parts = normalized.split(" ");
  if (parts.length !== 2) return null;
  const monthRaw = parts[0].toLowerCase();
  const yearRaw = Number(parts[1]);
  const month = MONTH_NAME_TO_INDEX[monthRaw];
  if (!month || !Number.isFinite(yearRaw)) return null;
  if (yearRaw < 1900 || yearRaw > 2200) return null;
  return { year: yearRaw, month };
}

function toIsoDate(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLinkedinDate(value: unknown, isStart: boolean): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/^issued\s+/i, "")
    .replace(/\u00b7/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!isStart && /(present|current|now|재직|현재)/i.test(normalized)) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const yearOnly = normalized.match(/^(\d{4})$/);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (!Number.isFinite(year)) return null;
    return isStart ? toIsoDate(year, 1, 1) : toIsoDate(year, 12, 31);
  }

  const ym = parseYearMonth(normalized);
  if (ym) {
    if (isStart) {
      return toIsoDate(ym.year, ym.month, 1);
    }
    const lastDay = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
    return toIsoDate(ym.year, ym.month, lastDay);
  }

  return null;
}

function monthsBetween(
  startDate: string | null,
  endDate: string | null
): number | null {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = endDate ? new Date(`${endDate}T00:00:00.000Z`) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const diffMonths =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  if (!Number.isFinite(diffMonths)) return null;
  return Math.max(diffMonths, 0);
}

function extractDateText(rawDate: unknown): string {
  if (typeof rawDate === "string") return rawDate;
  if (!rawDate || typeof rawDate !== "object") return "";
  const text = (rawDate as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

function buildTalentUserDraft(
  linkedinProfile: Record<string, any>
): TalentUserDraft {
  const firstName = cleanText(linkedinProfile.firstName, 120);
  const lastName = cleanText(linkedinProfile.lastName, 120);
  const preferredName =
    cleanText(linkedinProfile.fullName, 240) ??
    [firstName, lastName].filter(Boolean).join(" ").trim();
  const fallbackName = [lastName, firstName].filter(Boolean).join(" ").trim();
  const fullName = preferredName || fallbackName;

  const locationObj = linkedinProfile.location;
  const locationFromObj =
    locationObj && typeof locationObj === "object"
      ? (cleanText(locationObj.linkedinText, 240) ??
        cleanText(locationObj.text, 240))
      : null;

  const pictureObj = linkedinProfile.profilePicture;
  const pictureUrl =
    pictureObj && typeof pictureObj === "object"
      ? cleanText(pictureObj.url, 1000)
      : cleanText(linkedinProfile.profilePicture, 1000);

  return {
    name: fullName ? fullName.slice(0, 240) : null,
    profile_picture: pictureUrl,
    headline: cleanText(linkedinProfile.headline, 300),
    bio: cleanMultilineText(linkedinProfile.about, 8000),
    location: locationFromObj ?? cleanText(linkedinProfile.location, 240),
  };
}

function toTalentExperienceDraft(raw: unknown): TalentExperienceDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const startDate = parseLinkedinDate(
    extractDateText(item.start_date ?? item.startDate),
    true
  );
  const endDate = parseLinkedinDate(
    extractDateText(item.end_date ?? item.endDate),
    false
  );

  const role =
    cleanText(item.role, 300) ??
    cleanText(item.position, 300) ??
    cleanText(item.title, 300);
  const companyName =
    cleanText(item.company_name, 300) ?? cleanText(item.companyName, 300);
  const companyLocation =
    cleanText(item.company_location, 300) ?? cleanText(item.location, 300);
  const description = cleanMultilineText(item.description, 6000);

  if (!role && !companyName && !description) {
    return null;
  }

  const rawMonths =
    typeof item.months === "number"
      ? item.months
      : typeof item.months === "string"
        ? Number(item.months)
        : null;
  const months =
    typeof rawMonths === "number" && Number.isFinite(rawMonths)
      ? Math.max(Math.floor(rawMonths), 0)
      : monthsBetween(startDate, endDate);

  return {
    role,
    description,
    start_date: startDate,
    end_date: endDate,
    months,
    company_name: companyName,
    company_location: companyLocation,
    memo: cleanText(item.memo, 200),
  };
}

function toTalentEducationDraft(raw: unknown): TalentEducationDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const school = cleanText(item.school, 300) ?? cleanText(item.schoolName, 300);
  const degree = cleanText(item.degree, 220);
  const field = cleanText(item.field, 220) ?? cleanText(item.fieldOfStudy, 220);
  const startDate = parseLinkedinDate(
    extractDateText(item.start_date ?? item.startDate),
    true
  );
  const endDate = parseLinkedinDate(
    extractDateText(item.end_date ?? item.endDate),
    false
  );
  const url =
    cleanText(item.url, 1000) ?? cleanText(item.schoolLinkedinUrl, 1000);

  if (!school && !degree && !field) return null;

  return {
    school,
    degree,
    field,
    start_date: startDate,
    end_date: endDate,
    url,
    memo: cleanText(item.memo, 200),
  };
}

function toTalentExtraDraft(raw: unknown): TalentExtraDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const title =
    cleanText(item.title, 800) ??
    cleanText(item.name, 800) ??
    cleanText(item.role, 800) ??
    cleanText(item.topic, 800);
  if (!title) return null;

  const descriptionParts = [
    cleanMultilineText(item.description, 6000),
    cleanMultilineText(item.abstract, 6000),
    cleanText(item.link, 1200),
    cleanText(item.issuedBy, 300),
  ].filter(Boolean) as string[];

  const parsedDate =
    parseLinkedinDate(extractDateText(item.date ?? item.issuedAt), false) ??
    parseLinkedinDate(extractDateText(item.published_at ?? item.publishedAt), false);

  const sourceType = cleanText(item.type, 80);

  return {
    title,
    description: descriptionParts.join("\n\n").slice(0, 6000) || null,
    date: parsedDate,
    memo: cleanText(item.memo, 200) ?? sourceType,
  };
}

function dedupeByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function normalizeForKey(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function experienceKey(item: TalentExperienceDraft): string {
  return [
    normalizeForKey(item.company_name),
    normalizeForKey(item.role),
    normalizeForKey(item.start_date),
    normalizeForKey(item.end_date),
    normalizeForKey(item.description).slice(0, 120),
  ].join("|");
}

function educationKey(item: TalentEducationDraft): string {
  return [
    normalizeForKey(item.school),
    normalizeForKey(item.degree),
    normalizeForKey(item.field),
    normalizeForKey(item.start_date),
    normalizeForKey(item.end_date),
  ].join("|");
}

function extraKey(item: TalentExtraDraft): string {
  return [
    normalizeForKey(item.title),
    normalizeForKey(item.date),
    normalizeForKey(item.description).slice(0, 120),
  ].join("|");
}

function buildLinkedinTalentExtras(
  linkedinProfile: Record<string, any>
): TalentExtraDraft[] {
  const sources: unknown[] = [];

  const honorsAndAwards = toArray<unknown>(linkedinProfile.honorsAndAwards);
  const certifications = toArray<unknown>(linkedinProfile.certifications);
  const projects = toArray<unknown>(linkedinProfile.projects);
  const publications = toArray<unknown>(linkedinProfile.publications);
  const volunteering = toArray<unknown>(linkedinProfile.volunteering);

  for (const item of honorsAndAwards) {
    if (item && typeof item === "object") {
      sources.push({ ...(item as Record<string, unknown>), type: "award" });
    }
  }
  for (const item of certifications) {
    if (item && typeof item === "object") {
      const cert = item as Record<string, unknown>;
      sources.push({
        ...cert,
        title: cert.title ?? cert.name,
        description: cert.description ?? cert.issuedBy,
        date: cert.issuedAt ?? cert.date,
        type: "certification",
      });
    }
  }
  for (const item of projects) {
    if (item && typeof item === "object") {
      sources.push({ ...(item as Record<string, unknown>), type: "project" });
    }
  }
  for (const item of publications) {
    if (item && typeof item === "object") {
      const pub = item as Record<string, unknown>;
      sources.push({
        ...pub,
        description: pub.abstract ?? pub.link,
        date: pub.publishedAt ?? pub.published_at,
        type: "publication",
      });
    }
  }
  for (const item of volunteering) {
    if (item && typeof item === "object") {
      sources.push({
        ...(item as Record<string, unknown>),
        type: "volunteering",
      });
    }
  }

  return dedupeByKey(
    sources
      .map((item) => toTalentExtraDraft(item))
      .filter((item): item is TalentExtraDraft => item !== null),
    extraKey
  );
}

function stripJsonFence(raw: string): string {
  return raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseLlmJson(raw: string): LlmEnrichmentDraft | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as LlmEnrichmentDraft;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeLlmEnrichment(raw: LlmEnrichmentDraft): {
  talentUserPatch: Partial<TalentUserDraft>;
  experiences: TalentExperienceDraft[];
  educations: TalentEducationDraft[];
  talentExtras: TalentExtraDraft[];
  notes: string | null;
} {
  const userPatchRaw = raw.talentUserPatch ?? raw.talentUser ?? {};
  const userPatch: Partial<TalentUserDraft> = {};

  if ("name" in userPatchRaw)
    userPatch.name = cleanText(userPatchRaw.name, 240);
  if ("headline" in userPatchRaw) {
    userPatch.headline = cleanText(userPatchRaw.headline, 300);
  }
  if ("bio" in userPatchRaw)
    userPatch.bio = cleanMultilineText(userPatchRaw.bio, 8000);
  if ("location" in userPatchRaw) {
    userPatch.location = cleanText(userPatchRaw.location, 240);
  }
  if ("profile_picture" in userPatchRaw) {
    userPatch.profile_picture = cleanText(userPatchRaw.profile_picture, 1000);
  }

  const experiences = dedupeByKey(
    toArray(raw.talentExperiences)
    .map((item) => toTalentExperienceDraft(item))
    .filter((item): item is TalentExperienceDraft => item !== null),
    experienceKey
  );

  const educations = dedupeByKey(
    toArray(raw.talentEducations)
    .map((item) => toTalentEducationDraft(item))
    .filter((item): item is TalentEducationDraft => item !== null),
    educationKey
  );

  const talentExtras = dedupeByKey(
    toArray(raw.talentExtras)
      .map((item) => toTalentExtraDraft(item))
      .filter((item): item is TalentExtraDraft => item !== null),
    extraKey
  );

  return {
    talentUserPatch: userPatch,
    experiences,
    educations,
    talentExtras,
    notes: cleanText(raw.notes, 2000),
  };
}

async function runResumeEnrichmentLlm(args: {
  linkedinUrl: string;
  scholarLinks: string[];
  linkedinProfile: Record<string, any>;
  userDraft: TalentUserDraft;
  experiences: TalentExperienceDraft[];
  educations: TalentEducationDraft[];
  talentExtras: TalentExtraDraft[];
  resumeText: string;
}): Promise<{
  normalized: ReturnType<typeof normalizeLlmEnrichment> | null;
  raw: string | null;
}> {
  const {
    linkedinUrl,
    scholarLinks,
    linkedinProfile,
    userDraft,
    experiences,
    educations,
    talentExtras,
    resumeText,
  } = args;

  const profileForPrompt = {
    linkedinUrl,
    profileSummary: {
      publicIdentifier: cleanText(linkedinProfile.publicIdentifier, 200),
      firstName: cleanText(linkedinProfile.firstName, 120),
      lastName: cleanText(linkedinProfile.lastName, 120),
      headline: userDraft.headline,
      bio: userDraft.bio,
      location: userDraft.location,
    },
    experiences: experiences.slice(0, 30),
    educations: educations.slice(0, 20),
    talentExtras: talentExtras.slice(0, 40),
    scholarLinks,
  };

  logger.log("[TalentIngest] LLM enrichment start");
  const llmRaw = await runTalentAssistantCompletion({
    messages: [
      {
        role: "system",
        content: [
          "You normalize and enrich a candidate profile from LinkedIn + resume text.",
          "Return JSON only, with no markdown.",
          "Never hallucinate uncertain facts. If uncertain, leave field null or skip.",
          "Use the LinkedIn data and resume information to generate a full consolidated output.",
          "Do not return only delta/additional rows. Return full arrays for all sections.",
          "If resume has less information, it is valid to keep LinkedIn-derived values.",
          "talentExtras is an array for awards, projects, publications, volunteering, certifications, or other notable details.",
          "Date format must be YYYY-MM-DD or null.",
          "Output schema:",
          "{",
          '  "talentUserPatch": {',
          '    "name": string|null,',
          '    "headline": string|null,',
          '    "bio": string|null,',
          '    "location": string|null,',
          '    "profile_picture": string|null',
          "  },",
          '  "talentExperiences": [',
          "    {",
          '      "role": string|null,',
          '      "description": string|null,',
          '      "start_date": "YYYY-MM-DD"|null,',
          '      "end_date": "YYYY-MM-DD"|null,',
          '      "months": number|null,',
          '      "company_name": string|null,',
          '      "company_location": string|null,',
          '      "memo": string|null',
          "    }",
          "  ],",
          '  "talentEducations": [',
          "    {",
          '      "school": string|null,',
          '      "degree": string|null,',
          '      "field": string|null,',
          '      "start_date": "YYYY-MM-DD"|null,',
          '      "end_date": "YYYY-MM-DD"|null,',
          '      "url": string|null,',
          '      "memo": string|null',
          "    }",
          "  ],",
          '  "talentExtras": [',
          "    {",
          '      "title": string|null,',
          '      "description": string|null,',
          '      "memo": string|null,',
          '      "date": "YYYY-MM-DD"|null',
          "    }",
          "  ],",
          '  "notes": string|null',
          "}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "[Current Structured LinkedIn Data]",
          JSON.stringify(profileForPrompt, null, 2),
          "",
          "[Resume Text]",
          resumeText.slice(0, 14000),
        ].join("\n"),
      },
    ],
    temperature: 0.1,
  });

  logger.log("[TalentIngest] LLM enrichment done");

  const parsed = parseLlmJson(llmRaw);
  if (!parsed) {
    logger.log(
      "[TalentIngest] LLM response parse failed",
      llmRaw.slice(0, 1000)
    );
    return { normalized: null, raw: llmRaw };
  }

  return {
    normalized: normalizeLlmEnrichment(parsed),
    raw: llmRaw,
  };
}

export async function ingestTalentProfileFromLinkedin(
  args: IngestArgs
): Promise<TalentProfileIngestionResult> {
  const { admin, userId } = args;
  const links = toArray<string>(args.links)
    .map((link) => String(link).trim())
    .filter(Boolean);

  logger.log("[TalentIngest] request start", {
    userId,
    linkCount: links.length,
  });

  const linkedinUrl = pickLinkedinUrl(links);
  if (!linkedinUrl) {
    throw new Error("LinkedIn profile link is required");
  }

  const scholarLinks = pickScholarLinks(links);
  logger.log("[TalentIngest] selected links", {
    linkedinUrl,
    scholarLinksCount: scholarLinks.length,
  });

  const token = process.env.APIFY_CLIENT_KEY;
  if (!token) {
    throw new Error("APIFY_CLIENT_KEY is required");
  }

  const actorId =
    cleanText(process.env.APIFY_LINKEDIN_PROFILE_ACTOR_ID, 80) ??
    DEFAULT_LINKEDIN_ACTOR_ID;
  const client = new ApifyClient({ token });

  const input = {
    profileScraperMode: "Profile details no email ($4 per 1k)",
    queries: [linkedinUrl],
  };

  logger.log("[TalentIngest] calling Apify actor", {
    actorId,
    linkedinUrl,
  });
  const run = await withTimeout(
    client.actor(actorId).call(input),
    90_000,
    "Apify LinkedIn crawl timed out"
  );
  logger.log("[TalentIngest] Apify run finished", {
    runId: run.id,
    defaultDatasetId: run.defaultDatasetId,
  });

  const { items } = await withTimeout(
    client.dataset(run.defaultDatasetId).listItems({
      limit: 1,
    }),
    20_000,
    "Apify dataset fetch timed out"
  );
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Apify returned empty LinkedIn dataset");
  }

  const linkedinProfile = (items[0] ?? {}) as Record<string, any>;
  logger.log("[TalentIngest] Apify item loaded", {
    publicIdentifier: cleanText(linkedinProfile.publicIdentifier, 200),
  });

  let talentUser = buildTalentUserDraft(linkedinProfile);
  const rawExperiences = toArray<unknown>(
    linkedinProfile.experience ?? linkedinProfile.experiences
  );
  const rawEducations = toArray<unknown>(
    linkedinProfile.education ?? linkedinProfile.educations
  );

  const experiencesFromLinkedin = dedupeByKey(
    rawExperiences
      .map((item) => toTalentExperienceDraft(item))
      .filter((item): item is TalentExperienceDraft => item !== null),
    experienceKey
  );

  const educationsFromLinkedin = dedupeByKey(
    rawEducations
      .map((item) => toTalentEducationDraft(item))
      .filter((item): item is TalentEducationDraft => item !== null),
    educationKey
  );

  const extrasFromLinkedin = buildLinkedinTalentExtras(linkedinProfile);

  let experiences = experiencesFromLinkedin;
  let educations = educationsFromLinkedin;
  let talentExtras = extrasFromLinkedin;

  logger.log("[TalentIngest] structured from linkedin", {
    experiences: experiences.length,
    educations: educations.length,
    extras: talentExtras.length,
  });

  const resumeText = cleanMultilineText(args.resumeText, 20000);
  let llmNotes: string | null = null;
  let llmRaw: string | null = null;
  let experiencesFromLlm = 0;
  let educationsFromLlm = 0;
  let extrasFromLlm = 0;

  if (resumeText) {
    const llmResult = await withTimeout(
      runResumeEnrichmentLlm({
        linkedinUrl,
        scholarLinks,
        linkedinProfile,
        userDraft: talentUser,
        experiences,
        educations,
        talentExtras,
        resumeText,
      }),
      60_000,
      "Resume enrichment LLM timed out"
    );
    llmRaw = llmResult.raw;

    if (llmResult.normalized) {
      const normalized = llmResult.normalized;
      llmNotes = normalized.notes;

      talentUser = {
        ...talentUser,
        ...Object.fromEntries(
          Object.entries(normalized.talentUserPatch).filter(
            ([, value]) => value !== undefined
          )
        ),
      };
      // LLM output is the final consolidated result, not incremental additions.
      experiences = dedupeByKey(normalized.experiences, experienceKey);
      educations = dedupeByKey(normalized.educations, educationKey);
      talentExtras = dedupeByKey(normalized.talentExtras, extraKey);

      experiencesFromLlm = experiences.length;
      educationsFromLlm = educations.length;
      extrasFromLlm = talentExtras.length;
    }
  }

  const now = new Date().toISOString();
  const userPayload: Record<string, unknown> = {
    name: talentUser.name,
    profile_picture: talentUser.profile_picture,
    headline: talentUser.headline,
    bio: talentUser.bio,
    location: talentUser.location,
    resume_links: links,
    updated_at: now,
  };

  if (typeof args.resumeFileName === "string" && args.resumeFileName.trim()) {
    userPayload.resume_file_name = args.resumeFileName.trim();
  }
  if (
    typeof args.resumeStoragePath === "string" &&
    args.resumeStoragePath.trim()
  ) {
    userPayload.resume_storage_path = args.resumeStoragePath.trim();
  }
  if (typeof args.resumeText === "string") {
    userPayload.resume_text = args.resumeText.trim().slice(0, 20000);
  }

  logger.log("[TalentIngest] writing talent_users");
  const { error: userUpdateError } = await (admin as any)
    .from("talent_users")
    .update(userPayload)
    .eq("user_id", userId);
  if (userUpdateError) {
    throw new Error(userUpdateError.message ?? "Failed to update talent_users");
  }

  logger.log("[TalentIngest] replacing child rows", {
    experiences: experiences.length,
    educations: educations.length,
    extras: talentExtras.length,
  });

  const db = admin as any;

  const { error: expDeleteError } = await db
    .from("talent_experiences")
    .delete()
    .eq("talent_id", userId);
  if (expDeleteError) {
    throw new Error(
      expDeleteError.message ?? "Failed to delete old talent_experiences"
    );
  }

  const { error: eduDeleteError } = await db
    .from("talent_educations")
    .delete()
    .eq("talent_id", userId);
  if (eduDeleteError) {
    throw new Error(
      eduDeleteError.message ?? "Failed to delete old talent_educations"
    );
  }

  const experienceRows = experiences.map((item) => ({
    talent_id: userId,
    role: item.role,
    description: item.description,
    start_date: item.start_date,
    end_date: item.end_date,
    months: item.months,
    company_name: item.company_name,
    company_location: item.company_location,
    memo: item.memo,
  }));
  if (experienceRows.length > 0) {
    const { error: expInsertError } = await db
      .from("talent_experiences")
      .insert(experienceRows);
    if (expInsertError) {
      throw new Error(
        expInsertError.message ?? "Failed to insert talent_experiences"
      );
    }
  }

  const educationRows = educations.map((item) => ({
    talent_id: userId,
    school: item.school,
    degree: item.degree,
    field: item.field,
    start_date: item.start_date,
    end_date: item.end_date,
    url: item.url,
    memo: item.memo,
  }));
  if (educationRows.length > 0) {
    const { error: eduInsertError } = await db
      .from("talent_educations")
      .insert(educationRows);
    if (eduInsertError) {
      throw new Error(
        eduInsertError.message ?? "Failed to insert talent_educations"
      );
    }
  }

  const extrasContent = {
    source: {
      linkedin_url: linkedinUrl,
      scholar_links: scholarLinks,
      input_links: links,
    },
    counts: {
      experiences: experienceRows.length,
      educations: educationRows.length,
      extras: talentExtras.length,
    },
    talent_extras: talentExtras,
    llm: {
      used: Boolean(resumeText),
      notes: llmNotes,
      raw: llmRaw ? llmRaw.slice(0, 12000) : null,
    },
    updated_at: now,
  };

  const { error: extrasUpsertError } = await db.from("talent_extras").upsert(
    {
      talent_id: userId,
      content: extrasContent,
    },
    { onConflict: "talent_id" }
  );
  if (extrasUpsertError) {
    throw new Error(
      extrasUpsertError.message ?? "Failed to upsert talent_extras"
    );
  }

  const result: TalentProfileIngestionResult = {
    ok: true,
    linkedinUrl,
    scholarLinks,
    stats: {
      experiencesFromLinkedin: experiencesFromLinkedin.length,
      educationsFromLinkedin: educationsFromLinkedin.length,
      extrasFromLinkedin: extrasFromLinkedin.length,
      experiencesFromLlm,
      educationsFromLlm,
      extrasFromLlm,
      experiencesSaved: experienceRows.length,
      educationsSaved: educationRows.length,
      extrasSaved: talentExtras.length,
    },
    talentUser,
    experiences,
    educations,
    talentExtras,
    llm: {
      used: Boolean(resumeText),
      notes: llmNotes,
      raw: llmRaw,
    },
  };

  logger.log("[TalentIngest] done", {
    userId,
    stats: result.stats,
  });

  return result;
}
