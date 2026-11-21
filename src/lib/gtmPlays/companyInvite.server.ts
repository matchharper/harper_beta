import "server-only";

import type { User } from "@supabase/supabase-js";
import { publishRoleRecommendations } from "@/lib/companyFirstSearch/publication/server";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import type { OrgAgentAdminClient } from "@/lib/org/agent/data";
import { enqueueOrgAgenticMatchingSearch } from "@/lib/org/agent/matchingSearch";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { draftGtmBrief } from "./brief.server";
import {
  companyInviteMailOpens,
  interestedFromCompanyMail,
  isGtmCompanyInviteId,
  type GtmCompanyInviteClaim,
  type GtmCompanyInviteStage,
  type GtmCompanyInviteState,
  type GtmCompanyInviteTeaser,
  type GtmInterestedCard,
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
  /** #5 company mail: the "직접 관심" candidates (nameless summaries) and how many more showed interest. */
  interested: { cards: GtmInterestedCard[]; others: number } | null;
  /** #5 company mail: {N} the mail counted (members + interested). */
  visible: number | null;
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

/**
 * A company mail within its validity that carries the posting and the people it showed: a #2 mail (campaign pool)
 * or a #5 non-customer company mail (campaign agent, audience company; its "직접 관심" candidates from company_mail).
 */
async function readInviteMail(admin: Admin, mailId: string): Promise<InviteMail | null> {
  if (!isGtmCompanyInviteId(mailId)) return null;
  const read = (columns: string) => mailsTable(admin).select(columns).eq("id", mailId).maybeSingle();
  const base = "id,audience,campaign,status,provider_message_id,created_at,to_email,company_name,talent_ids,language,posting,company_workspace_id,claimed_at";
  let { data, error } = await read(`${base},company_mail`);
  // Before the company mail migration (no company_mail column): only #2 mails exist.
  if (error?.code === "42703") ({ data, error } = await read(base));
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") return null;
    throw error;
  }
  const row = data as (Omit<InviteMail, "interested" | "visible"> & { audience: string; campaign: string; status: string;
    provider_message_id: string | null; created_at: string; language: string | null; posting: GtmPostingSnapshot | null;
    company_mail?: { visible?: unknown } | null }) | null;
  if (!row || !row.posting || !companyInviteMailOpens({ ...row, company_mail: row.company_mail ?? null }, Date.now())) return null;
  const agent = row.campaign === "agent";
  const visible = Number(row.company_mail?.visible);
  return {
    ...row,
    talent_ids: row.talent_ids ?? [],
    language: row.language === "en" ? "en" : "ko",
    posting: row.posting,
    interested: agent ? interestedFromCompanyMail(row.company_mail) : null,
    visible: agent && Number.isFinite(visible) && visible > 0 ? visible : null,
  };
}

