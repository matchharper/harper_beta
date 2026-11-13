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
  loadShownExternalCandidate,
  passExternalCandidate,
  requestExternalEmailLookup,
  requestExternalIntro,
  requestExternalSourcing,
} from "@/lib/org/agent/externalSourcing.server";
import { inviteLanguage, renderExternalInvite } from "@/lib/org/agent/externalInvite";
import { throwBillingDbError } from "@/lib/org/billing/store";
import { applyWebsiteCompanyDataChanges } from "@/lib/org/companyDataWebsite";
import { GTM_ROLE_PURPOSE, GTM_WRITES_OFF_MESSAGE, GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID, gtmWritesEnabled } from "./constants";
import { findInternalMatches } from "./pool.server";
import {
  gtmMemberSearchJd,
  gtmRoleKey,
  gtmRolePlan,
  gtmSearchRequest,
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

export class GtmWritesOffError extends Error {
  constructor() {
    super(GTM_WRITES_OFF_MESSAGE);
  }
}

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
    name: row.name,
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

/** GTM Roles only (Harper's own hiring Roles are not part of #4), ended ones included so they can be reopened. */
export async function listGtmRoles(): Promise<GtmRoleSummary[]> {
  const admin = getSupabaseAdmin();
  const rows = (await loadHarperRoles(admin)).filter((row) => record(row.information).purpose === GTM_ROLE_PURPOSE);
  const summaries = await Promise.all(rows.map((row) => summarize(admin, row)));
  return summaries.map(({ hasRuns: _hasRuns, ...role }) => role);
}

/** The GTM Role already made for this posting (gtmRoleKey), if any. Read only. */
export async function findGtmRoleForJd(jd: GtmJd): Promise<{ roleId: string; name: string; status: string } | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("company_roles").select("role_id,name,status")
    .eq("company_workspace_id", GTM_WORKSPACE_ID).eq("source_type", "internal").neq("status", "deleted")
    .eq("information->>purpose", GTM_ROLE_PURPOSE).eq("information->gtm->>key", gtmRoleKey(jd))
    .order("created_at", { ascending: false }).limit(1)
    .returns<Array<{ role_id: string; name: string; status: string }>>();
  if (error) throw error;
  const row = data?.[0];
  return row ? { roleId: row.role_id, name: row.name, status: row.status } : null;
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
    description: posting.data?.description ?? null,
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
  const plan = gtmRolePlan(args.jd, args.brief, args.extraRequest);
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
 * 끝내기 / 다시 열기 for a GTM Role, through the same company data change path /org uses for Role status
 * (with its history): ended Roles leave the active Role count and are not searched.
 */
export async function setGtmRoleOpen(args: { user: User; roleId: string; open: boolean }) {
  assertWrites();
  const admin = getSupabaseAdmin();
  const [row] = await loadHarperRoles(admin, args.roleId);
  if (!row || record(row.information).purpose !== GTM_ROLE_PURPOSE) throw new Error("GTM Role만 여기서 끝내거나 다시 열 수 있어요.");
  if (args.open) await markGtmRoleHarperMade(admin, args.roleId);
  await applyWebsiteCompanyDataChanges({
    admin,
    workspaceId: GTM_WORKSPACE_ID,
    actorLabel: "GTM 플레이",
    actorUserId: args.user.id,
    changeSource: "ops",
    source: "website",
    changes: [{ key: "role_status", roleId: args.roleId, value: args.open ? "active" : "ended" }],
  });
  return { status: args.open ? "active" : "ended" };
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
 * Chris's search instructions for a GTM Role: base text + extra instructions (one request the search
 * reads) and the criteria. Harper's own hiring Roles are edited in /org, not here.
 */
export async function saveGtmBrief(args: {
  user: User; roleId: string; request: string; extraRequest: string; criteria: GtmBrief["criteria"];
}) {
  const plan = {
    company_internal_roles: { request: gtmSearchRequest(args.request, args.extraRequest), criteria: args.criteria },
    information_gtm: { baseRequest: args.request.trim(), extraRequest: args.extraRequest.trim() },
  };
  if (!gtmWritesEnabled()) return { dryRun: true as const, plan };
  const admin = getSupabaseAdmin();
  const [row] = await loadHarperRoles(admin, args.roleId);
  if (!row) throw new Error("Harper workspace의 Role이 아니에요.");
  const information = record(row.information);
  if (information.purpose !== GTM_ROLE_PURPOSE) throw new Error("GTM Role만 여기서 고칠 수 있어요. 하퍼 채용 Role은 /org에서 고쳐요.");
  await writeGtmBrief(admin, { roleId: args.roleId, user: args.user, ...plan.company_internal_roles });
  const { error } = await admin.from("company_roles").update({
    information: { ...information, gtm: { ...record(information.gtm), ...plan.information_gtm } },
  } as never).eq("role_id", args.roleId).eq("company_workspace_id", GTM_WORKSPACE_ID);
  if (error) throw error;
  return { dryRun: false as const, plan };
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
      companyName: typeof gtm.companyName === "string" ? gtm.companyName : null, title: row.name,
      description: role?.description ?? null, request: brief?.request ?? null, criteria,
      url: role?.external_jd_url ?? null, location: role?.location_text ?? null,
    }),
  });
}

