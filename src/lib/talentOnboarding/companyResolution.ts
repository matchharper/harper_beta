import { normalizeLinkedinCompanyUrl } from "@/lib/companyLinkedin";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { getExaClient, type ExaSearchClient } from "@/lib/tools/exaClient";
import { logger } from "@/utils/logger";

const DEFAULT_MAX_EXTERNAL_SEARCHES = 3;
const MAX_LLM_CANDIDATES_PER_EXPERIENCE = 8;
const LLM_AUDIT_PASSES = 2;
const MAX_LLM_COMPANY_DESCRIPTION_LENGTH = 240;
const EXA_RESULTS_PER_COMPANY = 5;
const DEFAULT_EXA_SEARCH_COST_USD = 0.007;
const DEFAULT_EXA_SEARCH_TIMEOUT_MS = 8_000;
const DEFAULT_LLM_TIMEOUT_MS = 25_000;

export type CompanyDbIdentityRow = {
  description?: string | null;
  id: number;
  linkedin_company_id: number | null;
  linkedin_url: string | null;
  location?: string | null;
  logo: string | null;
  name: string | null;
  website_url: string | null;
  workspace_names?: string[];
};

export type TalentExperienceCompanyResolutionInput = {
  company_id: number | null;
  company_link: string | null;
  company_location: string | null;
  company_logo: string | null;
  company_name: string | null;
  linkedin_company_id?: number | null;
};

export type TalentExperienceCompanyResolutionMethod =
  | "existing_company_db_id"
  | "linkedin_company_id"
  | "linkedin_url"
  | "website_domain"
  | "exact_name"
  | "glm_candidate_selection"
  | "exa_linkedin_url"
  | "exa_website_domain"
  | "unresolved";

export type TalentExperienceCompanyResolutionDiagnostic = {
  companyDbId: number | null;
  companyName: string | null;
  exaCostUsd: number;
  exaLatencyMs: number;
  exaSearchAttempted: boolean;
  llmCandidateIds: number[];
  llmResolutionAttempted: boolean;
  matchedBy: TalentExperienceCompanyResolutionMethod;
  totalLatencyMs: number;
};

export type TalentExperienceCompanyResolutionResult<
  T extends TalentExperienceCompanyResolutionInput,
> = {
  diagnostics: TalentExperienceCompanyResolutionDiagnostic[];
  experiences: T[];
  summary: {
    exaCostUsd: number;
    exaSearches: number;
    llmCalls: number;
    llmCostUsd: number;
    llmInputTokens: number;
    llmModel: string | null;
    llmOutputTokens: number;
    matched: number;
    total: number;
    unresolved: number;
    wallTimeMs: number;
  };
};

export interface CompanyIdentityLookup {
  findByExactName(name: string): Promise<CompanyDbIdentityRow[]>;
  findById(id: number): Promise<CompanyDbIdentityRow[]>;
  findByLinkedinCompanyId(id: number): Promise<CompanyDbIdentityRow[]>;
  findByLinkedinUrl(url: string): Promise<CompanyDbIdentityRow[]>;
  findByNameToken(token: string): Promise<CompanyDbIdentityRow[]>;
  findByNameTokens(tokens: readonly string[]): Promise<CompanyDbIdentityRow[]>;
  findByWebsiteDomain(domain: string): Promise<CompanyDbIdentityRow[]>;
}

export type CompanyIdentityJudgeCase = {
  candidates: CompanyDbIdentityRow[];
  companyLocation: string | null;
  companyName: string;
  key: string;
  proposedCompanyDbId?: number;
};

export type CompanyIdentityJudgeResult = {
  costUsd: number;
  inputTokens: number;
  latencyMs: number;
  matches: Map<string, number | null>;
  model: string;
  outputTokens: number;
};

export interface CompanyIdentityJudge {
  resolve(cases: readonly CompanyIdentityJudgeCase[]): Promise<CompanyIdentityJudgeResult>;
}

type ResolveTalentExperienceCompaniesArgs<
  T extends TalentExperienceCompanyResolutionInput,
> = {
  admin?: TalentAdminClient;
  enableExternalSearch?: boolean;
  enableLlmResolution?: boolean;
  exa?: ExaSearchClient;
  experiences: readonly T[];
  judge?: CompanyIdentityJudge;
  lookup?: CompanyIdentityLookup;
  maxExternalSearches?: number;
};

function cleanText(value: unknown, maxLength = 2_000) {
  const normalized =
    typeof value === "string"
      ? value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim()
      : "";
  return normalized ? normalized.slice(0, maxLength) : "";
}

function normalizeName(value: unknown) {
  return cleanText(value, 300).toLocaleLowerCase().normalize("NFKC");
}

const CORPORATE_NAME_SUFFIXES = new Set([
  "co",
  "company",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "llc",
  "limited",
  "ltd",
  "plc",
  "pte",
  "pvt",
]);

