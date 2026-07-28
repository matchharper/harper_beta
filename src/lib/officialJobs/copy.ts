import type { IncomingMessage } from "http";
import {
  normalizeLocale,
  resolveLocaleFromCountryLanguage,
  type ResolvedLocale,
} from "@/i18n/localeResolution";

export type OfficialJobsLocale = ResolvedLocale;

type RequestWithCookies = IncomingMessage & {
  cookies?: Record<string, string | undefined>;
};

function parsePrimaryLanguage(acceptLanguage: string | string[] | undefined) {
  const header = Array.isArray(acceptLanguage)
    ? acceptLanguage[0]
    : acceptLanguage;
  const primaryLocale = header?.split(",")[0]?.split(";")[0]?.trim() || "en";
  return primaryLocale.split("-")[0] || "en";
}

function readHeader(req: IncomingMessage, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function resolveOfficialJobsLocaleFromRequest(
  req: RequestWithCookies
): OfficialJobsLocale {
  const cookieLocale = normalizeLocale(req.cookies?.NEXT_LOCALE);
  if (cookieLocale) return cookieLocale;

  const countryCode =
    readHeader(req, "x-vercel-ip-country") ||
    readHeader(req, "cf-ipcountry") ||
    "ZZ";

  return resolveLocaleFromCountryLanguage({
    countryCode,
    language: parsePrimaryLanguage(readHeader(req, "accept-language")),
  });
}

export const OFFICIAL_JOBS_COPY = {
  ko: {
    cta: {
      control: "Talk to Harper",
      treatment: "Apply with Harper",
    },
    initialChatDraft: "Harper 내부 기회인 {role} 포지션에 관심 있어요.",
    initialChatDraftWithCompany:
      "Harper 내부 기회인 {role} at {company} 포지션에 관심 있어요.",
    detail: {
      backToList: "역할 목록",
      facts: {
        compensation: "Compensation",
        location: "Location",
        seniority: "Seniority",
        vertical: "Vertical",
      },
    },
    employmentTypes: {
      contract: "계약직",
      fractional: "Fractional",
      full_time: "풀타임",
      internship: "인턴",
      part_time: "파트타임",
    },
    header: {
      forCompanies: "For Companies",
      jobs: "Jobs",
    },
    list: {
      empty:
        "아직 공개된 역할은 없어요. Harper는 계속 시장을 살펴보고 있습니다.",
      heroBody:
        "충분히 흥미로운 기회만 소개시켜드리고 있어요.\n관심 있는 역할이 보이면 저에게 알려주세요.",
      heroTitle: "안녕하세요 Harper입니다.\n제가 먼저 살펴보는 역할들이에요.",
      learnMore: "Harper 더 알아보기",
      tableHeaders: {
        apply: "Apply",
        company: "Company",
        location: "Location",
        role: "Role",
        vertical: "Vertical",
      },
    },
    seo: {
      detailDescriptionFallback:
        "{company}의 {role} 포지션을 Harper를 통해 확인하고 지원하세요.",
      detailTitle: "{role} at {company} | Harper Jobs",
      inLanguage: "ko-KR",
      listDescription:
        "Harper가 먼저 살펴보는 역할을 보고, 관심 있는 기회가 있으면 대화로 더 좁혀보세요.",
      listTitle: "Jobs Harper Is Watching | Harper",
      ogLocale: "ko_KR",
      structuredDataName: "Harper official job",
    },
  },
  en: {
    cta: {
      control: "Talk to Harper",
      treatment: "Apply with Harper",
    },
    initialChatDraft:
      "I'm interested in the Harper internal opportunity : {role} role.",
    initialChatDraftWithCompany:
      "I'm interested in the Harper internal opportunity: {role} at {company}.",
    detail: {
      backToList: "All roles",
      facts: {
        compensation: "Compensation",
        location: "Location",
        seniority: "Seniority",
        vertical: "Vertical",
      },
    },
    employmentTypes: {
      contract: "Contract",
      fractional: "Fractional",
      full_time: "Full-time",
      internship: "Internship",
      part_time: "Part-time",
    },
    header: {
      forCompanies: "For Companies",
      jobs: "Jobs",
    },
    list: {
      empty:
        "No public roles are listed yet. Harper is still watching the market.",
      heroBody:
        "I only introduce opportunities that look genuinely interesting.\nIf a role catches your eye, let me know.",
      heroTitle: "Hi, this is Harper.\nThese are the roles I'm watching first.",
      learnMore: "Learn more about Harper",
      tableHeaders: {
        apply: "Apply",
        company: "Company",
        location: "Location",
        role: "Role",
        vertical: "Vertical",
      },
    },
    seo: {
      detailDescriptionFallback:
        "Explore the {role} role at {company} through Harper.",
      detailTitle: "{role} at {company} | Harper Jobs",
      inLanguage: "en-US",
      listDescription:
        "See roles Harper is watching first, then start a conversation when an opportunity looks interesting.",
      listTitle: "Jobs Harper Is Watching | Harper",
      ogLocale: "en_US",
      structuredDataName: "Harper official job",
    },
  },
} as const;

export function getOfficialJobsCopy(locale: OfficialJobsLocale) {
  return OFFICIAL_JOBS_COPY[locale] ?? OFFICIAL_JOBS_COPY.ko;
}

export function formatOfficialJobsCopy(
  template: string,
  values: Record<string, string | number | null | undefined>
) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = values[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function formatOfficialJobEmploymentType(
  value: string | null | undefined,
  locale: OfficialJobsLocale
) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  if (!normalized) return null;

  const copy = getOfficialJobsCopy(locale);
  return (
    copy.employmentTypes[normalized as keyof typeof copy.employmentTypes] ??
    String(value ?? "")
      .trim()
      .replaceAll("_", " ")
  );
}