/** The line the /org sign-in screen shows for a mail's button (which posting, how many people). */
export async function readGtmCompanyInviteTeaser(mailId: string): Promise<GtmCompanyInviteTeaser | null> {
  const mail = await readInviteMail(getSupabaseAdmin(), mailId);
  if (!mail) return null;
  return {
    companyName: mail.posting.companyName ?? mail.company_name,
    title: mail.posting.title,
    count: mail.visible ?? mail.talent_ids.length,
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
 * A draft Role made from a posting, turned on right away (no model call): the posting's facts, then on. The
 * request and criteria come right after (writePostingRoleBrief); writing the request is what starts the Role's
 * matching, so nothing searches with an empty request. False at the plan's active Role limit (it stays a draft).
 */
export async function startPostingDraftRole(admin: Admin, args: {
  role: Pick<RoleRow, "role_id" | "company_workspace_id">;
  jd: GtmJd;
}) {
  const { role, jd } = args;
  const { error: factsError } = await admin.from("company_roles").update({
    description: jd.description.slice(0, 16_000) || null,
    external_jd_url: jd.url,
    location_text: jd.location,
  } as never).eq("role_id", role.role_id).eq("company_workspace_id", role.company_workspace_id).eq("status", "draft");
  if (factsError) throw factsError;
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

async function readRoleRequest(admin: Admin, roleId: string) {
  const { data, error } = await admin.from("company_internal_roles").select("request").eq("role_id", roleId).maybeSingle();
  if (error) throw error;
  return String((data as { request?: string | null } | null)?.request ?? "").trim();
}

const writingBriefs = new Map<string, Promise<void>>();

/**
 * The request and criteria of a Role made from a posting (one model call), when it has none yet. On an active
 * Role this starts its matching (the request trigger). One write per Role at a time in this server.
 */
export function writePostingRoleBrief(admin: Admin, args: {
  roleId: string;
  jd: GtmJd;
  user: User;
  /** Who the Brief history names as the writer. */
  source: string;
  actorLabel: string;
}): Promise<void> {
  const current = writingBriefs.get(args.roleId);
  if (current) return current;
  const work = (async () => {
    if (await readRoleRequest(admin, args.roleId)) return;
    const brief = await draftGtmBrief(args.jd);
    if (await readRoleRequest(admin, args.roleId)) return;
    const { error } = await (admin.rpc as any)("write_company_role_brief_v1", {
      p_role_id: args.roleId,
      p_request: brief.request,
      p_criteria: brief.criteria,
      p_source: args.source,
      p_actor_user_id: args.user.id,
      p_actor_label: args.actorLabel,
      p_request_review: false,
      p_role_start: false,
    });
    if (error) throw error;
  })().finally(() => writingBriefs.delete(args.roleId));
  writingBriefs.set(args.roleId, work);
  return work;
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

  // On right away so the Role page opens at once; its request and criteria are written next (the route runs
  // the sync after answering, and the card's sync does too). A plan limit leaves it a draft (stage role_limit).
  if (role.status === "draft") await startPostingDraftRole(admin, { role, jd: postingJd(mail) });

  const claimedAt = new Date().toISOString();
  await deferOnboarding({ workspaceId: args.workspaceId, user: args.user, invite: { mailId: mail.id, roleId, claimedBy: args.user.id, claimedAt } });
  await nameWorkspaceFromMail(admin, { workspaceId: args.workspaceId, user: args.user, mail });
  if (!mail.claimed_at) {
    const { error } = await mailsTable(admin)
      .update({ claimed_at: claimedAt, company_workspace_id: mail.company_workspace_id ?? args.workspaceId })
      .eq("id", mail.id).is("claimed_at", null);
    if (error) console.warn("[gtm-company-invite] claim record", error);
  }
  return { status: "claimed", state: await syncInvite(admin, { user: args.user, workspaceId: args.workspaceId, mail, publish: false, writeBrief: false }) };
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

async function syncInvite(admin: Admin, args: {
  user: User; workspaceId: string; mail: InviteMail; publish: boolean;
  /** Write the Role's request and criteria first if it has none (one model call); otherwise report and wait. */
  writeBrief: boolean;
}): Promise<GtmCompanyInviteState> {
  const roleId = gtmCompanyInviteRoleId(args.mail.id, args.workspaceId);
  const role = await readRole(admin, roleId);
  if (!role || role.company_workspace_id !== args.workspaceId) throw new Error("Role is unavailable");
  const total = args.mail.talent_ids.length;
  const readPublished = async () => {
    // A #5 company mail may show only "직접 관심" candidates (no Harper member to evaluate or publish).
    if (!args.mail.talent_ids.length) return new Set<string>();
    const { data, error } = await admin.from("company_intro_candidates").select("talent_id")
      .eq("role_id", roleId).in("talent_id", args.mail.talent_ids);
    if (error) throw error;
    return new Set(((data ?? []) as Array<{ talent_id: string }>).map((row) => row.talent_id));
  };
  const interested = args.mail.interested;
  const state = (stage: GtmCompanyInviteStage, published: number): GtmCompanyInviteState => ({
    mailId: args.mail.id, roleId, roleName: role.name, stage, total, published,
    ...(interested ? { interested: interested.cards, interestedOthers: interested.others } : {}),
  });

  let published = await readPublished();
  if (args.writeBrief) {
    await writePostingRoleBrief(admin, {
      roleId, jd: postingJd(args.mail), user: args.user, source: "gtm_company_invite", actorLabel: "메일로 받은 공고",
    });
  } else if (!(await readRoleRequest(admin, roleId))) {
    return state(role.status === "draft" ? "role_limit" : "evaluating", published.size);
  }
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
  const work = syncInvite(admin, { user: args.user, workspaceId: args.workspaceId, mail, publish: true, writeBrief: true })
    .finally(() => running.delete(roleId));
  running.set(roleId, work);
  return work;
}
