/**
 * Roles prepared for a /jobs posting with no Harper Role behind it (Shaun 11/27). Such a posting (a multi-company
 * posting, or a single-company one whose role is not open in Harper) used to open Harper's first message with "I'll
 * find opportunities like it", and the similar postings came minutes after the person's first reply; 6 of 183 who
 * signed up from one were introduced within 7 days, against 118 of 370 from a posting with a Harper Role.
 *
 * Once a day (preparedRoles.server.ts) each such posting gets the Harper-connected Roles close to it (from the Roles
 * Harper's own outreach may propose to people who are not members, gtmPlays/agent/match.server.ts internalRoles) and
 * open public postings like it (Career's posting search). Career reads the ones still open when the person signs up
 * from that posting (career/postOnboardingContext.ts), and Harper chooses from them what fits that person.
 *
 * Pure, and light enough for Career's turn: what is kept and how it is read back. The build's own rules are in
 * preparedRolesBuild.ts.
 */
import { isOfficialJobFollowUpRoleAvailable } from "./followUpAvailability";

export const OFFICIAL_JOB_PREPARED_ROLES_TABLE = "official_job_prepared_roles";

/** Public postings kept per posting: enough that some stay open between two daily builds. */
export const PREPARED_PUBLIC_POSTINGS = 20;
/** Harper-connected Roles kept per posting. */
export const PREPARED_HARPER_ROLES_MAX = 3;
/** What Harper reads of them in a conversation: the best ones still open. */
export const PREPARED_PUBLIC_POSTINGS_SHOWN = 10;

export type PreparedRoleKind = "harper" | "public";

/** The /jobs posting as its public page shows it. */
export type PreparedRolesPosting = {
  id: string;
  slug: string;
  companyName: string | null;
  roleTitle: string | null;
  location: string | null;
  vertical: string | null;
  employmentType: string | null;
  seniority: string | null;
  shortDescription: string | null;
  roleDescription: string | null;
};

/** A Harper-connected Role the pick may choose: its own public text only (never a customer's private brief). */
export type PreparedRolesHarperCandidate = {
  roleId: string;
  companyName: string;
  title: string;
  location: string | null;
  description: string;
};

const REASON_CHARS = 300;

function oneLine(value: string | null | undefined, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

const CLOSED_PUBLIC_STATUSES = new Set(["expired", "closed", "inactive", "archived", "ended"]);

/** A prepared row as Career reads it back, with the Role's current state. */
export type PreparedRoleRead = {
  role_id: string;
  kind: string;
  rank: number;
  reason: string | null;
  prepared_at: string;
  role: {
    name: string | null;
    status: string | null;
    is_expired: boolean | null;
    expires_at: string | null;
    source_type: string | null;
    location_text: string | null;
    information: unknown;
    company: { company_name: string | null } | null;
  } | null;
};

export type PreparedForPosting = {
  preparedAt: string;
  harperRoles: Array<{ roleId: string; companyName: string; roleTitle: string; reason: string | null }>;
  publicPostings: Array<{ roleId: string; companyName: string; roleTitle: string; location: string | null }>;
};

function isTestOnly(information: unknown) {
  if (!information || typeof information !== "object" || Array.isArray(information)) return false;
  const value = (information as Record<string, unknown>).testOnly;
  return value === true || (typeof value === "string" && ["true", "1", "yes", "on"].includes(value.trim().toLowerCase()));
}

/**
 * The prepared Roles that are still open now, best first: a Role that closed since the build is left out (the daily
 * build replaces it). Null when nothing is left.
 */
export function livePreparedRoles(
  rows: readonly PreparedRoleRead[],
  args: { nowMs?: number } = {}
): PreparedForPosting | null {
  const nowMs = args.nowMs ?? Date.now();
  const ordered = [...rows].sort((a, b) => a.rank - b.rank);
  const harperRoles: PreparedForPosting["harperRoles"] = [];
  const publicPostings: PreparedForPosting["publicPostings"] = [];
  for (const row of ordered) {
    const role = row.role;
    const companyName = oneLine(role?.company?.company_name, 160);
    const roleTitle = oneLine(role?.name, 200);
    if (!role || !companyName || !roleTitle || isTestOnly(role.information)) continue;
    const sourceType = String(role.source_type ?? "").trim().toLowerCase();
    if (row.kind === "harper") {
      if (sourceType !== "internal" || harperRoles.length >= PREPARED_HARPER_ROLES_MAX) continue;
      if (!isOfficialJobFollowUpRoleAvailable({
        expiresAt: role.expires_at, isExpired: Boolean(role.is_expired), status: String(role.status ?? ""), nowMs,
      })) continue;
      harperRoles.push({ roleId: row.role_id, companyName, roleTitle, reason: oneLine(row.reason, REASON_CHARS) || null });
    } else if (row.kind === "public") {
      if (sourceType !== "external" || publicPostings.length >= PREPARED_PUBLIC_POSTINGS_SHOWN) continue;
      const expiresMs = role.expires_at ? Date.parse(role.expires_at) : NaN;
      if (role.is_expired || (Number.isFinite(expiresMs) && expiresMs <= nowMs)
        || CLOSED_PUBLIC_STATUSES.has(String(role.status ?? "").trim().toLowerCase())) continue;
      publicPostings.push({
        roleId: row.role_id, companyName, roleTitle,
        location: oneLine(role.location_text, 120) || null,
      });
    }
  }
  if (!harperRoles.length && !publicPostings.length) return null;
  const preparedAt = ordered.map((row) => row.prepared_at).sort().at(-1) ?? new Date(nowMs).toISOString();
  return { preparedAt, harperRoles, publicPostings };
}
