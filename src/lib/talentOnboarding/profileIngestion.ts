import { logger } from "@/utils/logger";
import {
  buildCareerProfileIngestionSystemPrompt,
  buildCareerProfileIngestionUserPrompt,
  buildCareerProfileUpdateMergeSystemPrompt,
  buildCareerProfileUpdateMergeUserPrompt,
} from "@/lib/career/prompts";
import { runCareerProfileIngestion } from "@/lib/career/llm";
import {
  fetchTalentSetting,
  normalizeTalentBlockedCompanies,
  upsertTalentSetting,
} from "@/lib/talentOnboarding/stateStore";
import {
  callApifyActor,
  getApifyApiToken,
  listApifyDatasetItems,
} from "@/lib/apifyRest";
import type { TalentStructuredProfile } from "@/lib/talentOnboarding/models";

const DEFAULT_LINKEDIN_ACTOR_ID = "LpVuK3Zozwuipa5bp";
const NULL_CHAR_RE = /\u0000/g;
const LINKEDIN_FETCH_FAILED_MESSAGE =
  "LinkedIn 프로필 정보를 가져오지 못했습니다. 잠시 후 다시 시도하거나 이력서를 함께 업로드해 주세요.";
const LINKEDIN_FETCH_FALLBACK_MESSAGE =
  "LinkedIn 정보를 가져오지 못해 이력서 기준으로 프로필을 구성했습니다.";

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
  employment_type: string | null;
  start_date: string | null;
  end_date: string | null;
  months: number | null;
  company_name: string | null;
  company_location: string | null;
  company_id: number | null;
  company_link: string | null;
  company_logo: string | null;
};

export type TalentEducationDraft = {
  school: string | null;
  degree: string | null;
  description: string | null;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
};

export type TalentExtraDraft = {
  title: string | null;
  description: string | null;
  date: string | null;
};

export type TalentProfileIngestionWarning = {
  code: "linkedin_fetch_failed";
  message: string;
  detail?: string | null;
};

type TalentUserDraft = {
  name: string | null;
  profile_picture: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
};

type LlmEnrichmentDraft = {
  userPatch?: Partial<TalentUserDraft>;
  talentUserPatch?: Partial<TalentUserDraft>;
  talentUser?: Partial<TalentUserDraft>;
  experiences?: TalentExperienceDraft[];
  talentExperiences?: TalentExperienceDraft[];
  educations?: TalentEducationDraft[];
  talentEducations?: TalentEducationDraft[];
  extras?: TalentExtraDraft[];
  talentExtras?: TalentExtraDraft[];
  blockedCompanies?: string[];
  notes?: string;
};

type MergedTalentExperienceDraft = TalentExperienceDraft & {
  existingId: number | null;
};

type MergedTalentEducationDraft = TalentEducationDraft & {
  existingId: number | null;
};

type MergedTalentExtraDraft = TalentExtraDraft & {
  existingTitle: string | null;
};

type LlmProfileMergeDraft = {
  userPatch?: Partial<TalentUserDraft>;
  talentUserPatch?: Partial<TalentUserDraft>;
  talentUser?: Partial<TalentUserDraft>;
  experiences?: Array<Record<string, unknown>>;
  talentExperiences?: Array<Record<string, unknown>>;
  educations?: Array<Record<string, unknown>>;
  talentEducations?: Array<Record<string, unknown>>;
  extras?: Array<Record<string, unknown>>;
  talentExtras?: Array<Record<string, unknown>>;
  blockedCompanies?: string[];
  notes?: string;
};

export type TalentProfileIngestionResult = {
  ok: boolean;
  linkedinUrl: string;
  scholarLinks: string[];
  warnings: TalentProfileIngestionWarning[];
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
  blockedCompanies: string[];
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
  skipLinkedinFetch?: boolean;
};

type MergeIngestArgs = IngestArgs & {
  existingProfile: TalentStructuredProfile;
};

type ExtractedTalentProfileDraft = {
  linkedinUrl: string | null;
  scholarLinks: string[];
  links: string[];
  resumeText: string | null;
  stats: {
    experiencesFromLinkedin: number;
    educationsFromLinkedin: number;
    extrasFromLinkedin: number;
    experiencesFromLlm: number;
    educationsFromLlm: number;
    extrasFromLlm: number;
  };
  talentUser: TalentUserDraft;
  experiences: TalentExperienceDraft[];
  educations: TalentEducationDraft[];
  talentExtras: TalentExtraDraft[];
  blockedCompanies: string[];
  warnings: TalentProfileIngestionWarning[];
  llm: {
    used: boolean;
    notes: string | null;
    raw: string | null;
  };
};

const RESUME_ENRICHMENT_LLM_TIMEOUT_MS = 180_000;
const PROFILE_UPDATE_MERGE_LLM_TIMEOUT_MS = 90_000;
const LLM_EXPERIENCE_OUTPUT_LIMIT = 10;
const LLM_EXTRA_GROUP_OUTPUT_LIMIT = 5;

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

function collectTextFragments(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectTextFragments);
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  return [
    record.text,
    record.insight,
    record.description,
    record.summary,
  ].flatMap(collectTextFragments);
}

function combineMultilineText(
  values: unknown[],
  maxLength = 8000
): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const value of values) {
    for (const fragment of collectTextFragments(value)) {
      const cleaned = cleanMultilineText(fragment, maxLength);
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      parts.push(cleaned);
    }
  }

  return cleanMultilineText(parts.join("\n\n"), maxLength);
}

function blockedCompaniesFromExperiences(
  experiences: readonly TalentExperienceDraft[]
): string[] {
  return normalizeTalentBlockedCompanies(
    experiences.map((item) => item.company_name)
  );
}

async function mergeBlockedCompaniesIntoTalentSetting(args: {
  admin: any;
  userId: string;
  blockedCompanies: string[];
}) {
  const nextBlockedCompanies = normalizeTalentBlockedCompanies(
    args.blockedCompanies
  );
  if (nextBlockedCompanies.length === 0) return null;

  const current = await fetchTalentSetting({
    admin: args.admin,
    userId: args.userId,
  });
  const mergedBlockedCompanies = normalizeTalentBlockedCompanies([
    ...(current?.blocked_companies ?? []),
    ...nextBlockedCompanies,
  ]);

  if (
    mergedBlockedCompanies.length === (current?.blocked_companies ?? []).length
  ) {
    return current;
  }

  return upsertTalentSetting({
    admin: args.admin,
    userId: args.userId,
    blockedCompanies: mergedBlockedCompanies,
    recommendationSettingsUpdatedBy:
      current?.recommendation_settings_updated_by ?? "conversation",
  });
}

