/**
 * The daily build's rules for officialJobs/preparedRoles.ts: Career's plan prompt and parser for one posting, the
 * Harper-connected Roles it may choose, and the rows one build writes. Pure: the builder and the tests share them.
 */
import { planDecisionSchema } from "@/lib/externalRecommendationsV2/contract";
import type { V2SearchPlan } from "@/lib/externalRecommendationsV2/countries";
import { parsePlan } from "@/lib/externalRecommendationsV2/engine";
import { PLAN_PROMPT } from "@/lib/externalRecommendationsV2/prompts";
import { withOutreachRecency } from "@/lib/gtmPlays/agent/match";
import {
  PREPARED_HARPER_ROLES_MAX,
  PREPARED_PUBLIC_POSTINGS,
  type PreparedRoleKind,
  type PreparedRolesHarperCandidate,
  type PreparedRolesPosting,
} from "./preparedRoles";

export type PreparedRolesPick = {
  plan: V2SearchPlan;
  targetSalaryKrw: number | null;
  harperRoles: Array<{ roleId: string; reason: string }>;
};

const POSTING_TEXT_CHARS = 3_000;
const CANDIDATE_TEXT_CHARS = 500;
const REASON_CHARS = 300;

function oneLine(value: string | null | undefined, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Career's plan prompt, for a posting instead of a person, plus the pick of Harper-connected Roles. Both read only
 * public job text: no person is involved yet.
 */
export const PREPARED_ROLES_PROMPT = `${PLAN_PROMPT}

JOB PAGE POSTING
The Brief is one public posting on Harper's job page, not a person. No Harper Role is behind it: it describes a kind of role at several companies, or a role whose company does not take introductions through Harper now. People who are drawn to it sign up with Harper. Plan a search for public postings of the same kind of role (role family, level, domain) in the posting's places, as such a person would want; the posting itself is the current request. Use defaultAction=explore and targetSalaryKrw only when the posting states pay.

HARPER-CONNECTED ROLES
harper_roles lists open roles at companies that take introductions through Harper. Choose at most ${PREPARED_HARPER_ROLES_MAX} that a person drawn to this posting would also want to hear about: the same kind of work at a compatible level, in a place they could work. Choose none when none is close; a near miss does not help them. Add a top-level "harperRoles": [{"roleId": "...", "reason": "one short sentence in Korean on why it is close to the posting"}], best first, roleIds exactly as listed.`;

export function buildPreparedRolesInput(
  posting: PreparedRolesPosting,
  candidates: readonly PreparedRolesHarperCandidate[]
) {
  const brief = [
    `Posting title: ${oneLine(posting.roleTitle, 200) || "not given"}`,
    `Shown as: ${oneLine(posting.companyName, 200) || "not given"}`,
    posting.location ? `Location: ${oneLine(posting.location, 160)}` : "",
    posting.vertical ? `Domain: ${oneLine(posting.vertical, 120)}` : "",
    posting.employmentType ? `Employment type: ${oneLine(posting.employmentType, 80)}` : "",
    posting.seniority ? `Level: ${oneLine(posting.seniority, 120)}` : "",
    posting.shortDescription ? `Summary: ${oneLine(posting.shortDescription, 400)}` : "",
    posting.roleDescription ? `Posting text:\n${posting.roleDescription.trim().slice(0, POSTING_TEXT_CHARS)}` : "",
  ].filter(Boolean).join("\n");
  const roles = candidates.length
    ? candidates.map((role) => [
        `- roleId ${role.roleId} | ${oneLine(role.companyName, 120)} | ${oneLine(role.title, 160)}${role.location ? ` | ${oneLine(role.location, 120)}` : ""}`,
        `  ${oneLine(role.description, CANDIDATE_TEXT_CHARS)}`,
      ].join("\n")).join("\n")
    : "(none open now)";
  return `<brief>\n${brief}\n</brief>\n\n<harper_roles>\n${roles}\n</harper_roles>`;
}

/** The planner's envelope: Career's plan with the outreach 90-day posting limit, and the known Harper Roles it chose. */
export function parsePreparedRolesPick(
  raw: unknown,
  candidateRoleIds: ReadonlySet<string>
): PreparedRolesPick {
  const decision = planDecisionSchema.parse(raw);
  if (!decision.plan) throw new Error("planner gave no plan");
  const record = raw as Record<string, unknown>;
  const listed = Array.isArray(record.harperRoles) ? record.harperRoles : [];
  const harperRoles: PreparedRolesPick["harperRoles"] = [];
  for (const item of listed) {
    if (!item || typeof item !== "object") continue;
    const roleId = oneLine((item as Record<string, unknown>).roleId as string, 64);
    const reason = oneLine((item as Record<string, unknown>).reason as string, REASON_CHARS);
    if (!candidateRoleIds.has(roleId) || harperRoles.some((role) => role.roleId === roleId)) continue;
    harperRoles.push({ roleId, reason });
    if (harperRoles.length >= PREPARED_HARPER_ROLES_MAX) break;
  }
  return {
    plan: withOutreachRecency(parsePlan(decision.plan)),
    targetSalaryKrw: decision.targetSalaryKrw,
    harperRoles,
  };
}

export type PreparedRoleRow = {
  official_job_id: string;
  role_id: string;
  kind: PreparedRoleKind;
  rank: number;
  reason: string | null;
  prepared_at: string;
};

/** One build's rows for a posting, all with the build's time (older rows of the posting are removed after). */
export function preparedRoleRows(args: {
  postingId: string;
  harperRoles: PreparedRolesPick["harperRoles"];
  publicRoleIds: readonly string[];
  preparedAt: string;
}): PreparedRoleRow[] {
  const seen = new Set<string>();
  const rows: PreparedRoleRow[] = [];
  const add = (roleId: string, kind: PreparedRoleKind, reason: string | null) => {
    if (!roleId || seen.has(roleId)) return;
    seen.add(roleId);
    rows.push({
      official_job_id: args.postingId,
      role_id: roleId,
      kind,
      rank: rows.filter((row) => row.kind === kind).length,
      reason,
      prepared_at: args.preparedAt,
    });
  };
  for (const role of args.harperRoles) add(role.roleId, "harper", role.reason || null);
  for (const roleId of args.publicRoleIds.slice(0, PREPARED_PUBLIC_POSTINGS)) add(roleId, "public", null);
  return rows;
}
