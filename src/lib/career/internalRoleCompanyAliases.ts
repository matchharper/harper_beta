export const INTERNAL_ROLE_COMPANY_ALIAS_FALLBACK =
  "Undisclosed internal company";

export const INTERNAL_ROLE_COMPANY_ALIASES = [
  {
    companyName: "Blockit AI",
    alias: "Sequoia-backed Consumer AI Agent",
  },
  {
    companyName: "Endo Health",
    alias: "Healthtech growth company",
  },
  {
    companyName: "Harper",
    alias: "Harper",
  },
  {
    companyName: "Mel",
    alias: "Real-time multimodal B2C AI company",
  },
  {
    companyName: "Mistral AI",
    alias: "World-leading open-weight AI lab",
  },
  {
    companyName: "OptimizerAI",
    alias: "AI research company",
  },
  {
    companyName: "Patlytics",
    alias: "Top-tier VC-backed AI Legal Tech",
  },
  {
    companyName: "Pickle",
    alias: "Real-time multimodal AI company",
  },
  {
    companyName: "Solomon",
    alias: "Enterprise AI company",
  },
  {
    companyName: "Stadium Live Studios",
    alias: "Consumer community and growth company",
  },
  {
    companyName: "Wonderful",
    alias: "Hypergrowth $2B Agentic AI company",
  },
] as const;

function normalizeInternalRoleCompanyAliasKey(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

const INTERNAL_ROLE_COMPANY_ALIAS_BY_KEY = new Map(
  INTERNAL_ROLE_COMPANY_ALIASES.map((item) => [
    normalizeInternalRoleCompanyAliasKey(item.companyName),
    item.alias,
  ])
);

export function getInternalRoleCompanyAlias(companyName?: string | null) {
  const key = normalizeInternalRoleCompanyAliasKey(companyName);
  return (
    INTERNAL_ROLE_COMPANY_ALIAS_BY_KEY.get(key) ??
    INTERNAL_ROLE_COMPANY_ALIAS_FALLBACK
  );
}

export function maskInternalRoleSearchKeyword(keyword: string) {
  const normalizedKeyword = normalizeInternalRoleCompanyAliasKey(keyword);
  if (!normalizedKeyword) return keyword;

  const exactAlias = INTERNAL_ROLE_COMPANY_ALIAS_BY_KEY.get(normalizedKeyword);
  if (exactAlias) return exactAlias;

  if (normalizedKeyword.length < 3) return keyword;

  for (const item of INTERNAL_ROLE_COMPANY_ALIASES) {
    const companyKey = normalizeInternalRoleCompanyAliasKey(item.companyName);
    if (
      companyKey.includes(normalizedKeyword) ||
      normalizedKeyword.includes(companyKey)
    ) {
      return item.alias;
    }
  }

  return keyword;
}