function entityNameKey(value: unknown) {
  const tokens = normalizeName(value)
    .replace(/&/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  while (
    tokens.length > 1 &&
    CORPORATE_NAME_SUFFIXES.has(tokens[tokens.length - 1])
  ) {
    tokens.pop();
  }
  return tokens.join("");
}

function companyNameLookupValues(value: unknown) {
  const fullName = cleanText(value, 300);
  if (!fullName) return [];
  const values = [fullName];
  const withoutTrailingParenthetical = fullName
    .replace(/\s*\([^()]+\)\s*$/u, "")
    .trim();
  if (
    withoutTrailingParenthetical !== fullName &&
    entityNameKey(withoutTrailingParenthetical).length >= 5
  ) {
    values.push(withoutTrailingParenthetical);
  }
  return values;
}

async function findNameCandidates(
  lookup: CompanyIdentityLookup,
  companyName: string
) {
  const rows = await Promise.all(
    companyNameLookupValues(companyName).map((name) =>
      lookup.findByExactName(name)
    )
  );
  return dedupeRows(rows.flat());
}

function companyNameTokens(value: unknown) {
  return normalizeName(
    cleanText(value, 300)
      .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, "$1 $2")
      .replace(/^@+/u, "")
  )
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !CORPORATE_NAME_SUFFIXES.has(token));
}

function candidateSearchTokens(value: unknown) {
  const variants = companyNameLookupValues(value);
  const tokens = variants.flatMap(companyNameTokens);
  return Array.from(new Set(tokens)).slice(0, 3);
}

function nameTokenOverlap(left: unknown, right: unknown) {
  const rightTokens = new Set(companyNameTokens(right));
  return companyNameTokens(left).reduce(
    (count, token) => count + (rightTokens.has(token) ? 1 : 0),
    0
  );
}

function hasLexicalRetrievalEvidence(left: unknown, right: unknown) {
  const leftKey = entityNameKey(left);
  const rightKey = entityNameKey(right);
  return (
    (leftKey.length >= 3 && leftKey === rightKey) ||
    nameTokenOverlap(left, right) > 0
  );
}

function rankCandidate(
  experience: TalentExperienceCompanyResolutionInput,
  row: CompanyDbIdentityRow
) {
  const inputName = normalizeName(experience.company_name);
  const rowName = normalizeName(row.name);
  const inputKey = entityNameKey(experience.company_name);
  const rowKey = entityNameKey(row.name);
  return (
    (inputName && inputName === rowName ? 100 : 0) +
    (inputKey && inputKey === rowKey ? 60 : 0) +
    nameTokenOverlap(experience.company_name, row.name) * 12 +
    (row.workspace_names?.length ? 12 : 0) +
    (row.linkedin_url ? 8 : 0) +
    (row.website_url ? 6 : 0) +
    (row.linkedin_company_id ? 4 : 0) +
    locationEvidenceScore(experience.company_location, row.location) * 2
  );
}

async function findLlmCandidates(args: {
  experience: TalentExperienceCompanyResolutionInput;
  lookup: CompanyIdentityLookup;
}) {
  const companyName = cleanText(args.experience.company_name, 300);
  if (!companyName) return [];
  const searchTokens = candidateSearchTokens(companyName);
  const [exactRows, orderedTokenRows, tokenRows] = await Promise.all([
    findNameCandidates(args.lookup, companyName),
    searchTokens.length >= 2
      ? args.lookup.findByNameTokens(searchTokens)
      : Promise.resolve([]),
    Promise.all(
      searchTokens.map((token) =>
        args.lookup.findByNameToken(token)
      )
    ).then((rows) => rows.flat()),
  ]);
  return dedupeRows([...exactRows, ...orderedTokenRows, ...tokenRows])
    .filter((row) => hasLexicalRetrievalEvidence(companyName, row.name))
    .sort(
      (left, right) =>
        rankCandidate(args.experience, right) -
          rankCandidate(args.experience, left) || left.id - right.id
    )
    .slice(0, MAX_LLM_CANDIDATES_PER_EXPERIENCE);
}

const NON_DISTINCT_LOCATION_TOKENS = new Set([
  "area",
  "greater",
  "metropolitan",
  "province",
  "region",
]);

function locationTokens(value: unknown) {
  return new Set(
    normalizeName(value)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(
        (token) =>
          token.length >= 3 && !NON_DISTINCT_LOCATION_TOKENS.has(token)
      )
  );
}

function locationEvidenceScore(left: unknown, right: unknown) {
  const leftTokens = locationTokens(left);
  const rightTokens = locationTokens(right);
  let score = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) score += 1;
  }
  return score;
}

function parsePositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function escapePostgrestPattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function normalizedHostname(value: unknown) {
  const raw = cleanText(value, 2_000);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

function normalizedWebsiteIdentity(value: unknown) {
  const raw = cleanText(value, 2_000);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return hostname ? { hostname, pathname } : null;
  } catch {
    return null;
  }
}

function linkedinUrlVariants(url: string) {
  const normalized = normalizeLinkedinCompanyUrl(url);
  if (!normalized) return [];
  return Array.from(
    new Set([
      normalized,
      `${normalized}/`,
      normalized.replace("https://www.", "https://"),
      `${normalized.replace("https://www.", "https://")}/`,
    ])
  );
}

