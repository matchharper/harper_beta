export const INTERNAL_ROLE_COMPANY_ALIAS_FALLBACK =
  "Undisclosed internal company";

type InternalRoleCompanyNameSource = {
  companyName?: string | null;
  publishedName?: string | null;
};

function normalizeInternalRoleCompanyAliasKey(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function getInternalRolePublishedName(publishedName?: string | null) {
  const text = String(publishedName ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text || INTERNAL_ROLE_COMPANY_ALIAS_FALLBACK;
}

function maskInternalRoleSearchKeyword(
  keyword: string,
  sources: readonly InternalRoleCompanyNameSource[]
) {
  const normalizedKeyword = normalizeInternalRoleCompanyAliasKey(keyword);
  if (!normalizedKeyword) return keyword;

  if (normalizedKeyword.length < 3) return keyword;

  for (const source of sources) {
    const companyKey = normalizeInternalRoleCompanyAliasKey(source.companyName);
    const publishedKey = normalizeInternalRoleCompanyAliasKey(
      source.publishedName
    );
    const matchesCompanyName =
      companyKey.length >= 3 &&
      (companyKey === normalizedKeyword ||
        companyKey.includes(normalizedKeyword) ||
        normalizedKeyword.includes(companyKey));
    const matchesPublishedName =
      publishedKey.length >= 3 &&
      (publishedKey === normalizedKeyword ||
        publishedKey.includes(normalizedKeyword) ||
        normalizedKeyword.includes(publishedKey));

    if (matchesCompanyName || matchesPublishedName) {
      return getInternalRolePublishedName(source.publishedName);
    }
  }

  return keyword;
}

export function maskInternalRoleSearchKeywords(
  keywords: readonly string[],
  sources: readonly InternalRoleCompanyNameSource[]
) {
  return keywords.map((keyword) =>
    maskInternalRoleSearchKeyword(keyword, sources)
  );
}
