import "server-only";

import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  externalCandidatesForCompany,
  type ExternalCandidateView,
} from "@/lib/org/agent/externalSourcing";
import {
  listExternalCandidateStatuses,
  listShownExternalCandidates,
  requestExternalEmailLookup,
  requestExternalSourcing,
} from "@/lib/org/agent/externalSourcing.server";
import { throwBillingDbError } from "@/lib/org/billing/store";
import { GTM_ROLE_PURPOSE, GTM_WRITES_OFF_MESSAGE, GTM_WORKSPACE_ID, gtmWritesEnabled } from "./constants";
import { findInternalMatches } from "./pool.server";
import { gtmCompanyDescription } from "./publicName.server";
import {
  gtmMemberSearchJd,
  gtmRoleKey,
  gtmRolePlan,
  splitGtmSearchRequest,
  type GtmBrief,
  type GtmJd,
} from "./shared";

export { gtmRolePlan };

type Admin = ReturnType<typeof getSupabaseAdmin>;

export type GtmRoleSummary = {
  roleId: string;
  name: string;
  status: string;
  kind: "gtm" | "harper";
  companyName: string | null;
  /** Where a GTM Role's JD came from: a Harper customer's Role, an external posting URL, or pasted text. */
  source: "customer_role" | "url" | "text" | null;
  sourceRoleId: string | null;
  createdAt: string;
  search: { status: string; startedAt: string; finishedAt: string | null } | null;
  shown: number;
  requested: number;
};

export type GtmRoleDetail = GtmRoleSummary & {
  request: string | null;
  /** GTM Roles: Chris's base text and extra instructions; together they make `request`. */
  baseRequest: string;
  extraRequest: string;
  criteria: Array<{ id?: string; name: string; criteria: string; requirement?: string; importance?: number }>;
  /** The posting's own link and text, for the candidate mail (the link goes into their inbox). */
  postingUrl: string | null;
  description: string | null;
  candidates: ExternalCandidateView[];
  /** Everyone shown, passed people included, with request state. */
  statuses: Array<{ id: string; name: string | null; decision: string | null; introStatus: string | null; contactStatus: string | null }>;
};

export { GtmWritesOffError } from "./constants";