function dedupeRows(rows: readonly CompanyDbIdentityRow[]) {
  const byId = new Map<number, CompanyDbIdentityRow>();
  for (const row of rows) {
    const id = parsePositiveInteger(row.id);
    if (!id || byId.has(id)) continue;
    byId.set(id, { ...row, id });
  }
  return [...byId.values()];
}

async function queryCompanyRows(query: PromiseLike<{ data: unknown; error: any }>) {
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to resolve company identity");
  }
  return dedupeRows(
    Array.isArray(data) ? (data as CompanyDbIdentityRow[]) : []
  );
}

const COMPANY_DB_IDENTITY_SELECT =
  "id,name,linkedin_company_id,linkedin_url,website_url,logo,location,description";

export function createSupabaseCompanyIdentityLookup(
  admin: TalentAdminClient
): CompanyIdentityLookup {
  return {
    async findById(id) {
      return queryCompanyRows(
        admin
          .from("company_db")
          .select(COMPANY_DB_IDENTITY_SELECT)
          .eq("id", id)
          .limit(2)
      );
    },

    async findByLinkedinCompanyId(id) {
      return queryCompanyRows(
        admin
          .from("company_db")
          .select(COMPANY_DB_IDENTITY_SELECT)
          .eq("linkedin_company_id", id)
          .limit(3)
      );
    },

    async findByLinkedinUrl(url) {
      const normalized = normalizeLinkedinCompanyUrl(url);
      if (!normalized) return [];
      const variants = linkedinUrlVariants(normalized);
      const exactRows = await queryCompanyRows(
        admin
          .from("company_db")
          .select(COMPANY_DB_IDENTITY_SELECT)
          .in("linkedin_url", variants)
          .limit(5)
      );
      if (exactRows.length > 0) return exactRows;

      const slug = normalized.split("/").filter(Boolean).at(-1);
      if (!slug) return [];
      const fuzzyRows = await queryCompanyRows(
        admin
          .from("company_db")
          .select(COMPANY_DB_IDENTITY_SELECT)
          .ilike("linkedin_url", `%/company/${escapePostgrestPattern(slug)}%`)
          .limit(10)
      );
      return fuzzyRows.filter(
        (row) => normalizeLinkedinCompanyUrl(row.linkedin_url ?? "") === normalized
      );
    },

    async findByNameToken(token) {
      const normalized = cleanText(token, 100);
      if (!normalized) return [];
      return queryCompanyRows(
        admin
          .from("company_db")
          .select(COMPANY_DB_IDENTITY_SELECT)
          .ilike("name", `%${escapePostgrestPattern(normalized)}%`)
          .limit(30)
      );
    },

    async findByNameTokens(tokens) {
      const normalizedTokens = tokens
        .map((token) => cleanText(token, 100))
        .filter(Boolean)
        .slice(0, 4);
      if (normalizedTokens.length < 2) return [];
      const orderedPattern = normalizedTokens
        .map(escapePostgrestPattern)
        .join("%");
      return queryCompanyRows(
        admin
          .from("company_db")
          .select(COMPANY_DB_IDENTITY_SELECT)
          .ilike("name", `%${orderedPattern}%`)
          .limit(50)
      );
    },

    async findByWebsiteDomain(url) {
      const identity = normalizedWebsiteIdentity(url);
      if (!identity) return [];
      const rows = await queryCompanyRows(
        admin
          .from("company_db")
          .select(COMPANY_DB_IDENTITY_SELECT)
          .ilike(
            "website_url",
            `%${escapePostgrestPattern(identity.hostname)}%`
          )
          .limit(50)
      );
      const sameHostRows = rows.filter(
        (row) => normalizedHostname(row.website_url) === identity.hostname
      );
      const samePathRows = sameHostRows.filter(
        (row) =>
          normalizedWebsiteIdentity(row.website_url)?.pathname ===
          identity.pathname
      );
      return samePathRows.length > 0 ? samePathRows : sameHostRows;
    },

    async findByExactName(name) {
      const normalized = normalizeName(name);
      if (!normalized) return [];
      const escaped = escapePostgrestPattern(cleanText(name, 300));
      const [companyRows, workspaceNameResult, workspacePublishedNameResult] =
        await Promise.all([
          queryCompanyRows(
            admin
              .from("company_db")
              .select(COMPANY_DB_IDENTITY_SELECT)
              .ilike("name", escaped)
              .limit(50)
          ),
          admin
            .from("company_workspace")
            .select("company_db_id,company_name")
            .not("company_db_id", "is", null)
            .ilike("company_name", escaped)
            .limit(8),
          admin
            .from("company_workspace")
            .select("company_db_id,published_name")
            .not("company_db_id", "is", null)
            .ilike("published_name", escaped)
            .limit(8),
        ]);

      for (const result of [workspaceNameResult, workspacePublishedNameResult]) {
        if (result.error) {
          throw new Error(
            result.error.message ?? "Failed to resolve company workspace name"
          );
        }
      }

      const workspaceCompanyIds = Array.from(
        new Set(
          [
            ...(workspaceNameResult.data ?? []),
            ...(workspacePublishedNameResult.data ?? []),
          ]
            .filter((row: any) =>
              normalizeName(row.company_name ?? row.published_name) === normalized
            )
            .map((row: any) => parsePositiveInteger(row.company_db_id))
            .filter((id): id is number => id !== null)
        )
      );
      const workspaceCompanyRows =
        workspaceCompanyIds.length > 0
          ? await queryCompanyRows(
              admin
                .from("company_db")
                .select(COMPANY_DB_IDENTITY_SELECT)
                .in("id", workspaceCompanyIds)
                .limit(50)
            )
          : [];

      const workspaceNamesByCompanyId = new Map<number, Set<string>>();
      for (const row of [
        ...(workspaceNameResult.data ?? []),
        ...(workspacePublishedNameResult.data ?? []),
      ]) {
        const companyDbId = parsePositiveInteger(row.company_db_id);
        const workspaceName = cleanText(
          "company_name" in row ? row.company_name : row.published_name,
          300
        );
        if (!companyDbId || !workspaceName) continue;
        const names = workspaceNamesByCompanyId.get(companyDbId) ?? new Set();
        names.add(workspaceName);
        workspaceNamesByCompanyId.set(companyDbId, names);
      }

      return dedupeRows([
        ...companyRows.filter((row) => normalizeName(row.name) === normalized),
        ...workspaceCompanyRows,
      ]).map((row) => ({
        ...row,
        workspace_names: [
          ...(workspaceNamesByCompanyId.get(row.id) ?? new Set<string>()),
        ],
      }));
    },
  };
}

