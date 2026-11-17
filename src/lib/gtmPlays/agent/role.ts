/**
 * #5 "Role로 사람 찾기": one Role, people from Harper members, the external search and the scraped profile DB, one
 * mail each about that Role (as #4's 후보 메일). Pure: which Role every record names, the run's settings, and whether a
 * customer already has the person for the same Role, so the run, the screen and the tests share them.
 */
import { GTM_ROLE_PURPOSE, GTM_WORKSPACE_ID } from "../constants";
import { cleanEmail, cleanProfileUrl } from "./people";
import type { AgentCandidateSource } from "./types";

/** A company_roles row as the target needs it. */
export type AgentRoleRow = {
  roleId: string;
  workspaceId: string;
  information: unknown;
};

/**
 * Which Role a Role run works with:
 *   mailRoleId    the Role every record names (the mail's role_id, its posting, the person row, the claim): a customer's
 *                 real Role whenever the Role is one or is a GTM copy of one, else the GTM Role itself
 *   searchRoleId  the 'Harper GTM' Role the external search runs on and whose external_candidates it reads (the search
 *                 needs a GTM Role); null for a customer Role that has no GTM copy yet
 *   customer      mailRoleId is a customer's Role: the company-side check applies and the company name is the customer's
 */
export type AgentRoleTarget = {
  mailRoleId: string;
  searchRoleId: string | null;
  customer: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** A 'Harper GTM' Role (made on /ops GTM plays). */
export function isGtmRole(row: Pick<AgentRoleRow, "workspaceId" | "information">): boolean {
  return row.workspaceId === GTM_WORKSPACE_ID && record(row.information).purpose === GTM_ROLE_PURPOSE;
}

/** The customer Role a GTM Role was copied from (information.gtm.sourceRoleId), if it was. */
export function gtmSourceRoleId(row: Pick<AgentRoleRow, "workspaceId" | "information">): string | null {
  if (!isGtmRole(row)) return null;
  const gtm = record(record(row.information).gtm);
  const id = typeof gtm.sourceRoleId === "string" ? gtm.sourceRoleId.trim() : "";
  return gtm.source === "customer_role" && /^[0-9a-f-]{36}$/i.test(id) ? id.toLowerCase() : null;
}

/**
 * The one place that maps a Role to the Role the records use (team rule 11/17: a customer Role always means the real
 * Role). `copy`: for a customer Role, its GTM copy when there is one (found by the caller).
 */
export function agentRoleTarget(row: AgentRoleRow, copy?: { roleId: string } | null): AgentRoleTarget {
  if (isGtmRole(row)) {
    const source = gtmSourceRoleId(row);
    return source
      ? { mailRoleId: source, searchRoleId: row.roleId, customer: true }
      : { mailRoleId: row.roleId, searchRoleId: row.roleId, customer: false };
  }
  return { mailRoleId: row.roleId, searchRoleId: copy?.roleId ?? null, customer: true };
}

// ---------------------------------------------------------------------------------------------------------------
// The run's settings (gtm_agent_runs.params)

export type RoleRunSource = { enabled: boolean; max: number };

export type RoleRunParams = {
  searchRoleId: string | null;
  /** How Ops reads the Role (its GTM name), for the run list and the people filter. */
  roleName: string | null;
  sources: Record<AgentCandidateSource, RoleRunSource>;
  /** Scraped DB keywords; empty: written from the Role when the search runs (LLM 1회). */
  keywords: string[];
  koreanOnly: boolean;
  language: "ko" | "en";
  /** "찾기만": every mail stops at a draft for approval, whatever the approval setting. */
  draftOnly: boolean;
  /** What the searches left for later ticks. */
  state: {
    external?: {
      /** requested: the search was asked for; waiting for its run. lookups: candidate ids whose email lookup this run asked for. */
      phase: "requested" | "lookups" | "done";
      sourcingRunId?: string | null;
      /** When the search (then the lookups) was asked for: an unfinished one counts as finished after a wait. */
      requestedAt?: string | null;
      note?: string | null;
      lookups?: string[];
    };
    usedKeywords?: string[];
    /** The run's one mail draft (#4: one subject and body for everyone; each person's own line goes first). */
    mail?: { subject: string; body: string };
  };
};

/** At most this many people per source and run; the external email lookups cost about $0.12 each. */
export const ROLE_RUN_MAX = { member: 50, scraped: 50, external: 20 } as const;
export const ROLE_RUN_DEFAULTS = { member: 20, scraped: 20, external: 5 } as const;
export const EMAIL_LOOKUP_USD = 0.12;

const count = (value: unknown, fallback: number, max: number) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : fallback;
};