function assertWrites() {
  if (!gtmWritesEnabled()) throw new GtmWritesOffError();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type RoleRow = {
  role_id: string; name: string; status: string; created_at: string; information: unknown;
};

async function loadHarperRoles(admin: Admin, roleId?: string) {
  let query = admin.from("company_roles").select("role_id,name,status,created_at,information")
    .eq("company_workspace_id", GTM_WORKSPACE_ID).eq("source_type", "internal").neq("status", "deleted")
    .order("created_at", { ascending: false }).limit(60);
  if (roleId) query = query.eq("role_id", roleId);
  const { data, error } = await query.returns<RoleRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function summarize(admin: Admin, row: RoleRow): Promise<GtmRoleSummary & { hasRuns: boolean }> {
  const info = record(row.information);
  const gtm = record(info.gtm);
  const [{ latestRun }, statuses] = await Promise.all([
    listShownExternalCandidates({ admin, workspaceId: GTM_WORKSPACE_ID, roleId: row.role_id }),
    listExternalCandidateStatuses({ admin, workspaceId: GTM_WORKSPACE_ID, roleId: row.role_id, limit: 60 }),
  ]);
  return {
    roleId: row.role_id,
    // Ops reads its own name ("회사 · 직함"); the Role's own name is what candidates see.
    name: typeof gtm.opsName === "string" && gtm.opsName.trim() ? gtm.opsName.trim() : row.name,
    status: row.status,
    kind: info.purpose === GTM_ROLE_PURPOSE ? "gtm" : "harper",
    companyName: typeof gtm.companyName === "string" ? gtm.companyName : null,
    source: gtm.source === "customer_role" || gtm.source === "url" || gtm.source === "text" ? gtm.source : null,
    sourceRoleId: typeof gtm.sourceRoleId === "string" ? gtm.sourceRoleId : null,
    createdAt: row.created_at,
    search: latestRun ? { status: latestRun.status, startedAt: latestRun.created_at, finishedAt: latestRun.finished_at } : null,
    shown: statuses.total,
    requested: statuses.people.filter((person) => person.intro).length,
    hasRuns: Boolean(latestRun),
  };
}

/** GTM Roles only (Harper's own hiring Roles are not part of the GTM plays), ended ones included. */
export async function listGtmRoles(): Promise<GtmRoleSummary[]> {
  const admin = getSupabaseAdmin();
  const rows = (await loadHarperRoles(admin)).filter((row) => record(row.information).purpose === GTM_ROLE_PURPOSE);
  const summaries = await Promise.all(rows.map((row) => summarize(admin, row)));
  return summaries.map(({ hasRuns: _hasRuns, ...role }) => role);
}

/** The GTM Role already made for this posting (gtmRoleKey), if any. Read only. */
export async function findGtmRoleForJd(jd: GtmJd): Promise<{ roleId: string; name: string; status: string } | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("company_roles").select("role_id,name,status,ops_name:information->gtm->>opsName")
    .eq("company_workspace_id", GTM_WORKSPACE_ID).eq("source_type", "internal").neq("status", "deleted")
    .eq("information->>purpose", GTM_ROLE_PURPOSE).eq("information->gtm->>key", gtmRoleKey(jd))
    .order("created_at", { ascending: false }).limit(1)
    .returns<Array<{ role_id: string; name: string; status: string; ops_name: string | null }>>();
  if (error) throw error;
  const row = data?.[0];
  return row ? { roleId: row.role_id, name: row.ops_name?.trim() || row.name, status: row.status } : null;
}

/**
 * Chris sees everyone a GTM Role's searches found, the 'maybe' people too (Shaun 11/12): they are marked shown
 * here, so email lookup, pass and the mail work on them as on any shown person. Customers' Roles keep the
 * search's own bar.
 */
async function showAllGtmCandidates(admin: Admin, roleId: string) {
  if (!gtmWritesEnabled()) return;
  const { error } = await admin.from("external_candidates").update({ delivered: true } as never)
    .eq("company_workspace_id", GTM_WORKSPACE_ID).eq("role_id", roleId).eq("delivered", false)
    .is("excluded_reason", null);
  if (error) throw error;
}

function verdictScore(row: { verdict?: unknown }) {
  const score = Number(record(row.verdict).score);
  return Number.isFinite(score) ? score : -1;
}

/** The JD a GTM Role was made from, as Ops gave it (information.gtm.jdText); null for older Roles. */
function gtmJdText(information: unknown) {
  const text = record(record(information).gtm).jdText;
  return typeof text === "string" && text.trim() ? text : null;
}

export async function loadGtmRole(roleId: string): Promise<GtmRoleDetail> {
  const admin = getSupabaseAdmin();
  const [row] = await loadHarperRoles(admin, roleId);
  if (!row) throw new Error("Harper workspace의 Role이 아니에요.");
  if (record(row.information).purpose === GTM_ROLE_PURPOSE) await showAllGtmCandidates(admin, roleId);
  const [summary, shown, statuses, brief, posting] = await Promise.all([
    summarize(admin, row),
    listShownExternalCandidates({ admin, workspaceId: GTM_WORKSPACE_ID, roleId }),
    listExternalCandidateStatuses({ admin, workspaceId: GTM_WORKSPACE_ID, roleId, limit: 60 }),
    admin.from("company_internal_roles").select("request,criteria").eq("role_id", roleId).maybeSingle(),
    admin.from("company_roles").select("external_jd_url,description").eq("role_id", roleId).maybeSingle(),
  ]);
  if (brief.error) throw brief.error;
  if (posting.error) throw posting.error;
  const criteria = Array.isArray(brief.data?.criteria) ? brief.data.criteria as GtmRoleDetail["criteria"] : [];
  const { hasRuns: _hasRuns, ...role } = summary;
  const parts = splitGtmSearchRequest(brief.data?.request ?? null, record(record(row.information).gtm));
  return {
    ...role,
    request: brief.data?.request ?? null,
    baseRequest: parts.base,
    extraRequest: parts.extra,
    criteria,
    postingUrl: posting.data?.external_jd_url ?? null,
    // Ops reads the JD as it was given; the Role's own description is the one candidates see.
    description: gtmJdText(row.information) ?? posting.data?.description ?? null,
    // Most recommended first (the search's score).
    candidates: externalCandidatesForCompany([...shown.candidates].sort((a, b) => verdictScore(b) - verdictScore(a))),
    statuses: statuses.people.map((person) => ({
      id: person.id, name: person.name, decision: person.company_decision,
      introStatus: person.intro?.status ?? null, contactStatus: person.contact?.status ?? null,
    })),
  };
}

/**
 * Created through the same RPC the company Role creation uses (an internal actor may create in any
 * workspace), then the Brief and active status. Role start is never run: on a test-only Role it would
 * allow the people it picks to be contacted.
 */
export async function createGtmRole(args: { user: User; jd: GtmJd; brief: GtmBrief; extraRequest: string }) {
  // One company reads the same to candidates on every GTM Role: a description it already has wins.
  const plan = gtmRolePlan(args.jd, args.brief, args.extraRequest, await gtmCompanyDescription(args.jd.companyName));
  // One Role per posting: the same posting opens the Role made before (its Brief is edited there). A Role
  // left half-made by an earlier failure (still a draft) is finished with what is on screen now.
  const existing = await findGtmRoleForJd(args.jd);
  if (existing && existing.status !== "draft") {
    return { dryRun: false as const, reused: true as const, roleId: existing.roleId, plan };
  }
  if (!gtmWritesEnabled()) return { dryRun: true as const, plan };
  const admin = getSupabaseAdmin();
  if (existing) {
    await writeGtmBrief(admin, { roleId: existing.roleId, user: args.user, ...plan.company_internal_roles });
    await activateGtmRole(admin, existing.roleId, plan);
    return { dryRun: false as const, reused: false as const, roleId: existing.roleId, plan };
  }
  const roleId = randomUUID();
  const { error: createError } = await (admin.rpc as any)("create_company_team_role_v1", {
    p_workspace: GTM_WORKSPACE_ID, p_actor: args.user.id, p_role: roleId,
    p_name: plan.company_roles.name, p_information: plan.company_roles.information,
  });
  if (createError) throw createError;
  await writeGtmBrief(admin, { roleId, user: args.user, ...plan.company_internal_roles });
  await activateGtmRole(admin, roleId, plan);
  return { dryRun: false as const, reused: false as const, roleId, plan };
}

/**
 * The posting facts on the draft Role, then draft → active so the search Worker runs it. Activation goes
 * through complete_company_role_creation_v1, the one path the draft-activation guard allows (as Role
 * creation in /org and Ops does); the company data path would run the company's Role-start checks.
 */
/**
 * A GTM Role is Harper's own prospecting Role: it is marked as a Role Harper made
 * (company_internal_roles.is_harper_tailored_role), so it never uses a plan's active Role limit and stays out of
 * company metrics, whichever workspace it is in (Harper GTM has no plan limit; earlier GTM Roles were made in
 * Harper's own workspace, which is on the free plan). GTM Roles stay test-only, so no scheduled matching runs.
 */
async function markGtmRoleHarperMade(admin: Admin, roleId: string) {
  const { error } = await admin.from("company_internal_roles")
    .update({ is_harper_tailored_role: true } as never).eq("role_id", roleId).eq("is_harper_tailored_role", false);
  if (error) throw error;
}

async function activateGtmRole(admin: Admin, roleId: string, plan: ReturnType<typeof gtmRolePlan>) {
  await markGtmRoleHarperMade(admin, roleId);
  const { error } = await admin.from("company_roles").update({
    description: plan.company_roles.description,
    external_jd_url: plan.company_roles.external_jd_url, location_text: plan.company_roles.location_text,
  } as never).eq("role_id", roleId).eq("company_workspace_id", GTM_WORKSPACE_ID);
  if (error) throw error;
  const { data: activated, error: activateError } = await (admin.rpc as any)("complete_company_role_creation_v1", {
    p_role_id: roleId, p_workspace_id: GTM_WORKSPACE_ID,
  });
  // A plan limit on Harper's workspace comes back as the billing message the screen shows.
  if (activateError) throwBillingDbError(activateError);
  if (activated !== true) throw new Error("GTM Role을 진행 중으로 바꾸지 못했어요. 다시 눌러 주세요.");
}

/**
 * The official Brief write (write_company_role_brief_v1): it records who changed the Brief and from where
 * in the Role's Brief history, as role start and Ops role creation do.
 */
async function writeGtmBrief(admin: Admin, args: {
  roleId: string; user: User; request: string; criteria: GtmBrief["criteria"];
}) {
  const { error } = await (admin.rpc as any)("write_company_role_brief_v1", {
    p_role_id: args.roleId,
    p_request: args.request,
    p_criteria: args.criteria,
    p_source: "ops_gtm_plays",
    p_actor_user_id: args.user.id,
    p_actor_label: "GTM 플레이",
    p_request_review: false,
    p_role_start: false,
  });
  if (error) throw error;
}

/**
 * Harper members closest to one Role, read only: the Role's text (name, description, request, criteria)
 * goes through the same pool as #2. Nothing is written, so it works with writes off.
 */
export async function searchGtmMembers(roleId: string) {
  const admin = getSupabaseAdmin();
  const [row] = await loadHarperRoles(admin, roleId);
  if (!row) throw new Error("Harper workspace의 Role이 아니에요.");
  const [{ data: role, error: roleError }, { data: brief, error: briefError }] = await Promise.all([
    admin.from("company_roles").select("description,external_jd_url,location_text").eq("role_id", roleId).maybeSingle(),
    admin.from("company_internal_roles").select("request,criteria").eq("role_id", roleId).maybeSingle(),
  ]);
  if (roleError) throw roleError;
  if (briefError) throw briefError;
  const gtm = record(record(row.information).gtm);
  const criteria = Array.isArray(brief?.criteria) ? brief.criteria as GtmRoleDetail["criteria"] : [];
  return findInternalMatches({
    jd: gtmMemberSearchJd({
      companyName: typeof gtm.companyName === "string" ? gtm.companyName : null,
      title: typeof gtm.opsName === "string" && gtm.opsName.trim() ? gtm.opsName : row.name,
      description: gtmJdText(row.information) ?? role?.description ?? null, request: brief?.request ?? null, criteria,
      url: role?.external_jd_url ?? null, location: role?.location_text ?? null,
    }),
  });
}

/** A GTM Role of this screen (not Harper's own hiring Roles); `active` when it must be searchable. */
async function requireGtmRole(admin: Admin, roleId: string, options: { active?: boolean } = {}) {
  const [row] = await loadHarperRoles(admin, roleId);
  if (!row || record(row.information).purpose !== GTM_ROLE_PURPOSE) throw new Error("이 화면에서 만든 GTM Role이 아니에요.");
  if (options.active && row.status !== "active") throw new Error("진행 중인 Role만 검색할 수 있어요.");
  return row;
}

/** The company search request, as Harper. Counts toward Harper's limits only. */
export async function requestGtmSearch(args: { user: Pick<User, "id">; roleId: string }) {
  assertWrites();
  const admin = getSupabaseAdmin();
  const roleName = (await requireGtmRole(admin, args.roleId, { active: true })).name;
  const result = await requestExternalSourcing({
    admin, workspaceId: GTM_WORKSPACE_ID, roleId: args.roleId, roleName, userId: args.user.id,
    trigger: "company_request", reason: "GTM outreach (ops)",
  });
  const { modelOutput: _modelOutput, ...rest } = result;
  return rest;
}

export async function requestGtmEmail(args: { user: Pick<User, "id">; roleId: string; candidateId: string }) {
  assertWrites();
  const admin = getSupabaseAdmin();
  await requireGtmRole(admin, args.roleId);
  const result = await requestExternalEmailLookup({
    admin, workspaceId: GTM_WORKSPACE_ID, roleId: args.roleId,
    userId: args.user.id, candidateRef: args.candidateId,
  });
  const { modelOutput: _modelOutput, ...rest } = result;
  return rest;
}