function oneRow(rows: readonly CompanyDbIdentityRow[]) {
  const unique = dedupeRows(rows);
  return unique.length === 1 ? unique[0] : null;
}

function matchedExperience<T extends TalentExperienceCompanyResolutionInput>(
  experience: T,
  row: CompanyDbIdentityRow
): T {
  return {
    ...experience,
    company_id: row.id,
    company_link:
      normalizeLinkedinCompanyUrl(experience.company_link ?? "") ??
      normalizeLinkedinCompanyUrl(row.linkedin_url ?? "") ??
      experience.company_link ??
      row.website_url ??
      null,
    company_logo: row.logo ?? experience.company_logo ?? null,
  };
}

async function resolveFromKnownIdentity(args: {
  experience: TalentExperienceCompanyResolutionInput;
  lookup: CompanyIdentityLookup;
}) {
  const existingCompanyDbId = parsePositiveInteger(args.experience.company_id);
  if (existingCompanyDbId) {
    const row = oneRow(await args.lookup.findById(existingCompanyDbId));
    if (row) return { matchedBy: "existing_company_db_id" as const, row };
  }

  const linkedinCompanyId = parsePositiveInteger(
    args.experience.linkedin_company_id
  );
  if (linkedinCompanyId) {
    const row = oneRow(
      await args.lookup.findByLinkedinCompanyId(linkedinCompanyId)
    );
    if (row) return { matchedBy: "linkedin_company_id" as const, row };
  }

  const companyLink = cleanText(args.experience.company_link, 2_000);
  const linkedinUrl = normalizeLinkedinCompanyUrl(companyLink);
  if (linkedinUrl) {
    const row = oneRow(await args.lookup.findByLinkedinUrl(linkedinUrl));
    if (row) return { matchedBy: "linkedin_url" as const, row };
  } else {
    const domain = normalizedHostname(companyLink);
    if (domain) {
      const row = oneRow(await args.lookup.findByWebsiteDomain(companyLink));
      if (row) return { matchedBy: "website_domain" as const, row };
    }
  }

  return null;
}

function assistantText(response: any) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item: any) => String(item?.text ?? item?.content ?? ""))
    .join("")
    .trim();
}

function parseJsonObject(value: string) {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const objectStart = cleaned.indexOf("{");
  let objectEnd = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  if (objectStart >= 0) {
    for (let index = objectStart; index < cleaned.length; index += 1) {
      const character = cleaned[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          objectEnd = index + 1;
          break;
        }
      }
    }
  }
  const parsed = JSON.parse(
    objectStart >= 0 && objectEnd > objectStart
      ? cleaned.slice(objectStart, objectEnd)
      : cleaned
  ) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Company resolution response must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function parseJudgeMatches(
  value: Record<string, unknown>,
  cases: readonly CompanyIdentityJudgeCase[]
) {
  const candidateIdsByKey = new Map(
    cases.map((item) => [
      item.key,
      new Set(
        item.proposedCompanyDbId
          ? [item.proposedCompanyDbId]
          : item.candidates.map((candidate) => candidate.id)
      ),
    ])
  );
  const matches = new Map<string, number | null>(
    cases.map((item) => [item.key, null])
  );
  if (!Array.isArray(value.matches)) return matches;

  for (const item of value.matches) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const key = cleanText((item as any).key, 100);
    const candidateIds = candidateIdsByKey.get(key);
    if (!candidateIds) continue;
    const rawCompanyDbId = (item as any).companyDbId;
    if (rawCompanyDbId === null) {
      matches.set(key, null);
      continue;
    }
    const companyDbId = parsePositiveInteger(rawCompanyDbId);
    matches.set(
      key,
      companyDbId && candidateIds.has(companyDbId) ? companyDbId : null
    );
  }
  return matches;
}

