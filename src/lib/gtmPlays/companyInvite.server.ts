import "server-only";

import type { User } from "@supabase/supabase-js";
import { publishRoleRecommendations } from "@/lib/companyFirstSearch/publication/server";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import type { OrgAgentAdminClient } from "@/lib/org/agent/data";
import { enqueueOrgAgenticMatchingSearch } from "@/lib/org/agent/matchingSearch";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { draftGtmBrief } from "./brief.server";
import {
  GTM_COMPANY_INVITE_VALID_MS,
  isGtmCompanyInviteId,
  type GtmCompanyInviteClaim,
  type GtmCompanyInviteStage,
  type GtmCompanyInviteState,
  type GtmCompanyInviteTeaser,
  type GtmSignupInvite,
} from "./companyInvite";
import { gtmCompanyInviteRoleId } from "./companyInviteRole";
import { GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID, gtmWritesEnabled } from "./constants";
import { gtmWrite } from "./db.server";
import type { GtmPostingSnapshot } from "./mailSend.server";
import type { GtmJd } from "./shared";

type Admin = ReturnType<typeof getSupabaseAdmin>;

type InviteMail = {
  id: string;
  to_email: string;
  company_name: string | null;
  talent_ids: string[];
  language: "ko" | "en";
  posting: GtmPostingSnapshot;
  company_workspace_id: string | null;
  claimed_at: string | null;
};

type RoleRow = {
  role_id: string;
  company_workspace_id: string;
  name: string;
  status: string;
  information: unknown;
};

function mailsTable(admin: Admin) {
  // gtm_mails is new and not in the generated Database types yet.
  return (admin as unknown as { from: (table: string) => any }).from("gtm_mails");
}

/** A sent #2 company mail (pool) within its validity that carries the posting and the people it showed. */
async function readInviteMail(admin: Admin, mailId: string): Promise<InviteMail | null> {
  if (!isGtmCompanyInviteId(mailId)) return null;
  const { data, error } = await mailsTable(admin)
    .select("id,audience,campaign,status,created_at,to_email,company_name,talent_ids,language,posting,company_workspace_id,claimed_at")
    .eq("id", mailId).maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") return null;
    throw error;
  }
  const row = data as (InviteMail & { audience: string; campaign: string; status: string; created_at: string;
    language: string | null; posting: GtmPostingSnapshot | null }) | null;
  if (!row || row.audience !== "company" || row.campaign !== "pool" || row.status !== "sent") return null;
  if (!row.posting?.title?.trim() || !row.talent_ids?.length) return null;
  if (Date.now() - Date.parse(row.created_at) > GTM_COMPANY_INVITE_VALID_MS) return null;
  return { ...row, language: row.language === "en" ? "en" : "ko", posting: row.posting };
}

/** The line the /org sign-in screen shows for a mail's button (which posting, how many people). */
export async function readGtmCompanyInviteTeaser(mailId: string): Promise<GtmCompanyInviteTeaser | null> {
  const mail = await readInviteMail(getSupabaseAdmin(), mailId);
  if (!mail) return null;
  return {
    companyName: mail.posting.companyName ?? mail.company_name,
    title: mail.posting.title,
    count: mail.talent_ids.length,
    language: mail.language,
  };
}

const evaluationRequestId = (mailId: string) => `gtm-invite-eval:${mailId}`;
const publicationRequestId = (mailId: string, talentId: string) => `gtm-invite-publish:${mailId}:${talentId}`;

async function readRole(admin: Admin, roleId: string): Promise<RoleRow | null> {
  const { data, error } = await admin.from("company_roles")
    .select("role_id,company_workspace_id,name,status,information").eq("role_id", roleId).maybeSingle();
  if (error) throw error;
  return (data as RoleRow | null) ?? null;
}

