export const COMPANY_AUTH_ENTRY_SOURCES = [
  "auth_callback",
  "find",
  "org",
  "pricing",
  "radar",
  "search",
] as const;

export type CompanyAuthEntrySource =
  (typeof COMPANY_AUTH_ENTRY_SOURCES)[number];
export type CompanyBootstrapDisposition =
  | "create_company"
  | "existing_company"
  | "existing_talent";

const COMPANY_AUTH_ENTRY_SOURCE_SET = new Set<string>(
  COMPANY_AUTH_ENTRY_SOURCES
);

export function normalizeCompanyAuthEntrySource(
  value: unknown
): CompanyAuthEntrySource {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return COMPANY_AUTH_ENTRY_SOURCE_SET.has(normalized)
    ? (normalized as CompanyAuthEntrySource)
    : "auth_callback";
}

function getPathname(path: string) {
  const normalized = String(path ?? "").trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return "";

  return normalized.split(/[?#]/, 1)[0] ?? "";
}

export function isTalentAuthDestination(args: {
  flow?: string | null;
  nextPath?: string | null;
}) {
  if (String(args.flow ?? "").trim() === "talent_capture") return true;

  const pathname = getPathname(String(args.nextPath ?? ""));
  return pathname === "/career" || pathname.startsWith("/career/");
}

export function isCareerEmailOnboardingAuth(args: {
  source?: string | null;
  emailOnboardingToken?: string | null;
}) {
  if (String(args.emailOnboardingToken ?? "").trim()) return true;

  const source = String(args.source ?? "")
    .trim()
    .toLowerCase();
  return source === "email_onboarding" || source.startsWith("email_onboarding_");
}

export function resolveAuthCallbackDestination(args: {
  flow?: string | null;
  rawNext?: string | null;
  source?: string | null;
  emailOnboardingToken?: string | null;
}) {
  if (
    isCareerEmailOnboardingAuth({
      source: args.source,
      emailOnboardingToken: args.emailOnboardingToken,
    })
  ) {
    return "/career";
  }

  const flow = String(args.flow ?? "").trim();
  const rawNext = String(args.rawNext ?? "").trim();
  if (rawNext.startsWith("/") && !rawNext.startsWith("//")) {
    return rawNext;
  }

  if (flow === "talent_capture") return "/career";
  if (flow === "career_email_change") return "/career/profile";
  return "/";
}

export function resolveAuthCallbackErrorDestination(args: {
  error: string;
  isTalentDestination: boolean;
}) {
  const error = encodeURIComponent(String(args.error ?? "").trim());
  return args.isTalentDestination
    ? `/career?authError=${error}`
    : `?error=${error}`;
}

export function inferCompanyAuthEntrySource(
  nextPath: string
): CompanyAuthEntrySource {
  const pathname = getPathname(nextPath);

  if (pathname === "/search") return "search";
  if (pathname === "/find") return "find";
  if (pathname === "/pricing") return "pricing";
  if (pathname === "/radar") return "radar";
  if (pathname === "/org" || pathname.startsWith("/org/")) return "org";

  return "auth_callback";
}

export function getCompanyAuthEntryLabel(source: CompanyAuthEntrySource) {
  switch (source) {
    case "search":
      return "Company Search";
    case "find":
      return "Find";
    case "pricing":
      return "Pricing";
    case "radar":
      return "Radar";
    case "org":
      return "Organization";
    case "auth_callback":
      return "Company Auth";
  }
}

export function getCompanyBootstrapDisposition(args: {
  hasCompanyUser: boolean;
  hasTalentUser: boolean;
}): CompanyBootstrapDisposition {
  if (args.hasCompanyUser) return "existing_company";
  if (args.hasTalentUser) return "existing_talent";
  return "create_company";
}