/** The same member search before the Role is saved: the JD and the criteria on screen, read only. */
export async function searchDraftMembers(args: { jd: GtmJd; brief: GtmBrief; extraRequest: string }) {
  return findInternalMatches({
    jd: gtmMemberSearchJd({
      companyName: args.jd.companyName, title: args.brief.roleName || args.jd.title, description: args.jd.description,
      request: gtmSearchRequest(args.brief.request, args.extraRequest), criteria: args.brief.criteria,
      url: args.jd.url, location: args.jd.location,
    }),
  });
}

/** A GTM Role of this screen (not Harper's own hiring Roles); `active` when it must be searchable. */
async function requireGtmRole(admin: Admin, roleId: string, options: { active?: boolean } = {}) {
  const [row] = await loadHarperRoles(admin, roleId);
  if (!row || record(row.information).purpose !== GTM_ROLE_PURPOSE) throw new Error("이 화면에서 만든 GTM Role이 아니에요.");
  if (options.active && row.status !== "active") throw new Error("진행 중인 Role만 검색할 수 있어요. 다시 열기를 눌러 주세요.");
  return row;
}

async function gtmRoleName(admin: Admin, roleId: string) {
  return (await requireGtmRole(admin, roleId)).name;
}

/** The company search request, as Harper. Counts toward Harper's limits only. */
export async function requestGtmSearch(args: { user: User; roleId: string }) {
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

export async function requestGtmEmail(args: { user: User; roleId: string; candidateId: string }) {
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

export async function passGtmCandidate(args: { user: User; roleId: string; candidateId: string; reason: string }) {
  assertWrites();
  const admin = getSupabaseAdmin();
  await requireGtmRole(admin, args.roleId);
  return passExternalCandidate({
    admin, workspaceId: GTM_WORKSPACE_ID, roleId: args.roleId,
    userId: args.user.id, candidateRef: args.candidateId, reason: args.reason || "GTM pass",
  });
}

/** The invitation exactly as the existing sender renders it (links shown as placeholders). */
export async function previewGtmInvite(args: { roleId: string; candidateId: string; appeal: string }) {
  const admin = getSupabaseAdmin();
  const [candidate, roleName, workspace] = await Promise.all([
    loadShownExternalCandidate({ admin, workspaceId: GTM_WORKSPACE_ID, roleId: args.roleId, candidateRef: args.candidateId }),
    gtmRoleName(admin, args.roleId),
    admin.from("company_workspace").select("company_name,published_name").eq("company_workspace_id", GTM_WORKSPACE_ID).maybeSingle(),
  ]);
  if (!candidate) throw new Error("후보를 찾지 못했어요.");
  const companyName = workspace.data?.published_name?.trim() || workspace.data?.company_name?.trim() || null;
  return renderExternalInvite({
    language: inviteLanguage({ name: candidate.name, location: candidate.location }),
    personName: candidate.name, companyName, roleName,
    companyAppeal: args.appeal || "(회사가 전하는 말)",
    unsubscribeUrl: "https://matchharper.com/unsubscribe/…", connectUrl: "https://matchharper.com/connect/…",
    addressSource: null,
  });
}

/** Send Intro as Harper: the company Request intro (records, then the invitation goes out by cron). */
export async function sendGtmIntro(args: {
  user: User; roleId: string; candidateId: string; appeal: string; recipients: string[];
}) {
  assertWrites();
  const admin = getSupabaseAdmin();
  const candidate = await loadShownExternalCandidate({ admin, workspaceId: GTM_WORKSPACE_ID, roleId: args.roleId, candidateRef: args.candidateId });
  if (!candidate) throw new Error("후보를 찾지 못했어요.");
  if (candidate.contact?.status !== "found") throw new Error("이메일을 찾은 사람에게만 보낼 수 있어요.");
  return requestExternalIntro({
    admin, workspaceId: GTM_WORKSPACE_ID, roleId: args.roleId, userId: args.user.id, candidate,
    companyAppeal: args.appeal, introRecipientEmails: [...new Set(args.recipients.map((email) => email.trim().toLowerCase()))],
    channel: "web",
  });
}

type CopySource = {
  person_key: string | null; linkedin_url: string | null; name: string | null; headline: string | null;
  current_company: string | null; location: string | null; career_lines: unknown; evidence: unknown;
  screen: unknown; verdict: unknown; rank: number | null; profile_text: string | null;
};

/**
 * Hand chosen people to a customer's own Role: ordinary rows (one finished search + its people) in the
 * customer's workspace, so they show in that company's external candidate tab like any search result.
 * Addresses are not copied; the company looks them up itself.
 */
export async function copyToCustomerRole(args: {
  user: User; roleId: string; candidateIds: string[]; targetRoleId: string;
}) {
  const admin = getSupabaseAdmin();
  await requireGtmRole(admin, args.roleId);
  const { data: target, error: targetError } = await admin.from("company_roles")
    .select("role_id,name,company_workspace_id,source_type,status,information").eq("role_id", args.targetRoleId).maybeSingle();
  if (targetError) throw targetError;
  if (!target || target.source_type !== "internal" || target.company_workspace_id === GTM_WORKSPACE_ID || target.company_workspace_id === HARPER_WORKSPACE_ID
    || !["active", "top_priority", "paused"].includes(String(target.status))
    || record(target.information).testOnly === true) {
    throw new Error("진행 중인 고객 회사 Role을 골라 주세요.");
  }
  const { data: sources, error: sourceError } = await admin.from("external_candidates")
    .select("person_key,linkedin_url,name,headline,current_company,location,career_lines,evidence,screen,verdict,rank,profile_text")
    .eq("company_workspace_id", GTM_WORKSPACE_ID).eq("role_id", args.roleId).eq("delivered", true)
    .in("id", args.candidateIds).returns<CopySource[]>();
  if (sourceError) throw sourceError;
  // People already on the customer's Role are not added twice.
  const keys = (sources ?? []).map((person) => person.person_key).filter((key): key is string => Boolean(key));
  const { data: already, error: alreadyError } = keys.length
    ? await admin.from("external_candidates").select("person_key").eq("role_id", target.role_id).in("person_key", keys)
      .returns<Array<{ person_key: string | null }>>()
    : { data: [] as Array<{ person_key: string | null }>, error: null };
  if (alreadyError) throw alreadyError;
  const there = new Set((already ?? []).map((row) => row.person_key));
  const people = (sources ?? []).filter((person) => !person.person_key || !there.has(person.person_key));
  const plan = {
    target: { workspaceId: target.company_workspace_id, roleId: target.role_id, roleName: target.name, status: target.status },
    people: people.map((person) => ({ name: person.name, headline: person.headline, linkedinUrl: person.linkedin_url })),
  };
  if (!gtmWritesEnabled()) return { dryRun: true as const, plan };
  if (!people.length) throw new Error(there.size ? "고른 후보는 이미 그 Role에 있어요." : "옮길 후보가 없어요.");
  const now = new Date().toISOString();
  // ops_copy: not a search, so it does not use the customer's daily search limits (externalSourcing.server.ts).
  const { data: run, error: runError } = await admin.from("external_sourcing_runs").insert({
    company_workspace_id: target.company_workspace_id, role_id: target.role_id, trigger: "ops_copy",
    requested_by: args.user.id, status: "succeeded", started_at: now, finished_at: now,
    input: { reason: "Harper가 찾은 외부 후보 전달", source: "gtm_copy", fromRoleId: args.roleId },
    counts: { delivered: people.length },
  } as never).select("id").single();
  if (runError) throw runError;
  const { error: insertError } = await admin.from("external_candidates").insert(people.map((person, index) => ({
    run_id: (run as { id: string }).id, company_workspace_id: target.company_workspace_id, role_id: target.role_id,
    person_key: person.person_key, linkedin_url: person.linkedin_url, name: person.name, headline: person.headline,
    current_company: person.current_company, location: person.location, career_lines: person.career_lines,
    evidence: person.evidence, screen: person.screen, verdict: person.verdict, rank: index + 1,
    profile_text: person.profile_text, delivered: true,
  })) as never);
  if (insertError) throw insertError;
  return { dryRun: false as const, plan, runId: (run as { id: string }).id, skipped: (sources ?? []).length - people.length };
}
