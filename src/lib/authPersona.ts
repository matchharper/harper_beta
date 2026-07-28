export const COMPANY_AUTH_ENTRY_SOURCES = [
  "auth_callback",
  "find",
  "invitation",
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

export function inferCompanyAuthEntrySource(
  nextPath: string
): CompanyAuthEntrySource {
  const pathname = getPathname(nextPath);

  if (pathname === "/search") return "search";
  if (pathname === "/find") return "find";
  if (pathname === "/pricing") return "pricing";
  if (pathname === "/radar") return "radar";
  if (pathname === "/invitation") return "invitation";
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
    case "invitation":
      return "Invitation";
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
