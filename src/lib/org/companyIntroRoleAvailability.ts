// Existing company-first artifacts are governed by Role lifecycle and fixture
// scope. The periodic-search opt-in does not control their availability.
type CompanyIntroRoleAvailabilityInput = {
  source_type?: unknown;
  status?: unknown;
  expires_at?: unknown;
  is_expired?: boolean | null;
  information?: unknown;
  company_internal_roles?: object | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getJsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function companyIntroRoleIsAvailable(
  role: CompanyIntroRoleAvailabilityInput,
  talentId?: string | null
) {
  const expiresAtMs = Date.parse(normalizeText(role.expires_at));
  const information = getJsonRecord(role.information);
  const testOnly = information.testOnly;
  const isTestOnly =
    testOnly === true ||
    ["true", "1", "yes", "on"].includes(normalizeText(testOnly).toLowerCase());
  const allowedFixtureTalentIds = Array.isArray(information.testTalentIds)
    ? information.testTalentIds.map(normalizeText).filter(Boolean)
    : [];
  const internalRole = Array.isArray(role.company_internal_roles)
    ? role.company_internal_roles[0]
    : role.company_internal_roles;
  return (
    normalizeText(role.source_type).toLowerCase() === "internal" &&
    Boolean(internalRole) &&
    ["active", "paused", "top_priority"].includes(
      normalizeText(role.status).toLowerCase()
    ) &&
    role.is_expired !== true &&
    (!Number.isFinite(expiresAtMs) || expiresAtMs > Date.now()) &&
    (!isTestOnly || allowedFixtureTalentIds.includes(normalizeText(talentId)))
  );
}