/** The run's settings from what the screen sent (anything missing or out of range falls back to the defaults). */
export function roleRunParams(input: {
  searchRoleId: string | null;
  roleName?: string | null;
  sources?: Partial<Record<AgentCandidateSource, Partial<RoleRunSource>>>;
  keywords?: readonly string[] | null;
  koreanOnly?: boolean;
  language?: "ko" | "en";
  draftOnly?: boolean;
}): RoleRunParams {
  const source = (key: AgentCandidateSource): RoleRunSource => {
    const given = input.sources?.[key];
    const max = count(given?.max, ROLE_RUN_DEFAULTS[key], ROLE_RUN_MAX[key]);
    return { enabled: Boolean(given?.enabled) && max > 0, max };
  };
  const keywords = [...new Set((input.keywords ?? []).map((item) => String(item).trim()).filter((item) => item.length >= 2))].slice(0, 6);
  const sources = { member: source("member"), scraped: source("scraped"), external: source("external") };
  // The external search needs the GTM Role.
  if (!input.searchRoleId) sources.external = { ...sources.external, enabled: false };
  return {
    searchRoleId: input.searchRoleId,
    roleName: input.roleName?.trim().slice(0, 200) || null,
    sources,
    keywords,
    koreanOnly: input.koreanOnly !== false,
    language: input.language === "en" ? "en" : "ko",
    draftOnly: Boolean(input.draftOnly),
    state: {},
  };
}

/** A stored params object read back (older or partial rows included). */
export function readRoleRunParams(value: unknown): RoleRunParams {
  const raw = record(value);
  const sources = record(raw.sources) as Partial<Record<AgentCandidateSource, Partial<RoleRunSource>>>;
  const params = roleRunParams({
    searchRoleId: typeof raw.searchRoleId === "string" ? raw.searchRoleId : null,
    roleName: typeof raw.roleName === "string" ? raw.roleName : null,
    sources, keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : [],
    koreanOnly: raw.koreanOnly !== false, language: raw.language === "en" ? "en" : "ko", draftOnly: raw.draftOnly === true,
  });
  return { ...params, state: record(raw.state) as RoleRunParams["state"] };
}

/** Run counts after one more tick: numbers add up (a jsonb merge alone would keep only the last tick's). */
export function sumCounts(current: Record<string, number>, added: Record<string, number>): Record<string, number> {
  const next = { ...current };
  for (const [key, value] of Object.entries(added)) {
    const sum = Number(next[key] ?? 0) + Number(value ?? 0);
    next[key] = Math.round(sum * 1_000_000) / 1_000_000;
  }
  return next;
}

/** The next source a Role run searches (one per tick), or null when every enabled source is done. */
export function nextRoleSource(params: RoleRunParams, counts: Record<string, number>): AgentCandidateSource | null {
  if (params.sources.member.enabled && !counts.searched_member) return "member";
  if (params.sources.scraped.enabled && !counts.searched_scraped) return "scraped";
  if (params.sources.external.enabled && params.state.external?.phase !== "done") return "external";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// One person, one path per posting

/** What the company side already has for the same customer Role: a connection request, or a person shown to them. */
export type CompanySideRow = {
  kind: "intro" | "shown";
  linkedinUrl: string | null;
  emails: readonly (string | null)[];
};

/**
 * Whether the company already has this person for the Role (then Harper does not also mail them about it): the same
 * address or the same LinkedIn profile on a connection request or a shown external candidate. Returns which.
 */
export function companySideConflict(
  person: { email: string | null; profileUrl: string | null },
  rows: readonly CompanySideRow[],
): "intro" | "shown" | null {
  const email = cleanEmail(person.email);
  const profile = cleanProfileUrl(person.profileUrl);
  if (!email && !profile) return null;
  let found: "intro" | "shown" | null = null;
  for (const row of rows) {
    const same = (email && row.emails.some((item) => cleanEmail(item) === email))
      || (profile && cleanProfileUrl(row.linkedinUrl) === profile);
    if (!same) continue;
    if (row.kind === "intro") return "intro";
    found = "shown";
  }
  return found;
}