async function readAuthority(admin: Admin, workspaceId: string, userId: string) {
  const { data, error } = await admin.from("company_user_workspace")
    .select("authority").eq("company_workspace_id", workspaceId).eq("company_user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as { authority: string } | null)?.authority ?? null;
}

function postingJd(mail: InviteMail): GtmJd {
  return {
    source: mail.posting.url ? "url" : "text",
    companyName: mail.posting.companyName ?? mail.company_name ?? "",
    title: mail.posting.title,
    description: mail.posting.description ?? "",
    url: mail.posting.url,
    location: mail.posting.location,
    sourceRoleId: null,
    sourceWorkspaceId: null,
    contactEmails: [],
  };
}

function isCapacityError(error: unknown) {
  const message = error && typeof error === "object" ? String((error as { message?: unknown }).message ?? "") : "";
  return message.includes("workspace_role_capacity_exceeded");
}

/**
 * The draft Role gets the posting (name, description, link, location), the search request and criteria drafted
 * from it the way #4 '기준 만들기' does, then turns on through the same completion /org and Ops use. Returns false
 * when the plan's active Role limit keeps it a draft.
 */
async function finishDraftRole(admin: Admin, args: { role: RoleRow; mail: InviteMail; user: User }) {
  const { role, mail, user } = args;
  const jd = postingJd(mail);
  const { error: factsError } = await admin.from("company_roles").update({
    description: jd.description.slice(0, 16_000) || null,
    external_jd_url: jd.url,
    location_text: jd.location,
  } as never).eq("role_id", role.role_id).eq("company_workspace_id", role.company_workspace_id).eq("status", "draft");
  if (factsError) throw factsError;
  const { data: internal, error: internalError } = await admin.from("company_internal_roles")
    .select("request").eq("role_id", role.role_id).maybeSingle();
  if (internalError) throw internalError;
  if (!String((internal as { request?: string | null } | null)?.request ?? "").trim()) {
    const brief = await draftGtmBrief(jd);
    const { error } = await (admin.rpc as any)("write_company_role_brief_v1", {
      p_role_id: role.role_id,
      p_request: brief.request,
      p_criteria: brief.criteria,
      p_source: "gtm_company_invite",
      p_actor_user_id: user.id,
      p_actor_label: "메일로 받은 공고",
      p_request_review: false,
      p_role_start: false,
    });
    if (error) throw error;
  }
  const { data: activated, error: activateError } = await (admin.rpc as any)("complete_company_role_creation_v1", {
    p_role_id: role.role_id, p_workspace_id: role.company_workspace_id,
  });
  if (activateError) {
    if (isCapacityError(activateError)) return false;
    throw activateError;
  }
  if (activated !== true) {
    const current = await readRole(admin, role.role_id);
    if (current?.status === "draft") throw new Error("Role could not be turned on");
  }
  return true;
}

/**
 * Asks Harper to evaluate the mail's people for this Role (stage 1 → 2, no cards yet) through the company's own
 * search command, or reads where that request is: the command is keyed by the mail, so calling again returns
 * the same run. The run's company notice is marked not required: this flow publishes the result itself
 * (syncGtmCompanyInvite), so the Role chat is not resumed for a search the company never asked for.
 */
async function ensureEvaluation(admin: Admin, args: { roleId: string; workspaceId: string; user: User; mail: InviteMail }) {
  const receipt = await enqueueOrgAgenticMatchingSearch({
    admin: admin as unknown as OrgAgentAdminClient,
    roleId: args.roleId,
    userId: args.user.id,
    workspaceId: args.workspaceId,
    requestId: evaluationRequestId(args.mail.id),
    input: {
      scope: "unassessed",
      startStage: 1,
      talentIds: args.mail.talent_ids,
      reason: "메일로 소개한 Harper 회원을 이 역할 기준으로 평가",
    },
  }) as { status: string; runId?: unknown };
  const runId = typeof receipt.runId === "string" ? receipt.runId : null;
  if (runId && receipt.status !== "already_completed") {
    await gtmWrite((sql) => sql`
      update public.company_first_search_runs
      set result = jsonb_set(coalesce(result, '{}'::jsonb), '{companyNotice}',
        jsonb_build_object('status', 'not_required', 'reason', 'gtm_company_invite'), true)
      where id = ${runId}::uuid and coalesce(result #>> '{companyNotice,status}', '') = ''
    `);
  }
  // not_queued: the Role cannot be searched now (ended, no request): nothing to wait for.
  return receipt.status === "queued" || receipt.status === "already_queued" || receipt.status === "already_running"
    ? "evaluating" as const
    : "evaluated" as const;
}

/** The creator who signed up from the mail sees the Role first (see isGtmOnboardingDeferred). */
async function deferOnboarding(args: { workspaceId: string; user: User; invite: GtmSignupInvite }) {
  await gtmWrite((sql) => sql`
    update public.company_workspace
    set signup_state = signup_state || jsonb_build_object('gtmInvite', ${sql.json(args.invite)}::jsonb)
    where company_workspace_id = ${args.workspaceId}::uuid
      and signup_state ->> 'createdBy' = ${args.user.id}
      and not (signup_state ? 'gtmInvite')
  `);
}

/**
 * The company's name from the mail, when the person signing up is from the company the mail went to and the
 * workspace still shows only the signup domain (onboarding's company step can still change it).
 */
async function nameWorkspaceFromMail(admin: Admin, args: { workspaceId: string; user: User; mail: InviteMail }) {
  const name = (args.mail.posting.companyName ?? args.mail.company_name ?? "").trim();
  const userDomain = (args.user.email ?? "").split("@")[1]?.toLowerCase();
  const mailDomain = args.mail.to_email.split("@")[1]?.toLowerCase();
  if (!name || !userDomain || userDomain !== mailDomain) return;
  const { error } = await admin.from("company_workspace").update({ company_name: name.slice(0, 160) } as never)
    .eq("company_workspace_id", args.workspaceId).eq("signup_domain", userDomain).eq("company_name", userDomain);
  if (error) console.warn("[gtm-company-invite] workspace name", error);
}

/**
 * Opened from a #2 회사 메일 (/org?gtm=<mail id>) by a signed-in owner or admin of `workspaceId`: one ordinary
 * Role from the posting (counts toward the plan like any Role), turned on, the mail's people queued for
 * evaluation, the mail marked claimed. Safe to call again: it continues where an earlier call stopped.
 */
export async function claimGtmCompanyInvite(args: { user: User; mailId: string; workspaceId: string }): Promise<GtmCompanyInviteClaim> {
  if (!gtmWritesEnabled()) return { status: "off" };
  if (isInternalDomainEmail(args.user.email) || args.workspaceId === HARPER_WORKSPACE_ID || args.workspaceId === GTM_WORKSPACE_ID) {
    return { status: "internal" };
  }
  const admin = getSupabaseAdmin();
  const mail = await readInviteMail(admin, args.mailId);
  if (!mail) return { status: "unavailable" };
  const authority = await readAuthority(admin, args.workspaceId, args.user.id);
  if (authority !== "owner" && authority !== "admin") return { status: "forbidden" };

  const roleId = gtmCompanyInviteRoleId(mail.id, args.workspaceId);
  let role = await readRole(admin, roleId);
  if (role && (role.company_workspace_id !== args.workspaceId || role.status === "deleted")) return { status: "unavailable" };
  if (!role) {
    const claimedAt = new Date().toISOString();
    const { error } = await (admin.rpc as any)("create_company_team_role_v1", {
      p_workspace: args.workspaceId,
      p_actor: args.user.id,
      p_role: roleId,
      p_name: mail.posting.title.trim().slice(0, 160),
      p_information: { gtmInvite: { mailId: mail.id, claimedBy: args.user.id, claimedAt } },
    });
    if (error) {
      if (error.message === "org_team_role_forbidden") return { status: "forbidden" };
      // Another tab or a colleague made it a moment ago: continue with that Role.
      if (error.code !== "23505") throw error;
    }
    role = await readRole(admin, roleId);
    if (!role) throw new Error("Role was not created");
  }

  // A plan limit leaves it a draft; the card says so (stage role_limit) and nothing is queued.
  if (role.status === "draft") await finishDraftRole(admin, { role, mail, user: args.user });

  const claimedAt = new Date().toISOString();
  await deferOnboarding({ workspaceId: args.workspaceId, user: args.user, invite: { mailId: mail.id, roleId, claimedBy: args.user.id, claimedAt } });
  await nameWorkspaceFromMail(admin, { workspaceId: args.workspaceId, user: args.user, mail });
  if (!mail.claimed_at) {
    const { error } = await mailsTable(admin)
      .update({ claimed_at: claimedAt, company_workspace_id: mail.company_workspace_id ?? args.workspaceId })
      .eq("id", mail.id).is("claimed_at", null);
    if (error) console.warn("[gtm-company-invite] claim record", error);
  }
  return { status: "claimed", state: await syncInvite(admin, { user: args.user, workspaceId: args.workspaceId, mail, publish: false }) };
}

// Publication failures that will not change by trying again (no stage-2 evaluation for the current Brief, the
// person hid their profile or blocked this company, the Role ended). Anything else is retried on a later call.
const FINAL_PUBLICATION_FAILURES = [
  "lacks current stage-two evidence",
  "no longer eligible",
  "source profile is unavailable",
  "Role is unavailable for recommendation publication",
];

const running = new Map<string, Promise<GtmCompanyInviteState>>();

async function syncInvite(admin: Admin, args: { user: User; workspaceId: string; mail: InviteMail; publish: boolean }): Promise<GtmCompanyInviteState> {
  const roleId = gtmCompanyInviteRoleId(args.mail.id, args.workspaceId);
  const role = await readRole(admin, roleId);
  if (!role || role.company_workspace_id !== args.workspaceId) throw new Error("Role is unavailable");
  const total = args.mail.talent_ids.length;
  const readPublished = async () => {
    const { data, error } = await admin.from("company_intro_candidates").select("talent_id")
      .eq("role_id", roleId).in("talent_id", args.mail.talent_ids);
    if (error) throw error;
    return new Set(((data ?? []) as Array<{ talent_id: string }>).map((row) => row.talent_id));
  };
  const state = (stage: GtmCompanyInviteStage, published: number): GtmCompanyInviteState =>
    ({ mailId: args.mail.id, roleId, roleName: role.name, stage, total, published });

  let published = await readPublished();
  if (role.status === "draft") return state("role_limit", published.size);
  if (published.size >= total) return state("done", published.size);

  const evaluation = await ensureEvaluation(admin, { roleId, workspaceId: args.workspaceId, user: args.user, mail: args.mail });
  if (evaluation === "evaluating") return state("evaluating", published.size);
  if (!args.publish) return state("publishing", published.size);

  // Evaluated: put each person who has a current stage-2 evaluation in the candidate list, one command per
  // person (the shared web publication path: Harper writes the card, then it lands as "연결을 요청할 후보").
  const pending = args.mail.talent_ids.filter((talentId) => !published.has(talentId));
  const results = await Promise.allSettled(pending.map((talentId) => publishRoleRecommendations({
    input: { kind: "add", talentIds: [talentId], reason: "메일로 소개한 Harper 회원" },
    workspaceId: args.workspaceId,
    userId: args.user.id,
    roleId,
    requestId: publicationRequestId(args.mail.id, talentId),
  })));
  const retry = results.filter((result) => result.status === "rejected" && !FINAL_PUBLICATION_FAILURES.some((text) =>
    String((result.reason as { message?: unknown } | null)?.message ?? result.reason).includes(text)));
  for (const result of retry) console.warn("[gtm-company-invite] publication will be retried", (result as PromiseRejectedResult).reason);
  published = await readPublished();
  return state(retry.length ? "publishing" : "done", published.size);
}

/**
 * Called by the /org card while the Role's people are being prepared: reports progress and, once the evaluation
 * is done, publishes them. One run per Role at a time in this server; the publication path itself makes a
 * repeated or concurrent command a no-op.
 */
export async function syncGtmCompanyInvite(args: { user: User; workspaceId: string; mailId: string }): Promise<GtmCompanyInviteState | null> {
  if (!gtmWritesEnabled() || isInternalDomainEmail(args.user.email)) return null;
  const admin = getSupabaseAdmin();
  const mail = await readInviteMail(admin, args.mailId);
  if (!mail) return null;
  const authority = await readAuthority(admin, args.workspaceId, args.user.id);
  if (authority !== "owner" && authority !== "admin") return null;
  const roleId = gtmCompanyInviteRoleId(mail.id, args.workspaceId);
  const current = running.get(roleId);
  if (current) return current;
  const work = syncInvite(admin, { user: args.user, workspaceId: args.workspaceId, mail, publish: true })
    .finally(() => running.delete(roleId));
  running.set(roleId, work);
  return work;
}