function parseCompanyId(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const direct = Number(normalized);
  if (Number.isInteger(direct) && direct > 0) return direct;

  const lastDigits = normalized.match(/(\d+)(?!.*\d)/);
  if (!lastDigits) return null;

  const parsed = Number(lastDigits[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

export function pickLinkedinUrl(links: string[]): string | null {
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

function extractLinkValue(raw: unknown): string | null {
  if (typeof raw === "string") {
    return cleanText(normalizeLink(raw), 1000);
  }
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  return (
    cleanText(record.url, 1000) ??
    cleanText(record.link, 1000) ??
    cleanText(record.href, 1000) ??
    cleanText(record.linkedinUrl, 1000) ??
    cleanText(record.companyUrl, 1000)
  );
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

function toTalentExperienceDraft(
  raw: unknown,
  options: { useRawMonths?: boolean } = {}
): TalentExperienceDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const useRawMonths = options.useRawMonths !== false;

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
  const employmentType =
    cleanText(item.employment_type, 120) ?? cleanText(item.employmentType, 120);
  const companyId = parseCompanyId(item.company_id ?? item.companyId);
  const companyLink =
    extractLinkValue(
      item.company_link ??
        item.companyLink ??
        item.company_url ??
        item.companyUrl ??
        item.companyLinkedinUrl ??
        item.companyProfileUrl
    ) ?? null;
  const description = cleanMultilineText(item.description, 6000);

  if (!role && !companyName && !description) {
    return null;
  }

  const rawMonths = useRawMonths
    ? typeof item.months === "number"
      ? item.months
      : typeof item.months === "string"
        ? Number(item.months)
        : null
    : null;
  const months =
    typeof rawMonths === "number" && Number.isFinite(rawMonths)
      ? Math.max(Math.floor(rawMonths), 0)
      : monthsBetween(startDate, endDate);

  return {
    role,
    description,
    employment_type: employmentType,
    start_date: startDate,
    end_date: endDate,
    months,
    company_name: companyName,
    company_location: companyLocation,
    company_id: companyId,
    company_link: companyLink,
    company_logo: null,
  };
}

function toTalentEducationDraft(raw: unknown): TalentEducationDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const school = cleanText(item.school, 300) ?? cleanText(item.schoolName, 300);
  const degree = cleanText(item.degree, 220);
  const description = combineMultilineText(
    [item.description, item.activitiesAndSocieties, item.insights],
    6000
  );
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
    description,
    field,
    start_date: startDate,
    end_date: endDate,
    url,
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
    parseLinkedinDate(
      extractDateText(item.published_at ?? item.publishedAt),
      false
    );

  return {
    title,
    description: descriptionParts.join("\n\n").slice(0, 6000) || null,
    date: parsedDate,
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

function normalizeDescriptionForMatch(
  value: string | null | undefined
): string {
  return normalizeForKey(value).slice(0, 160);
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

function recoverExperienceCompanyIds(
  experiences: TalentExperienceDraft[],
  linkedinExperiences: TalentExperienceDraft[]
): TalentExperienceDraft[] {
  const linkedinWithRecoverableFields = linkedinExperiences.filter(
    (item) =>
      (typeof item.company_id === "number" && item.company_id > 0) ||
      Boolean(item.employment_type)
  );

  if (linkedinWithRecoverableFields.length === 0) {
    return experiences.map((item) => ({
      ...item,
      company_logo: null,
    }));
  }

  return experiences.map((item) => {
    const companyName = normalizeForKey(item.company_name);
    if (!companyName) {
      return {
        ...item,
        company_link: item.company_link ?? null,
        company_logo: null,
      };
    }

    let bestScore = -1;
    let bestCandidates: TalentExperienceDraft[] = [];

    for (const candidate of linkedinWithRecoverableFields) {
      if (normalizeForKey(candidate.company_name) !== companyName) continue;

      let score = 100;
      if (
        normalizeForKey(item.role) &&
        normalizeForKey(item.role) === normalizeForKey(candidate.role)
      ) {
        score += 20;
      }
      if (
        normalizeForKey(item.start_date) &&
        normalizeForKey(item.start_date) ===
          normalizeForKey(candidate.start_date)
      ) {
        score += 12;
      }
      if (
        normalizeForKey(item.end_date) &&
        normalizeForKey(item.end_date) === normalizeForKey(candidate.end_date)
      ) {
        score += 10;
      }
      if (
        normalizeDescriptionForMatch(item.description) &&
        normalizeDescriptionForMatch(item.description) ===
          normalizeDescriptionForMatch(candidate.description)
      ) {
        score += 4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidates = [candidate];
      } else if (score === bestScore) {
        bestCandidates.push(candidate);
      }
    }

    if (bestScore < 100 || bestCandidates.length !== 1) {
      return {
        ...item,
        company_link: item.company_link ?? null,
        company_logo: null,
      };
    }

    const bestCandidate = bestCandidates[0];
    const resolvedCompanyId =
      typeof bestCandidate.company_id === "number" &&
      bestCandidate.company_id > 0
        ? bestCandidate.company_id
        : null;

    return {
      ...item,
      company_id: item.company_id ?? resolvedCompanyId,
      company_link: item.company_link ?? bestCandidate.company_link ?? null,
      employment_type: item.employment_type ?? bestCandidate.employment_type,
      company_logo: null,
    };
  });
}

async function loadCompanyLogoMap(args: {
  admin: any;
  experiences: TalentExperienceDraft[];
}) {
  const companyIds = Array.from(
    new Set(
      args.experiences
        .map((item) => item.company_id)
        .filter((item): item is number => typeof item === "number" && item > 0)
    )
  );

  const companyLogoById = new Map<number, string | null>();
  if (companyIds.length === 0) return companyLogoById;

  const { data, error } = await (args.admin as any)
    .from("company_db")
    .select("id, logo")
    .in("id", companyIds);

  if (error) {
    logger.log("[TalentIngest] company logo lookup failed", {
      companyIds,
      error: error.message ?? "Failed to load company_db logos",
    });
    return companyLogoById;
  }

  for (const row of toArray<{ id?: unknown; logo?: unknown }>(data)) {
    const companyId = parseCompanyId(row.id);
    if (!companyId) continue;
    companyLogoById.set(companyId, cleanText(row.logo, 1000));
  }

  return companyLogoById;
}

function attachCompanyLogos(
  experiences: TalentExperienceDraft[],
  companyLogoById: Map<number, string | null>
): TalentExperienceDraft[] {
  return experiences.map((item) => ({
    ...item,
    company_logo:
      item.company_id && companyLogoById.has(item.company_id)
        ? (companyLogoById.get(item.company_id) ?? null)
        : null,
  }));
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
  blockedCompanies: string[];
  notes: string | null;
} {
  const userPatchRaw =
    raw.userPatch ?? raw.talentUserPatch ?? raw.talentUser ?? {};
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

  const experiences = dedupeByKey(
    toArray(raw.experiences ?? raw.talentExperiences)
      .map((item) => toTalentExperienceDraft(item, { useRawMonths: false }))
      .filter((item): item is TalentExperienceDraft => item !== null),
    experienceKey
  );

  const educations = dedupeByKey(
    toArray(raw.educations ?? raw.talentEducations)
      .map((item) => toTalentEducationDraft(item))
      .filter((item): item is TalentEducationDraft => item !== null),
    educationKey
  );

  const talentExtras = dedupeByKey(
    toArray(raw.extras ?? raw.talentExtras)
      .map((item) => toTalentExtraDraft(item))
      .filter((item): item is TalentExtraDraft => item !== null),
    extraKey
  );

  return {
    talentUserPatch: userPatch,
    experiences: experiences.slice(0, LLM_EXPERIENCE_OUTPUT_LIMIT),
    educations,
    talentExtras: talentExtras.slice(0, LLM_EXTRA_GROUP_OUTPUT_LIMIT),
    blockedCompanies: normalizeTalentBlockedCompanies(raw.blockedCompanies),
    notes: null,
  };
}

function parseExistingId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toMergedExperienceDraft(
  raw: unknown
): MergedTalentExperienceDraft | null {
  const base = toTalentExperienceDraft(raw, { useRawMonths: false });
  if (!base || !raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return {
    ...base,
    existingId: parseExistingId(record.existingId ?? record.id),
  };
}

function toMergedEducationDraft(
  raw: unknown
): MergedTalentEducationDraft | null {
  const base = toTalentEducationDraft(raw);
  if (!base || !raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return {
    ...base,
    existingId: parseExistingId(record.existingId ?? record.id),
  };
}

function toMergedExtraDraft(raw: unknown): MergedTalentExtraDraft | null {
  const base = toTalentExtraDraft(raw);
  if (!base || !raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return {
    ...base,
    existingTitle: cleanText(record.existingTitle, 240),
  };
}

function dedupeMergedRows<T extends { existingId: number | null }>(
  items: T[],
  keyFn: (item: T) => string
): T[] {
  const seenExistingIds = new Set<number>();
  const seenKeys = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (item.existingId) {
      if (seenExistingIds.has(item.existingId)) continue;
      seenExistingIds.add(item.existingId);
      result.push(item);
      continue;
    }

    const key = keyFn(item);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    result.push(item);
  }

  return result;
}

function normalizeLlmProfileMerge(raw: LlmProfileMergeDraft): {
  talentUserPatch: Partial<TalentUserDraft>;
  experiences: MergedTalentExperienceDraft[];
  educations: MergedTalentEducationDraft[];
  talentExtras: MergedTalentExtraDraft[];
  notes: string | null;
} {
  const base = normalizeLlmEnrichment(raw as LlmEnrichmentDraft);

  return {
    talentUserPatch: base.talentUserPatch,
    experiences: dedupeMergedRows(
      toArray(raw.experiences ?? raw.talentExperiences)
        .map((item) => toMergedExperienceDraft(item))
        .filter((item): item is MergedTalentExperienceDraft => item !== null),
      experienceKey
    ).slice(0, LLM_EXPERIENCE_OUTPUT_LIMIT),
    educations: dedupeMergedRows(
      toArray(raw.educations ?? raw.talentEducations)
        .map((item) => toMergedEducationDraft(item))
        .filter((item): item is MergedTalentEducationDraft => item !== null),
      educationKey
    ),
    talentExtras: dedupeByKey(
      toArray(raw.extras ?? raw.talentExtras)
        .map((item) => toMergedExtraDraft(item))
        .filter((item): item is MergedTalentExtraDraft => item !== null),
      extraKey
    ).slice(0, LLM_EXTRA_GROUP_OUTPUT_LIMIT),
    notes: base.notes,
  };
}

function compactExperienceForPrompt(item: TalentExperienceDraft) {
  return {
    role: item.role,
    description: item.description,
    employment_type: item.employment_type,
    start_date: item.start_date,
    end_date: item.end_date,
    company_name: item.company_name,
    company_location: item.company_location,
  };
}

function compactEducationForPrompt(item: TalentEducationDraft) {
  return {
    school: item.school,
    degree: item.degree,
    description: item.description,
    field: item.field,
    start_date: item.start_date,
    end_date: item.end_date,
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
    experiences: experiences.slice(0, 30).map(compactExperienceForPrompt),
    educations: educations.slice(0, 20).map(compactEducationForPrompt),
    extras: talentExtras.slice(0, 40),
    scholarLinks,
  };

  logger.log("[TalentIngest] LLM enrichment start");
  const llmRaw = await runCareerProfileIngestion({
    messages: [
      {
        role: "system",
        content: buildCareerProfileIngestionSystemPrompt(),
      },
      {
        role: "user",
        content: buildCareerProfileIngestionUserPrompt({
          profileForPrompt,
          resumeText,
        }),
      },
    ],
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

async function extractTalentProfileDraftFromSources(
  args: IngestArgs
): Promise<ExtractedTalentProfileDraft> {
  const { admin, userId } = args;
  const links = toArray<string>(args.links)
    .map((link) => String(link).trim())
    .filter(Boolean);

  logger.log("[TalentIngest] request start", {
    userId,
    linkCount: links.length,
  });

  const registeredLinkedinUrl = pickLinkedinUrl(links);
  const linkedinUrl = args.skipLinkedinFetch ? null : registeredLinkedinUrl;
  const scholarLinks = pickScholarLinks(links);
  const resumeText = cleanMultilineText(args.resumeText, 24000);
  if (!linkedinUrl && !resumeText) {
    throw new Error("LinkedIn profile link or resume text is required");
  }

  logger.log("[TalentIngest] selected links", {
    linkedinUrl,
    registeredLinkedinUrl,
    skipLinkedinFetch: Boolean(args.skipLinkedinFetch),
    scholarLinksCount: scholarLinks.length,
  });

  let linkedinProfile: Record<string, any> = {};
  let experiencesFromLinkedin: TalentExperienceDraft[] = [];
  let educationsFromLinkedin: TalentEducationDraft[] = [];
  let extrasFromLinkedin: TalentExtraDraft[] = [];
  const warnings: TalentProfileIngestionWarning[] = [];

  if (linkedinUrl) {
    try {
      const token = getApifyApiToken("APIFY_CLIENT_KEY is required");

      const actorId =
        cleanText(process.env.APIFY_LINKEDIN_PROFILE_ACTOR_ID, 80) ??
        DEFAULT_LINKEDIN_ACTOR_ID;

      const input = {
        profileScraperMode: "Profile details no email ($4 per 1k)",
        queries: [linkedinUrl],
      };

      logger.log("[TalentIngest] calling Apify actor", {
        actorId,
        linkedinUrl,
      });
      const run = await withTimeout(
        callApifyActor({
          actorId,
          input,
          maxRunWaitSeconds: 90,
          token,
          waitForFinishSeconds: 90,
        }),
        90_000,
        "Apify LinkedIn crawl timed out"
      );
      logger.log("[TalentIngest] Apify run finished", {
        runId: run.id,
        defaultDatasetId: run.defaultDatasetId,
      });

      const items = await withTimeout(
        listApifyDatasetItems({
          datasetId: run.defaultDatasetId,
          limit: 1,
          token,
        }),
        20_000,
        "Apify dataset fetch timed out"
      );
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Apify returned empty LinkedIn dataset");
      }

      linkedinProfile = (items[0] ?? {}) as Record<string, any>;
      logger.log("[TalentIngest] Apify item loaded", {
        publicIdentifier: cleanText(linkedinProfile.publicIdentifier, 200),
      });

      const rawExperiences = toArray<unknown>(
        linkedinProfile.experience ?? linkedinProfile.experiences
      );
      const rawEducations = toArray<unknown>(
        linkedinProfile.education ?? linkedinProfile.educations
      );

      experiencesFromLinkedin = dedupeByKey(
        rawExperiences
          .map((item) => toTalentExperienceDraft(item))
          .filter((item): item is TalentExperienceDraft => item !== null),
        experienceKey
      );

      educationsFromLinkedin = dedupeByKey(
        rawEducations
          .map((item) => toTalentEducationDraft(item))
          .filter((item): item is TalentEducationDraft => item !== null),
        educationKey
      );

      extrasFromLinkedin = buildLinkedinTalentExtras(linkedinProfile);
    } catch (linkedinError) {
      const detail =
        linkedinError instanceof Error
          ? linkedinError.message
          : "Failed to fetch LinkedIn profile";

      logger.log("[TalentIngest] LinkedIn fetch failed", {
        userId,
        linkedinUrl,
        fallbackToResume: Boolean(resumeText),
        error: detail,
      });

      if (!resumeText) {
        throw new Error(LINKEDIN_FETCH_FAILED_MESSAGE);
      }

      warnings.push({
        code: "linkedin_fetch_failed",
        message: LINKEDIN_FETCH_FALLBACK_MESSAGE,
        detail,
      });
    }
  } else {
    logger.log("[TalentIngest] using resume-only ingestion");
  }

  let talentUser = buildTalentUserDraft(linkedinProfile);

  let experiences = experiencesFromLinkedin;
  let educations = educationsFromLinkedin;
  let talentExtras = extrasFromLinkedin;

  logger.log("[TalentIngest] structured from linkedin", {
    experiences: experiences.length,
    educations: educations.length,
    extras: talentExtras.length,
  });

  let llmNotes: string | null = null;
  let llmRaw: string | null = null;
  let experiencesFromLlm = 0;
  let educationsFromLlm = 0;
  let extrasFromLlm = 0;
  let blockedCompaniesFromLlm: string[] = [];

  if (resumeText) {
    const llmResult = await withTimeout(
      runResumeEnrichmentLlm({
        linkedinUrl: registeredLinkedinUrl ?? "",
        scholarLinks,
        linkedinProfile,
        userDraft: talentUser,
        experiences,
        educations,
        talentExtras,
        resumeText,
      }),
      RESUME_ENRICHMENT_LLM_TIMEOUT_MS,
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
      blockedCompaniesFromLlm = normalized.blockedCompanies;

      experiencesFromLlm = experiences.length;
      educationsFromLlm = educations.length;
      extrasFromLlm = talentExtras.length;
    }
  }

  experiences = recoverExperienceCompanyIds(
    experiences,
    experiencesFromLinkedin
  );

  const companyLogoById = await loadCompanyLogoMap({
    admin,
    experiences,
  });
  experiences = attachCompanyLogos(experiences, companyLogoById);
  const blockedCompanies = normalizeTalentBlockedCompanies([
    ...blockedCompaniesFromExperiences(experiencesFromLinkedin),
    ...blockedCompaniesFromExperiences(experiences),
    ...blockedCompaniesFromLlm,
  ]);

  return {
    linkedinUrl: registeredLinkedinUrl,
    scholarLinks,
    links,
    resumeText,
    stats: {
      experiencesFromLinkedin: experiencesFromLinkedin.length,
      educationsFromLinkedin: educationsFromLinkedin.length,
      extrasFromLinkedin: extrasFromLinkedin.length,
      experiencesFromLlm,
      educationsFromLlm,
      extrasFromLlm,
    },
    talentUser,
    experiences,
    educations,
    talentExtras,
    blockedCompanies,
    warnings,
    llm: {
      used: Boolean(resumeText),
      notes: llmNotes,
      raw: llmRaw,
    },
  };
}

export async function ingestTalentProfileFromLinkedin(
  args: IngestArgs
): Promise<TalentProfileIngestionResult> {
  const { admin, userId } = args;
  const extracted = await extractTalentProfileDraftFromSources(args);
  const now = new Date().toISOString();
  const userPayload: Record<string, unknown> = {
    name: extracted.talentUser.name,
    profile_picture: extracted.talentUser.profile_picture,
    headline: extracted.talentUser.headline,
    bio: extracted.talentUser.bio,
    location: extracted.talentUser.location,
    resume_links: extracted.links,
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
    userPayload.resume_text = args.resumeText.trim().slice(0, 24000);
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
    experiences: extracted.experiences.length,
    educations: extracted.educations.length,
    extras: extracted.talentExtras.length,
    experienceCompanyLogos: extracted.experiences.filter(
      (item) => item.company_logo
    ).length,
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

  const experienceRows = extracted.experiences.map((item) => ({
    talent_id: userId,
    role: item.role,
    description: item.description,
    employment_type: item.employment_type,
    start_date: item.start_date,
    end_date: item.end_date,
    months: item.months,
    company_id:
      typeof item.company_id === "number" && item.company_id > 0
        ? String(item.company_id)
        : null,
    company_link: item.company_link,
    company_name: item.company_name,
    company_location: item.company_location,
    company_logo: item.company_logo,
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

  const educationRows = extracted.educations.map((item) => ({
    talent_id: userId,
    school: item.school,
    degree: item.degree,
    description: item.description,
    field: item.field,
    start_date: item.start_date,
    end_date: item.end_date,
    url: item.url,
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
    updated_at: now,
    talent_extras: extracted.talentExtras.map((item) => ({
      title: item.title,
      description: item.description,
      date: item.date,
    })),
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

  await mergeBlockedCompaniesIntoTalentSetting({
    admin,
    userId,
    blockedCompanies: extracted.blockedCompanies,
  });

  const result: TalentProfileIngestionResult = {
    ok: true,
    linkedinUrl: extracted.linkedinUrl ?? "",
    scholarLinks: extracted.scholarLinks,
    warnings: extracted.warnings,
    stats: {
      ...extracted.stats,
      experiencesSaved: experienceRows.length,
      educationsSaved: educationRows.length,
      extrasSaved: extracted.talentExtras.length,
    },
    talentUser: extracted.talentUser,
    experiences: extracted.experiences,
    educations: extracted.educations,
    talentExtras: extracted.talentExtras,
    blockedCompanies: extracted.blockedCompanies,
    llm: extracted.llm,
  };

  logger.log("[TalentIngest] done", {
    userId,
    stats: result.stats,
  });

  return result;
}

function talentUserPatchFromExtracted(
  extracted: ExtractedTalentProfileDraft,
  existingProfile: TalentStructuredProfile
): Partial<TalentUserDraft> {
  const existingUser = existingProfile.talentUser;
  const patch: Partial<TalentUserDraft> = {};

  for (const key of [
    "name",
    "profile_picture",
    "headline",
    "bio",
    "location",
  ] as const) {
    const next = extracted.talentUser[key];
    const current = existingUser?.[key] ?? null;
    if (next && next !== current) {
      patch[key] = next;
    }
  }

  return patch;
}

function existingExperienceToMergedDraft(
  row: TalentStructuredProfile["talentExperiences"][number]
): MergedTalentExperienceDraft {
  return {
    existingId: row.id,
    role: cleanText(row.role, 240),
    description: cleanMultilineText(row.description, 8000),
    employment_type: cleanText(row.employment_type, 120),
    start_date: cleanText(row.start_date, 32),
    end_date: cleanText(row.end_date, 32),
    months: typeof row.months === "number" ? row.months : null,
    company_id: parseCompanyId(row.company_id),
    company_link: cleanText(row.company_link, 2000),
    company_name: cleanText(row.company_name, 240),
    company_location: cleanText(row.company_location, 240),
    company_logo: cleanText(row.company_logo, 2000),
  };
}

function existingEducationToMergedDraft(
  row: TalentStructuredProfile["talentEducations"][number]
): MergedTalentEducationDraft {
  return {
    existingId: row.id,
    school: cleanText(row.school, 240),
    degree: cleanText(row.degree, 120),
    description: cleanMultilineText(row.description, 8000),
    field: cleanText(row.field, 240),
    start_date: cleanText(row.start_date, 32),
    end_date: cleanText(row.end_date, 32),
    url: cleanText(row.url, 2000),
  };
}

function existingExtraToMergedDraft(
  item: TalentStructuredProfile["talentExtras"][number]
): MergedTalentExtraDraft {
  return {
    existingTitle: cleanText(item.title, 240),
    title: cleanText(item.title, 240),
    description: cleanMultilineText(item.description, 8000),
    date: cleanText(item.date, 32),
  };
}

function experienceLooksSame(
  existing: MergedTalentExperienceDraft,
  incoming: TalentExperienceDraft
) {
  const existingCompany = normalizeForKey(existing.company_name);
  const incomingCompany = normalizeForKey(incoming.company_name);
  const existingRole = normalizeForKey(existing.role);
  const incomingRole = normalizeForKey(incoming.role);
  if (!existingCompany || existingCompany !== incomingCompany) return false;

  if (existingRole && incomingRole && existingRole === incomingRole)
    return true;
  if (
    normalizeForKey(existing.start_date) &&
    normalizeForKey(existing.start_date) ===
      normalizeForKey(incoming.start_date)
  ) {
    return true;
  }

  return false;
}

function educationLooksSame(
  existing: MergedTalentEducationDraft,
  incoming: TalentEducationDraft
) {
  const existingSchool = normalizeForKey(existing.school);
  const incomingSchool = normalizeForKey(incoming.school);
  if (!existingSchool || existingSchool !== incomingSchool) return false;

  const existingDegree = normalizeForKey(existing.degree);
  const incomingDegree = normalizeForKey(incoming.degree);
  const existingField = normalizeForKey(existing.field);
  const incomingField = normalizeForKey(incoming.field);

  return (
    (existingDegree && incomingDegree && existingDegree === incomingDegree) ||
    (existingField && incomingField && existingField === incomingField) ||
    (!incomingDegree && !incomingField)
  );
}

function mergeNonEmpty<T extends Record<string, unknown>>(
  base: T,
  incoming: T
): T {
  const next = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "existingId" || value === null || value === undefined) continue;
    next[key as keyof T] = value as T[keyof T];
  }
  return next;
}

function buildFallbackMergedProfile(args: {
  existingProfile: TalentStructuredProfile;
  extracted: ExtractedTalentProfileDraft;
}): {
  talentUserPatch: Partial<TalentUserDraft>;
  experiences: MergedTalentExperienceDraft[];
  educations: MergedTalentEducationDraft[];
  talentExtras: MergedTalentExtraDraft[];
  notes: string | null;
} {
  const experiences = args.existingProfile.talentExperiences.map(
    existingExperienceToMergedDraft
  );
  for (const incoming of args.extracted.experiences) {
    const matchIndex = experiences.findIndex((existing) =>
      experienceLooksSame(existing, incoming)
    );
    if (matchIndex >= 0) {
      experiences[matchIndex] = mergeNonEmpty(experiences[matchIndex], {
        ...incoming,
        existingId: experiences[matchIndex].existingId,
        company_logo:
          incoming.company_logo ?? experiences[matchIndex].company_logo,
      });
    } else {
      experiences.push({ ...incoming, existingId: null });
    }
  }

  const educations = args.existingProfile.talentEducations.map(
    existingEducationToMergedDraft
  );
  for (const incoming of args.extracted.educations) {
    const matchIndex = educations.findIndex((existing) =>
      educationLooksSame(existing, incoming)
    );
    if (matchIndex >= 0) {
      educations[matchIndex] = mergeNonEmpty(educations[matchIndex], {
        ...incoming,
        existingId: educations[matchIndex].existingId,
      });
    } else {
      educations.push({ ...incoming, existingId: null });
    }
  }

  const talentExtras = args.existingProfile.talentExtras.map(
    existingExtraToMergedDraft
  );
  for (const incoming of args.extracted.talentExtras) {
    const incomingTitle = normalizeForKey(incoming.title);
    const matchIndex = talentExtras.findIndex(
      (existing) => normalizeForKey(existing.title) === incomingTitle
    );
    if (matchIndex >= 0) {
      talentExtras[matchIndex] = {
        ...mergeNonEmpty(talentExtras[matchIndex], {
          ...incoming,
          existingTitle: talentExtras[matchIndex].existingTitle,
        }),
      };
    } else {
      talentExtras.push({ ...incoming, existingTitle: null });
    }
  }

  return {
    talentUserPatch: talentUserPatchFromExtracted(
      args.extracted,
      args.existingProfile
    ),
    experiences,
    educations,
    talentExtras,
    notes: null,
  };
}

function buildExistingProfileForMergePrompt(
  existingProfile: TalentStructuredProfile
) {
  return {
    user: {
      name: existingProfile.talentUser?.name ?? null,
      headline: existingProfile.talentUser?.headline ?? null,
      bio: existingProfile.talentUser?.bio ?? null,
      location: existingProfile.talentUser?.location ?? null,
    },
    experiences: existingProfile.talentExperiences.map((item) => ({
      existingId: item.id,
      role: item.role,
      description: item.description,
      employment_type: item.employment_type,
      start_date: item.start_date,
      end_date: item.end_date,
      company_name: item.company_name,
      company_location: item.company_location,
      hasMemo: Boolean(item.memo?.trim()),
      memo: item.memo,
    })),
    educations: existingProfile.talentEducations.map((item) => ({
      existingId: item.id,
      school: item.school,
      degree: item.degree,
      description: item.description,
      field: item.field,
      start_date: item.start_date,
      end_date: item.end_date,
      hasMemo: Boolean(item.memo?.trim()),
      memo: item.memo,
    })),
    extras: existingProfile.talentExtras.map((item) => ({
      existingTitle: item.title,
      title: item.title,
      description: item.description,
      date: item.date,
      hasMemo: Boolean(item.memo?.trim()),
      memo: item.memo,
    })),
  };
}

function buildLatestParsedProfileForMergePrompt(
  extracted: ExtractedTalentProfileDraft
) {
  return {
    linkedinUrl: extracted.linkedinUrl,
    scholarLinks: extracted.scholarLinks,
    user: {
      name: extracted.talentUser.name,
      headline: extracted.talentUser.headline,
      bio: extracted.talentUser.bio,
      location: extracted.talentUser.location,
    },
    experiences: extracted.experiences.map(compactExperienceForPrompt),
    educations: extracted.educations.map(compactEducationForPrompt),
    extras: extracted.talentExtras,
    stats: extracted.stats,
  };
}

async function runProfileUpdateMergeLlm(args: {
  existingProfile: TalentStructuredProfile;
  extracted: ExtractedTalentProfileDraft;
}): Promise<ReturnType<typeof buildFallbackMergedProfile>> {
  logger.log("[TalentIngest] profile update merge LLM start");
  const llmRaw = await runCareerProfileIngestion({
    messages: [
      {
        role: "system",
        content: buildCareerProfileUpdateMergeSystemPrompt(),
      },
      {
        role: "user",
        content: buildCareerProfileUpdateMergeUserPrompt({
          existingProfile: buildExistingProfileForMergePrompt(
            args.existingProfile
          ),
          latestParsedProfile: buildLatestParsedProfileForMergePrompt(
            args.extracted
          ),
        }),
      },
    ],
  });

  logger.log("[TalentIngest] profile update merge LLM done");
  const parsed = parseLlmJson(llmRaw) as LlmProfileMergeDraft | null;
  if (!parsed) {
    logger.log("[TalentIngest] profile update merge parse failed", {
      preview: llmRaw.slice(0, 1000),
    });
    return buildFallbackMergedProfile(args);
  }

  const normalized = normalizeLlmProfileMerge(parsed);
  const fallback = buildFallbackMergedProfile(args);

  return {
    talentUserPatch: normalized.talentUserPatch,
    experiences:
      normalized.experiences.length > 0 ||
      args.existingProfile.talentExperiences.length === 0
        ? normalized.experiences
        : fallback.experiences,
    educations:
      normalized.educations.length > 0 ||
      args.existingProfile.talentEducations.length === 0
        ? normalized.educations
        : fallback.educations,
    talentExtras:
      normalized.talentExtras.length > 0 ||
      args.existingProfile.talentExtras.length === 0
        ? normalized.talentExtras
        : fallback.talentExtras,
    notes: normalized.notes,
  };
}

function validMergedExperienceRows(args: {
  existingProfile: TalentStructuredProfile;
  rows: MergedTalentExperienceDraft[];
}) {
  const existingIds = new Set(
    args.existingProfile.talentExperiences.map((item) => item.id)
  );
  return args.rows.map((item) => ({
    ...item,
    existingId:
      item.existingId && existingIds.has(item.existingId)
        ? item.existingId
        : null,
  }));
}

function validMergedEducationRows(args: {
  existingProfile: TalentStructuredProfile;
  rows: MergedTalentEducationDraft[];
}) {
  const existingIds = new Set(
    args.existingProfile.talentEducations.map((item) => item.id)
  );
  return args.rows.map((item) => ({
    ...item,
    existingId:
      item.existingId && existingIds.has(item.existingId)
        ? item.existingId
        : null,
  }));
}

function profileUserUpdatePayload(args: {
  extracted: ExtractedTalentProfileDraft;
  mergedUserPatch: Partial<TalentUserDraft>;
  resumeFileName?: string | null;
  resumeStoragePath?: string | null;
  resumeText?: string | null;
  now: string;
}) {
  const payload: Record<string, unknown> = {
    resume_links: args.extracted.links,
    updated_at: args.now,
  };

  for (const [key, value] of Object.entries(args.mergedUserPatch)) {
    if (value !== undefined && value !== null) {
      payload[key] = value;
    }
  }

  if (typeof args.resumeFileName === "string" && args.resumeFileName.trim()) {
    payload.resume_file_name = args.resumeFileName.trim();
  }
  if (
    typeof args.resumeStoragePath === "string" &&
    args.resumeStoragePath.trim()
  ) {
    payload.resume_storage_path = args.resumeStoragePath.trim();
  }
  if (typeof args.resumeText === "string") {
    payload.resume_text = args.resumeText.trim().slice(0, 24000);
  }

  return payload;
}

function experienceUpdatePayload(
  item: MergedTalentExperienceDraft,
  existing?: TalentStructuredProfile["talentExperiences"][number]
) {
  const companyId =
    typeof item.company_id === "number" && item.company_id > 0
      ? String(item.company_id)
      : (existing?.company_id ?? null);

  return {
    role: item.role,
    description: item.description,
    employment_type: item.employment_type,
    start_date: item.start_date,
    end_date: item.end_date,
    months:
      monthsBetween(item.start_date, item.end_date) ??
      item.months ??
      existing?.months ??
      null,
    company_id: companyId,
    company_link: item.company_link ?? existing?.company_link ?? null,
    company_name: item.company_name,
    company_location: item.company_location,
    company_logo: item.company_logo ?? existing?.company_logo ?? null,
  };
}

function educationUpdatePayload(
  item: MergedTalentEducationDraft,
  existing?: TalentStructuredProfile["talentEducations"][number]
) {
  return {
    school: item.school,
    degree: item.degree,
    description: item.description,
    field: item.field,
    start_date: item.start_date,
    end_date: item.end_date,
    url: item.url ?? existing?.url ?? null,
  };
}

function normalizedExtraTitle(value: string | null | undefined) {
  return normalizeForKey(value);
}

export async function mergeTalentProfileFromLatestSources(
  args: MergeIngestArgs
): Promise<TalentProfileIngestionResult> {
  const { admin, userId, existingProfile } = args;
  const extracted = await extractTalentProfileDraftFromSources(args);
  let mergedRaw: ReturnType<typeof buildFallbackMergedProfile>;
  try {
    mergedRaw = await withTimeout(
      runProfileUpdateMergeLlm({ existingProfile, extracted }),
      PROFILE_UPDATE_MERGE_LLM_TIMEOUT_MS,
      "Profile update merge LLM timed out"
    );
  } catch (mergeError) {
    logger.log("[TalentIngest] profile update merge fallback", {
      userId,
      error:
        mergeError instanceof Error
          ? mergeError.message
          : "Failed to merge latest profile sources",
    });
    mergedRaw = buildFallbackMergedProfile({ existingProfile, extracted });
  }
  let experiences = validMergedExperienceRows({
    existingProfile,
    rows: mergedRaw.experiences,
  });
  experiences = recoverExperienceCompanyIds(
    experiences,
    extracted.experiences
  ).map((item, index) => ({
    ...item,
    existingId: experiences[index]?.existingId ?? null,
  }));
  const educations = validMergedEducationRows({
    existingProfile,
    rows: mergedRaw.educations,
  });

  const companyLogoById = await loadCompanyLogoMap({
    admin,
    experiences,
  });
  const existingExperienceById = new Map(
    existingProfile.talentExperiences.map((item) => [item.id, item])
  );
  experiences = experiences.map((item) => ({
    ...item,
    company_logo:
      item.company_id && companyLogoById.has(item.company_id)
        ? (companyLogoById.get(item.company_id) ?? null)
        : item.existingId
          ? (existingExperienceById.get(item.existingId)?.company_logo ?? null)
          : item.company_logo,
  }));

  const now = new Date().toISOString();
  const db = admin as any;

  logger.log("[TalentIngest] merging latest profile sources", {
    userId,
    experiences: experiences.length,
    educations: educations.length,
    extras: mergedRaw.talentExtras.length,
  });

  const { error: userUpdateError } = await db
    .from("talent_users")
    .update(
      profileUserUpdatePayload({
        extracted,
        mergedUserPatch: mergedRaw.talentUserPatch,
        resumeFileName: args.resumeFileName,
        resumeStoragePath: args.resumeStoragePath,
        resumeText: args.resumeText,
        now,
      })
    )
    .eq("user_id", userId);
  if (userUpdateError) {
    throw new Error(userUpdateError.message ?? "Failed to update talent_users");
  }

  const finalExperienceIds = new Set(
    experiences
      .map((item) => item.existingId)
      .filter((item): item is number => typeof item === "number")
  );
  const experienceIdsToDelete = existingProfile.talentExperiences
    .map((item) => item.id)
    .filter((id) => !finalExperienceIds.has(id));
  if (experienceIdsToDelete.length > 0) {
    const { error } = await db
      .from("talent_experiences")
      .delete()
      .eq("talent_id", userId)
      .in("id", experienceIdsToDelete);
    if (error) {
      throw new Error(error.message ?? "Failed to delete talent_experiences");
    }
  }

  for (const item of experiences.filter((row) => row.existingId)) {
    const { error } = await db
      .from("talent_experiences")
      .update(
        experienceUpdatePayload(
          item,
          item.existingId
            ? existingExperienceById.get(item.existingId)
            : undefined
        )
      )
      .eq("talent_id", userId)
      .eq("id", item.existingId);
    if (error) {
      throw new Error(error.message ?? "Failed to update talent_experiences");
    }
  }

  const experienceRowsToInsert = experiences
    .filter((item) => !item.existingId)
    .map((item) => ({
      talent_id: userId,
      ...experienceUpdatePayload(item),
    }));
  if (experienceRowsToInsert.length > 0) {
    const { error } = await db
      .from("talent_experiences")
      .insert(experienceRowsToInsert);
    if (error) {
      throw new Error(error.message ?? "Failed to insert talent_experiences");
    }
  }

  const finalEducationIds = new Set(
    educations
      .map((item) => item.existingId)
      .filter((item): item is number => typeof item === "number")
  );
  const existingEducationById = new Map(
    existingProfile.talentEducations.map((item) => [item.id, item])
  );
  const educationIdsToDelete = existingProfile.talentEducations
    .map((item) => item.id)
    .filter((id) => !finalEducationIds.has(id));
  if (educationIdsToDelete.length > 0) {
    const { error } = await db
      .from("talent_educations")
      .delete()
      .eq("talent_id", userId)
      .in("id", educationIdsToDelete);
    if (error) {
      throw new Error(error.message ?? "Failed to delete talent_educations");
    }
  }

  for (const item of educations.filter((row) => row.existingId)) {
    const { error } = await db
      .from("talent_educations")
      .update(
        educationUpdatePayload(
          item,
          item.existingId
            ? existingEducationById.get(item.existingId)
            : undefined
        )
      )
      .eq("talent_id", userId)
      .eq("id", item.existingId);
    if (error) {
      throw new Error(error.message ?? "Failed to update talent_educations");
    }
  }

  const educationRowsToInsert = educations
    .filter((item) => !item.existingId)
    .map((item) => ({
      talent_id: userId,
      ...educationUpdatePayload(item),
    }));
  if (educationRowsToInsert.length > 0) {
    const { error } = await db
      .from("talent_educations")
      .insert(educationRowsToInsert);
    if (error) {
      throw new Error(error.message ?? "Failed to insert talent_educations");
    }
  }

  const existingExtraByTitle = new Map(
    existingProfile.talentExtras
      .map((item) => [normalizedExtraTitle(item.title), item] as const)
      .filter(([key]) => Boolean(key))
  );
  const talentExtras = mergedRaw.talentExtras.map((item) => {
    const byExistingTitle = item.existingTitle
      ? existingExtraByTitle.get(normalizedExtraTitle(item.existingTitle))
      : null;
    const byTitle = item.title
      ? existingExtraByTitle.get(normalizedExtraTitle(item.title))
      : null;
    const existing = byExistingTitle ?? byTitle ?? null;
    return {
      title: item.title,
      description: item.description,
      date: item.date,
      memo: existing?.memo ?? null,
    };
  });

  const { error: extrasUpsertError } = await db.from("talent_extras").upsert(
    {
      talent_id: userId,
      content: {
        updated_at: now,
        talent_extras: talentExtras,
      },
    },
    { onConflict: "talent_id" }
  );
  if (extrasUpsertError) {
    throw new Error(
      extrasUpsertError.message ?? "Failed to upsert talent_extras"
    );
  }
  const blockedCompanies = normalizeTalentBlockedCompanies([
    ...extracted.blockedCompanies,
    ...blockedCompaniesFromExperiences(experiences),
  ]);
  await mergeBlockedCompaniesIntoTalentSetting({
    admin,
    userId,
    blockedCompanies,
  });

  const result: TalentProfileIngestionResult = {
    ok: true,
    linkedinUrl: extracted.linkedinUrl ?? "",
    scholarLinks: extracted.scholarLinks,
    warnings: extracted.warnings,
    stats: {
      ...extracted.stats,
      experiencesSaved: experiences.length,
      educationsSaved: educations.length,
      extrasSaved: talentExtras.length,
    },
    talentUser: {
      name:
        cleanText(mergedRaw.talentUserPatch.name, 240) ??
        extracted.talentUser.name,
      profile_picture:
        cleanText(mergedRaw.talentUserPatch.profile_picture, 1000) ??
        extracted.talentUser.profile_picture,
      headline:
        cleanText(mergedRaw.talentUserPatch.headline, 300) ??
        extracted.talentUser.headline,
      bio:
        cleanMultilineText(mergedRaw.talentUserPatch.bio, 8000) ??
        extracted.talentUser.bio,
      location:
        cleanText(mergedRaw.talentUserPatch.location, 240) ??
        extracted.talentUser.location,
    },
    experiences: experiences.map(
      ({ existingId: _existingId, ...item }) => item
    ),
    educations: educations.map(({ existingId: _existingId, ...item }) => item),
    talentExtras: talentExtras.map(({ memo: _memo, ...item }) => item),
    blockedCompanies,
    llm: {
      used: true,
      notes: mergedRaw.notes,
      raw: extracted.llm.raw,
    },
  };

  logger.log("[TalentIngest] merge done", {
    userId,
    stats: result.stats,
  });

  return result;
}