function validateJudgeResponseShape(
  value: Record<string, unknown>,
  cases: readonly CompanyIdentityJudgeCase[]
) {
  if (!Array.isArray(value.matches)) {
    throw new Error("Company resolution response is missing matches");
  }
  const expectedKeys = new Set(cases.map((item) => item.key));
  const seenKeys = new Set<string>();
  for (const item of value.matches) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Company resolution match must be an object");
    }
    const key = cleanText((item as any).key, 100);
    const companyDbId = (item as any).companyDbId;
    if (
      !expectedKeys.has(key) ||
      seenKeys.has(key) ||
      (companyDbId !== null && parsePositiveInteger(companyDbId) === null)
    ) {
      throw new Error("Company resolution response has an invalid match");
    }
    seenKeys.add(key);
  }
  if (seenKeys.size !== expectedKeys.size) {
    throw new Error("Company resolution response omitted a case");
  }
}

function llmTimeoutMs() {
  const configured = Number(process.env.TALENT_COMPANY_RESOLUTION_LLM_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.max(2_000, Math.min(30_000, Math.floor(configured)))
    : DEFAULT_LLM_TIMEOUT_MS;
}

export function createGlmCompanyIdentityJudge(
  mode: "select" | "verify" = "select"
): CompanyIdentityJudge {
  return {
    async resolve(cases) {
      const [llm, modelConfig, usageLogging] = await Promise.all([
        import("@/lib/llm/llm"),
        import("@/lib/llm/modelConfig"),
        import("@/lib/llm/usageLogging"),
      ]);
      const startedAt = Date.now();
      const payload = cases.map((item) => ({
        candidates: item.candidates.map((candidate) => ({
          description: cleanText(
            candidate.description,
            MAX_LLM_COMPANY_DESCRIPTION_LENGTH
          ),
          id: candidate.id,
          linkedinCompanyId: candidate.linkedin_company_id,
          linkedinUrl: cleanText(candidate.linkedin_url, 500) || null,
          location: cleanText(candidate.location, 200) || null,
          name: cleanText(candidate.name, 300) || null,
          websiteUrl: cleanText(candidate.website_url, 500) || null,
          workspaceNames: (candidate.workspace_names ?? [])
            .map((name) => cleanText(name, 300))
            .filter(Boolean)
            .slice(0, 5),
        })),
        companyLocation: cleanText(item.companyLocation, 200) || null,
        companyName: item.companyName,
        key: item.key,
        proposedCompanyDbId: item.proposedCompanyDbId ?? null,
      }));
      const { model, response } = await llm.createChatCompletionWithFallback({
        anthropicOverloadFallbackModel: null,
        buildRequest: () => ({
          max_tokens: 3_000,
          messages: [
            {
              role: "system",
              content:
                mode === "verify"
                  ? [
                      "Audit each proposed resume-employer match with extreme precision.",
                      "Return its proposedCompanyDbId only when the proposal is the same exact organization and is the decisively canonical internal row among all supplied candidates; otherwise return null.",
                      "Never replace the proposal with another candidate during this audit.",
                      "Reject a proposal that is merely a client, product, parent, subsidiary, regional legal entity, business unit, group, program, related organization, or different same-name organization.",
                      "Every distinctive organization word and explicit legal, regional, or business-unit qualifier must be compatible or explained by evidence. A global parent is not a regional legal entity.",
                      "Reject non-organization wording and candidates whose own evidence says they are unofficial, unaffiliated, placeholders, or otherwise not authoritative.",
                      "A workspace link never overrides explicit evidence that the candidate page is unofficial, unaffiliated, or a placeholder; such a proposal must be rejected.",
                      "Among duplicate rows, a matching name, location, or bare numeric LinkedIn page without affirmative authoritative identity evidence is not enough to establish a canonical row.",
                      "If another row has competing workspace or official identity evidence and the canonical row is not decisive, reject the proposal as ambiguous.",
                      "False approval is much worse than abstention. When uncertain, return null.",
                      "Return one entry for every key and never return an ID other than that key's proposedCompanyDbId.",
                      'Return exactly {"matches":[{"key":"the input key","companyDbId":123 or null}]}.',
                    ].join(" ")
                  : [
                      "For each resume employer mention, select the same exact organization from only its supplied internal candidates, or null.",
                      "First decide whether the mention identifies a specific organization. Employment types, self-employment labels, confidential placeholders, projects, and other non-organization wording must be null.",
                      "Next eliminate candidates that are merely a client, product, parent, subsidiary, regional legal entity, business unit, group, program, or different same-name organization. A related organization is not the same employer.",
                      "Every distinctive organization word and explicit legal, regional, or business-unit qualifier must be compatible or explained by candidate evidence. Shared generic words or a rich official profile do not cure a scope mismatch.",
                      "A parenthetical client, project, or assignment qualifier after an otherwise exact employer name may be context rather than part of the employer identity.",
                      "Only after establishing the same exact organization, resolve duplicate internal rows by choosing the canonical record: Harper workspace linkage first, then coherent official website, LinkedIn company identity, and description evidence.",
                      "Do not prefer a sparse duplicate solely for a closer location, but do prefer an exact-entity sparse row over a well-populated row for a different parent, group, or affiliate.",
                      "A candidate description that says the page is unofficial, unaffiliated, a placeholder, or otherwise not authoritative is negative canonical-identity evidence.",
                      "If multiple rows for the same organization have competing workspace or official identity signals and no single row is decisively canonical, choose null rather than selecting one arbitrarily.",
                      "Location is supporting evidence and may be an office rather than headquarters.",
                      "Each candidate is only a retrieval hypothesis. Precision is much more important than recall; if exact identity or the canonical row is ambiguous, choose null.",
                      "Return one entry for every key. Never return an ID not supplied for that key.",
                      'Return exactly {"matches":[{"key":"the input key","companyDbId":123 or null}]}.',
                    ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({ cases: payload }),
            },
          ],
          temperature: 0,
        }),
        chatCompletionReasoning: { reasoningEffort: "high" },
        debugLabel: `talent-onboarding/company-resolution:${mode}`,
        fallbackModel: null,
        model: modelConfig.OPENROUTER_GLM_53_FLASH_MODEL,
        signal: AbortSignal.timeout(llmTimeoutMs()),
        structuredOutput: {
          name: "resume_company_resolution",
          schema: {
            additionalProperties: false,
            properties: {
              matches: {
                items: {
                  additionalProperties: false,
                  properties: {
                    companyDbId: { type: ["integer", "null"] },
                    key: { type: "string" },
                  },
                  required: ["key", "companyDbId"],
                  type: "object",
                },
                type: "array",
              },
            },
            required: ["matches"],
            type: "object",
          },
        },
        validateResponse: (candidate) => {
          validateJudgeResponseShape(
            parseJsonObject(assistantText(candidate)),
            cases
          );
        },
      });
      const usage = usageLogging.extractLlmTokenUsage(response);
      const cost = usageLogging.estimateLlmUsageCost(model, usage);
      return {
        costUsd: cost?.estimatedCostUsd ?? 0,
        inputTokens: usage.inputTokens ?? 0,
        latencyMs: Date.now() - startedAt,
        matches: parseJudgeMatches(
          parseJsonObject(assistantText(response)),
          cases
        ),
        model,
        outputTokens: usage.outputTokens ?? 0,
      };
    },
  };
}

function companySearchQuery(experience: TalentExperienceCompanyResolutionInput) {
  const companyName = cleanText(experience.company_name, 300);
  const companyLocation = cleanText(experience.company_location, 200);
  return [
    `Find the exact company named "${companyName}".`,
    companyLocation ? `It is associated with ${companyLocation}.` : "",
    "Return the official company website or official LinkedIn company page, not a person profile or an article about a similarly named company.",
  ]
    .filter(Boolean)
    .join(" ");
}

function exaCost(response: any) {
  const cost = Number(response?.costDollars?.total);
  if (Number.isFinite(cost) && cost >= 0) return cost;
  const configured = Number(
    process.env.TALENT_COMPANY_RESOLUTION_EXA_SEARCH_COST_USD
  );
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_EXA_SEARCH_COST_USD;
}

function exaSearchTimeoutMs() {
  const configured = Number(
    process.env.TALENT_COMPANY_RESOLUTION_EXA_TIMEOUT_MS
  );
  return Number.isFinite(configured)
    ? Math.max(1_000, Math.min(30_000, Math.floor(configured)))
    : DEFAULT_EXA_SEARCH_TIMEOUT_MS;
}

async function resolveFromExa(args: {
  exa: ExaSearchClient;
  experience: TalentExperienceCompanyResolutionInput;
  lookup: CompanyIdentityLookup;
}) {
  const companyName = cleanText(args.experience.company_name, 300);
  const exactNameCandidates = companyName
    ? await findNameCandidates(args.lookup, companyName)
    : [];
  const exactNameCandidateIds = new Set(
    exactNameCandidates.map((row) => row.id)
  );
  const inputNameKey = entityNameKey(companyName);
  const strongestCompetingLocationEvidence = exactNameCandidates.reduce(
    (strongest, row) =>
      Math.max(
        strongest,
        locationEvidenceScore(args.experience.company_location, row.location)
      ),
    0
  );
  const acceptsCandidate = (row: CompanyDbIdentityRow) => {
    const rowNameKey = entityNameKey(row.name);
    const nameMatches =
      exactNameCandidateIds.has(row.id) ||
      (inputNameKey.length >= 10 && rowNameKey === inputNameKey);
    if (!nameMatches) return false;
    const selectedLocationEvidence = locationEvidenceScore(
      args.experience.company_location,
      row.location
    );
    return selectedLocationEvidence >= strongestCompetingLocationEvidence;
  };
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const response = await Promise.race([
    (args.exa as any).search(companySearchQuery(args.experience), {
      type: "fast",
      category: "company",
      numResults: EXA_RESULTS_PER_COMPANY,
    }),
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Exa company search timed out")),
        exaSearchTimeoutMs()
      );
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
  const exaLatencyMs = Date.now() - startedAt;
  const matches = new Map<
    number,
    { matchedBy: "exa_linkedin_url" | "exa_website_domain"; row: CompanyDbIdentityRow }
  >();

  for (const result of Array.isArray(response?.results) ? response.results : []) {
    const url = cleanText(result?.url, 2_000);
    if (!url) continue;
    const linkedinUrl = normalizeLinkedinCompanyUrl(url);
    if (linkedinUrl) {
      const row = oneRow(await args.lookup.findByLinkedinUrl(linkedinUrl));
      if (row && acceptsCandidate(row)) {
        matches.set(row.id, { matchedBy: "exa_linkedin_url", row });
      }
      continue;
    }

    const domain = normalizedHostname(url);
    if (!domain) continue;
    const row = oneRow(await args.lookup.findByWebsiteDomain(url));
    if (row && acceptsCandidate(row)) {
      matches.set(row.id, { matchedBy: "exa_website_domain", row });
    }
  }

  const uniqueMatch = matches.size === 1 ? [...matches.values()][0] : null;
  return {
    exaCostUsd: exaCost(response),
    exaLatencyMs,
    match: uniqueMatch,
  };
}

type ExaResolution = Awaited<ReturnType<typeof resolveFromExa>>;

function externalSearchLimit(value: number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(10, Math.floor(value)));
  }
  const configured = Number(
    process.env.TALENT_COMPANY_RESOLUTION_MAX_EXA_SEARCHES
  );
  return Number.isFinite(configured)
    ? Math.max(0, Math.min(10, Math.floor(configured)))
    : DEFAULT_MAX_EXTERNAL_SEARCHES;
}

export async function resolveTalentExperienceCompanies<
  T extends TalentExperienceCompanyResolutionInput,
>(
  args: ResolveTalentExperienceCompaniesArgs<T>
): Promise<TalentExperienceCompanyResolutionResult<T>> {
  const startedAt = Date.now();
  const lookup =
    args.lookup ??
    (args.admin ? createSupabaseCompanyIdentityLookup(args.admin) : null);
  if (!lookup) {
    throw new Error("admin or lookup is required for company resolution");
  }

  const enableExternalSearch = args.enableExternalSearch === true;
  const enableLlmResolution = args.enableLlmResolution !== false;
  const maxExternalSearches = externalSearchLimit(args.maxExternalSearches);
  let exa = args.exa;
  if (enableExternalSearch && maxExternalSearches > 0 && !exa) {
    try {
      exa = getExaClient();
    } catch (error) {
      logger.log("[TalentCompanyResolution] Exa unavailable; using internal identity only", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const experiences = [...args.experiences];
  const diagnostics: TalentExperienceCompanyResolutionDiagnostic[] = [];
  const unresolvedIndexes: number[] = [];

  const directResults = await Promise.all(
    experiences.map(async (experience, index) => {
      const itemStartedAt = Date.now();
      const resolved = await resolveFromKnownIdentity({ experience, lookup });
      return { index, itemLatencyMs: Date.now() - itemStartedAt, resolved };
    })
  );

  for (const { index, itemLatencyMs, resolved } of directResults) {
    const experience = experiences[index];
    if (resolved) {
      experiences[index] = matchedExperience(experience, resolved.row);
      diagnostics[index] = {
        companyDbId: resolved.row.id,
        companyName: experience.company_name,
        exaCostUsd: 0,
        exaLatencyMs: 0,
        exaSearchAttempted: false,
        llmCandidateIds: [],
        llmResolutionAttempted: false,
        matchedBy: resolved.matchedBy,
        totalLatencyMs: itemLatencyMs,
      };
    } else {
      unresolvedIndexes.push(index);
      diagnostics[index] = {
        companyDbId: null,
        companyName: experience.company_name,
        exaCostUsd: 0,
        exaLatencyMs: 0,
        exaSearchAttempted: false,
        llmCandidateIds: [],
        llmResolutionAttempted: false,
        matchedBy: "unresolved",
        totalLatencyMs: itemLatencyMs,
      };
    }
  }

  let llmCalls = 0;
  let llmCostUsd = 0;
  let llmInputTokens = 0;
  let llmModel: string | null = null;
  let llmOutputTokens = 0;
  if (enableLlmResolution && unresolvedIndexes.length > 0) {
    try {
      const candidateEntries = await Promise.all(
        unresolvedIndexes.map(async (index) => ({
          candidates: await findLlmCandidates({
            experience: experiences[index],
            lookup,
          }),
          index,
        }))
      );
      const cases = candidateEntries
        .filter((entry) => entry.candidates.length > 0)
        .map((entry) => ({
          candidates: entry.candidates,
          companyLocation: experiences[entry.index].company_location,
          companyName: cleanText(experiences[entry.index].company_name, 300),
          key: String(entry.index),
        }));

      if (cases.length > 0) {
        const selectionJudge =
          args.judge ?? createGlmCompanyIdentityJudge("select");
        const verificationJudge =
          args.judge ?? createGlmCompanyIdentityJudge("verify");
        for (const item of cases) {
          diagnostics[Number(item.key)].llmCandidateIds = item.candidates.map(
            (candidate) => candidate.id
          );
        }
        const judgeStartedAt = Date.now();
        llmCalls += 1;
        const selection = await selectionJudge.resolve(cases);
        llmCostUsd += selection.costUsd;
        llmInputTokens += selection.inputTokens;
        llmModel = selection.model;
        llmOutputTokens += selection.outputTokens;
        const candidatesByKey = new Map(
          cases.map((item) => [
            item.key,
            new Map(item.candidates.map((candidate) => [candidate.id, candidate])),
          ])
        );
        const verificationCases = cases.flatMap((item) => {
          const proposedCompanyDbId = selection.matches.get(item.key) ?? null;
          return proposedCompanyDbId &&
            candidatesByKey.get(item.key)?.has(proposedCompanyDbId)
            ? [{ ...item, proposedCompanyDbId }]
            : [];
        });
        let verifications: CompanyIdentityJudgeResult[] = [];
        if (verificationCases.length > 0) {
          llmCalls += LLM_AUDIT_PASSES;
          verifications = await Promise.all(
            Array.from({ length: LLM_AUDIT_PASSES }, () =>
              verificationJudge.resolve(verificationCases)
            )
          );
          for (const verification of verifications) {
            llmCostUsd += verification.costUsd;
            llmInputTokens += verification.inputTokens;
            llmModel = verification.model;
            llmOutputTokens += verification.outputTokens;
          }
        }
        const judgeLatencyMs = Date.now() - judgeStartedAt;
        for (const item of cases) {
          const index = Number(item.key);
          const diagnostic = diagnostics[index];
          diagnostic.llmResolutionAttempted = true;
          diagnostic.totalLatencyMs += judgeLatencyMs;
        }
        for (const item of verificationCases) {
          const selectedId = item.proposedCompanyDbId;
          if (
            !selectedId ||
            verifications.length !== LLM_AUDIT_PASSES ||
            !verifications.every(
              (verification) =>
                verification.matches.get(item.key) === selectedId
            )
          ) {
            continue;
          }
          const selected = candidatesByKey.get(item.key)?.get(selectedId);
          if (!selected) continue;
          const index = Number(item.key);
          experiences[index] = matchedExperience(experiences[index], selected);
          diagnostics[index].companyDbId = selected.id;
          diagnostics[index].matchedBy = "glm_candidate_selection";
        }
      }
    } catch (error) {
      logger.log("[TalentCompanyResolution] GLM candidate selection failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let exaSearches = 0;
  let exaCostUsd = 0;
  if (exa && enableExternalSearch && maxExternalSearches > 0) {
    const searchedKeys = new Map<string, Promise<ExaResolution>>();
    const indexesBySearchKey = new Map<string, number[]>();

    for (const index of unresolvedIndexes.filter(
      (candidateIndex) => diagnostics[candidateIndex].matchedBy === "unresolved"
    )) {
      const experience = experiences[index];
      const companyName = cleanText(experience.company_name, 300);
      if (!companyName) continue;
      const key = `${normalizeName(companyName)}|${normalizeName(
        experience.company_location
      )}`;
      const indexes = indexesBySearchKey.get(key) ?? [];
      indexes.push(index);
      indexesBySearchKey.set(key, indexes);
      if (searchedKeys.has(key) || searchedKeys.size >= maxExternalSearches)
        continue;
      searchedKeys.set(
        key,
        resolveFromExa({ exa, experience, lookup }).catch((error) => {
          logger.log("[TalentCompanyResolution] Exa lookup failed", {
            companyName,
            error: error instanceof Error ? error.message : String(error),
          });
          return { exaCostUsd: 0, exaLatencyMs: 0, match: null };
        })
      );
    }

    const searchResults = await Promise.all(
      [...searchedKeys.entries()].map(async ([key, search]) => ({
        external: await search,
        key,
      }))
    );
    exaSearches = searchResults.length;
    exaCostUsd = searchResults.reduce(
      (sum, item) => sum + item.external.exaCostUsd,
      0
    );

    for (const { external, key } of searchResults) {
      for (const index of indexesBySearchKey.get(key) ?? []) {
        const experience = experiences[index];
        const diagnostic = diagnostics[index];
        diagnostic.exaCostUsd = external.exaCostUsd;
        diagnostic.exaLatencyMs = external.exaLatencyMs;
        diagnostic.exaSearchAttempted = true;
        diagnostic.totalLatencyMs += external.exaLatencyMs;
        if (external.match) {
          experiences[index] = matchedExperience(experience, external.match.row);
          diagnostic.companyDbId = external.match.row.id;
          diagnostic.matchedBy = external.match.matchedBy;
        }
      }
    }
  }

  const matched = diagnostics.filter(
    (item) => item.matchedBy !== "unresolved"
  ).length;
  return {
    diagnostics,
    experiences,
    summary: {
      exaCostUsd,
      exaSearches,
      llmCalls,
      llmCostUsd,
      llmInputTokens,
      llmModel,
      llmOutputTokens,
      matched,
      total: experiences.length,
      unresolved: experiences.length - matched,
      wallTimeMs: Date.now() - startedAt,
    },
  };
}
