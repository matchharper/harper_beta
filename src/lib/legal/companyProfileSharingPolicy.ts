const COMPANY_NAME_PLACEHOLDER = "{{company_name}}";
const COMPANY_NAME_MAX_LENGTH = 160;

export const COMPANY_PROFILE_SHARING_POLICY_SLUG =
  "company-profile-sharing-policy";

export function normalizeCompanyProfileSharingPolicyName(value: unknown) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, COMPANY_NAME_MAX_LENGTH);
}

export function buildCompanyProfileSharingPolicyHref(companyName: string) {
  const normalizedCompanyName =
    normalizeCompanyProfileSharingPolicyName(companyName) || "company";

  return `/policy/${encodeURIComponent(normalizedCompanyName)}`;
}

export function applyCompanyNameToPolicyTemplate(
  value: string,
  companyName: string,
  options?: { markdown?: boolean }
) {
  const normalizedCompanyName =
    normalizeCompanyProfileSharingPolicyName(companyName) ||
    "해당 채용회사";
  const replacement = options?.markdown
    ? normalizedCompanyName.replace(/([\\`*{}\[\]()<>#+\-.!_|])/g, "\\$1")
    : normalizedCompanyName;

  return value.split(COMPANY_NAME_PLACEHOLDER).join(replacement);
}
