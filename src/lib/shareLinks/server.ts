import "server-only";

import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { startPostingDraftRole, writePostingRoleBrief } from "@/lib/gtmPlays/companyInvite.server";
import { shareLinkRoleId } from "@/lib/gtmPlays/companyInviteRole";
import { GTM_WORKSPACE_ID, HARPER_WORKSPACE_ID } from "@/lib/gtmPlays/constants";
import { gtmWrite } from "@/lib/gtmPlays/db.server";
import { gtmMailLinkOrigin, type GtmJd } from "@/lib/gtmPlays/shared";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  DEFAULT_SHARE_LINK_SCOPE,
  SHARE_LINK_PATH,
  isPersonalMailDomain,
  isShareLinkToken,
  sameShareLinkCompany,
  shareLinkDomain,
  shareLinkLanguage,
  shareLinkPostingKey,
  type ShareLinkClaim,
  type ShareLinkCta,
  type ShareLinkPosting,
  type ShareLinkScope,
  type ShareLinkSource,
} from "./shared";
import { linksTable, MISSING, readOpenLink, type ShareLinkRow } from "./page.server";
import { readShareLinkProfile, writeShareLinkSnapshot } from "./snapshot.server";

export { readShareLinkPage, readShareLinkTeaser, type ShareLinkRow } from "./page.server";

type Admin = ReturnType<typeof getSupabaseAdmin>;

export function shareLinkUrl(token: string, origin: string = gtmMailLinkOrigin()) {
  return `${origin}${SHARE_LINK_PATH}/${token}`;
}

const newToken = () => randomBytes(16).toString("base64url");

export class ShareLinkUnavailableError extends Error {
  constructor(readonly reason: "candidate_unavailable" | "company_blocked") {
    super(`Share link unavailable: ${reason}`);
  }
}

/**
 * The link for one candidate, company and posting: the active one if it exists (a resent application reuses it),
 * else a new one with the snapshot written now. The caller has the candidate's consent (the approved application).
 * The company is the recipients' company domain when there is one; mail only to personal addresses (gmail and the
 * like) and web forms tie the link to the company by its name (the posting's company).
 */
export async function createShareLink(args: {
  admin?: Admin;
  talentId: string;
  companyName: string;
  /** The company's mail or web domain, when known. */
  companyDomain?: string | null;
  recipientEmails?: string[];
  posting: ShareLinkPosting;
  /** Fuller posting facts (the posting text), read only when a new link is made. Same URL and title. */
  loadPosting?: () => Promise<ShareLinkPosting | null>;
  source: ShareLinkSource;
  operationId?: string | null;
  scope?: ShareLinkScope;
  consentedAt?: string | null;
  /** Internal: set on the one retry after a concurrent insert. */
  retried?: boolean;
}): Promise<{ link: ShareLinkRow; url: string; created: boolean }> {
  const admin = args.admin ?? getSupabaseAdmin();
  const companyName = args.companyName.trim().slice(0, 160);
  const recipients = [...new Set((args.recipientEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const recipientDomain = recipients.map(shareLinkDomain).find((domain) => domain && !isPersonalMailDomain(domain)) ?? null;
  const companyDomain = shareLinkDomain(args.companyDomain) ?? recipientDomain;
  const postingKey = shareLinkPostingKey(args.posting);

  // Checked every time, a reused link included: the person may have left or blocked the company since.
  const profile = await readShareLinkProfile(admin, args.talentId);
  if (!profile) throw new ShareLinkUnavailableError("candidate_unavailable");
  const blocked = [companyName.toLowerCase(), companyDomain?.split(".")[0] ?? ""].filter(Boolean);
  if (profile.blockedCompanies.some((name) => blocked.includes(name))) throw new ShareLinkUnavailableError("company_blocked");

  const { data: existing, error: existingError } = await linksTable(admin).select("*")
    .eq("talent_id", args.talentId).eq("status", "active").eq("posting_key", postingKey);
  if (existingError) throw existingError;
  const current = ((existing ?? []) as ShareLinkRow[])
    .find((row) => sameShareLinkCompany(row, { domain: companyDomain, name: companyName }));
  if (current && Date.parse(current.expires_at) > Date.now()) {
    // A link made for a personal address or a web form learns the company's domain from a later company address
    // (best effort: another active link may already hold that domain for the posting).
    if (!current.company_domain && companyDomain) {
      const { error: domainError } = await linksTable(admin).update({ company_domain: companyDomain })
        .eq("id", current.id).is("company_domain", null);
      if (!domainError) current.company_domain = companyDomain;
      else if (domainError.code !== "23505") console.warn("[share-link] company domain", domainError.code);
    }
    return { link: current, url: shareLinkUrl(current.token), created: false };
  }

  const scope = args.scope ?? DEFAULT_SHARE_LINK_SCOPE;
  const posting = (args.loadPosting ? await args.loadPosting() : null) ?? args.posting;
  const language = shareLinkLanguage(posting, profile);
  const snapshot = await writeShareLinkSnapshot({ profile, companyName, posting, scope, language });
  // An expired link for the same target steps aside (the unique index covers active ones only).
  if (current) {
    const { error } = await linksTable(admin).update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", current.id);
    if (error) throw error;
  }
  const { data, error } = await linksTable(admin).insert({
    token: newToken(),
    talent_id: args.talentId,
    company_name: companyName,
    company_domain: companyDomain,
    recipient_emails: recipients,
    posting,
    posting_key: postingKey,
    source: args.source,
    operation_id: args.operationId ?? null,
    scope,
    snapshot,
    language,
    consented_at: args.consentedAt ?? null,
  }).select("*").single();
  if (error) {
    // A concurrent call made it first: use that one.
    if (error.code === "23505" && !args.retried) return createShareLink({ ...args, admin, retried: true });
    throw error;
  }
  const link = data as ShareLinkRow;
  return { link, url: shareLinkUrl(link.token), created: true };
}

/**
 * The page reports an open (after it has been on screen) or a button press. Not counted when the viewer is
 * signed in as the candidate (checking their own link) or as Harper staff.
 */
export async function recordShareLinkEvent(args: {
  token: string;
  event: "open" | "cta";
  cta?: ShareLinkCta | null;
  viewer?: User | null;
}) {
  if (!isShareLinkToken(args.token)) return false;
  if (args.viewer && isInternalDomainEmail(args.viewer.email)) return false;
  if (args.viewer) {
    const { data, error } = await linksTable(getSupabaseAdmin()).select("talent_id").eq("token", args.token).maybeSingle();
    if (error && !MISSING.has(String(error.code))) throw error;
    if ((data as { talent_id: string } | null)?.talent_id === args.viewer.id) return false;
  }
  const { data, error } = await (getSupabaseAdmin().rpc as any)("record_talent_share_link_event_v1", {
    p_token: args.token, p_event: args.event, p_cta: args.cta ?? null,
  });
  if (error) {
    if (MISSING.has(String(error.code)) || error.code === "PGRST202") return false;
    throw error;
  }
  return data === true;
}

// Put after the candidate's name in the Role chat's input (the name is a mention there).
const QUESTIONS: Record<"ko" | "en", Partial<Record<ShareLinkCta, string>>> = {
  ko: { salary: "희망 연봉이 어떻게 되나요?", start: "언제부터 일할 수 있나요?", schedule: "인터뷰 일정을 잡고 싶어요." },
  en: { salary: "What compensation are they looking for?", start: "When could they start?", schedule: "I’d like to schedule an interview." },
};

async function readAuthority(admin: Admin, workspaceId: string, userId: string) {
  const { data, error } = await admin.from("company_user_workspace")
    .select("authority").eq("company_workspace_id", workspaceId).eq("company_user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as { authority: string } | null)?.authority ?? null;
}

type RoleRow = { role_id: string; company_workspace_id: string; name: string; status: string };

async function readRole(admin: Admin, roleId: string): Promise<RoleRow | null> {
  const { data, error } = await admin.from("company_roles")
    .select("role_id,company_workspace_id,name,status").eq("role_id", roleId).maybeSingle();
  if (error) throw error;
  return (data as RoleRow | null) ?? null;
}

/**
 * A Role this workspace already has for the same posting: by the posting link (made earlier from another link or
 * by hand), or, for a posting without a link, the Role another candidate link made for the same title. Several
 * candidates who applied to one posting land on one Role.
 */
async function readPostingRole(admin: Admin, workspaceId: string, posting: Pick<ShareLinkPosting, "url" | "title">): Promise<RoleRow | null> {
  const base = () => admin.from("company_roles").select("role_id,company_workspace_id,name,status")
    .eq("company_workspace_id", workspaceId).neq("status", "deleted");
  const { data, error } = posting.url
    ? await base().eq("external_jd_url", posting.url).order("created_at", { ascending: true }).limit(1)
    : await base().is("external_jd_url", null).eq("name", posting.title.trim().slice(0, 160))
      .not("information->shareLink", "is", null).order("created_at", { ascending: true }).limit(1);
  if (error) throw error;
  return ((data ?? []) as RoleRow[])[0] ?? null;
}

function postingJd(link: ShareLinkRow, posting: ShareLinkPosting): GtmJd {
  return {
    source: posting.url ? "url" : "text",
    companyName: posting.companyName ?? link.company_name,
    title: posting.title,
    description: posting.description ?? "",
    url: posting.url,
    location: posting.location,
    sourceRoleId: null,
    sourceWorkspaceId: null,
    contactEmails: [],
  };
}

/**
 * The company's name from the link, when the person signing up is from the company the candidate wrote to and
 * the workspace still shows only the signup domain (onboarding's company step can still change it).
 */
async function nameWorkspaceFromLink(admin: Admin, args: { workspaceId: string; user: User; link: ShareLinkRow }) {
  const name = (args.link.posting.companyName ?? args.link.company_name).trim();
  const userDomain = shareLinkDomain(args.user.email);
  if (!name || !userDomain || userDomain !== args.link.company_domain) return;
  const { error } = await admin.from("company_workspace").update({ company_name: name.slice(0, 160) } as never)
    .eq("company_workspace_id", args.workspaceId).eq("signup_domain", userDomain).eq("company_name", userDomain);
  if (error) console.warn("[share-link] workspace name", error);
}

/** The card the company sees in "연결을 요청할 후보": the snapshot, marked as the candidate's own interest. */
function cardPresentation(link: ShareLinkRow, roleName: string) {
  const { snapshot } = link;
  const note = snapshot.fit.join(" ");
  return {
    version: "share_link_v1",
    name: snapshot.name,
    headline: snapshot.headline,
    summary: snapshot.summary,
    tldr: snapshot.summary,
    harperNote: note,
    harper_note: note,
    roleName,
    candidateRequestedReview: true,
    alsoSuitableRoleIds: [],
    alsoSuitableRoles: [],
  };
}

/**
 * The company signed in from /c/<token> (then /org?share=<token>): a Role from the posting (or the Role it
 * already has for that posting link), the candidate on it as "연결을 요청할 후보", the link marked claimed.
 * Safe to call again: it continues where an earlier call stopped.
 */
export async function claimShareLink(args: {
  user: User;
  token: string;
  workspaceId: string;
  cta?: ShareLinkCta | null;
}): Promise<ShareLinkClaim> {
  if (isInternalDomainEmail(args.user.email) || args.workspaceId === HARPER_WORKSPACE_ID || args.workspaceId === GTM_WORKSPACE_ID) {
    return { status: "internal" };
  }
  const admin = getSupabaseAdmin();
  const link = await readOpenLink(admin, args.token);
  if (!link) return { status: "unavailable" };
  if (link.claimed_workspace_id && link.claimed_workspace_id !== args.workspaceId) return { status: "taken" };
  const authority = await readAuthority(admin, args.workspaceId, args.user.id);
  if (authority !== "owner" && authority !== "admin") return { status: "forbidden" };
  const { posting } = link;

  const ownRoleId = shareLinkRoleId(link.id, args.workspaceId);
  let role = await readRole(admin, ownRoleId) ?? await readPostingRole(admin, args.workspaceId, posting);
  if (!role) {
    const { error } = await (admin.rpc as any)("create_company_team_role_v1", {
      p_workspace: args.workspaceId,
      p_actor: args.user.id,
      p_role: ownRoleId,
      p_name: posting.title.trim().slice(0, 160),
      p_information: { shareLink: { linkId: link.id, claimedBy: args.user.id, claimedAt: new Date().toISOString() } },
    });
    if (error) {
      if (error.message === "org_team_role_forbidden") return { status: "forbidden" };
      // Another tab or a colleague made it a moment ago: continue with that Role.
      if (error.code !== "23505") throw error;
    }
    role = await readRole(admin, ownRoleId);
    if (!role) throw new Error("Role was not created");
  }
  if (role.company_workspace_id !== args.workspaceId || role.status === "deleted") return { status: "unavailable" };

  // The candidate is on the Role first, so a retry after a failure below still finds them there.
  const { error: attachError } = await (admin.rpc as any)("attach_shared_candidate_v1", {
    p_link_id: link.id,
    p_workspace_id: args.workspaceId,
    p_role_id: role.role_id,
    p_presentation: cardPresentation(link, role.name),
    p_selection_reason: link.snapshot.summary,
  });
  if (attachError) throw attachError;

  // The Role this link made gets the posting and turns on now (no model call), so the company lands on the usual
  // Role page with the candidate at once; its request and criteria follow (completeShareLinkRole, after the
  // answer). A Role the company already had is left as it is. At the plan's active Role limit it stays a draft.
  let roleActive = role.status !== "draft";
  if (!roleActive && role.role_id === ownRoleId) {
    roleActive = await startPostingDraftRole(admin, { role, jd: postingJd(link, posting) });
  }

  const claimedAt = new Date().toISOString();
  const { error: claimError } = await linksTable(admin).update({
    claimed_by: args.user.id, claimed_workspace_id: args.workspaceId, claimed_role_id: role.role_id,
    claimed_at: claimedAt, updated_at: claimedAt,
  }).eq("id", link.id).is("claimed_at", null);
  if (claimError) throw claimError;

  // The person who just made this workspace sees the Role first; onboarding is offered later.
  const marker = { linkId: link.id, roleId: role.role_id, talentId: link.talent_id, claimedBy: args.user.id, claimedAt };
  await gtmWrite((sql) => sql`
    update public.company_workspace
    set signup_state = signup_state || jsonb_build_object('shareLink', ${sql.json(marker)}::jsonb)
    where company_workspace_id = ${args.workspaceId}::uuid
      and signup_state ->> 'createdBy' = ${args.user.id}
      and not (signup_state ? 'shareLink')
  `).catch((error) => console.warn("[share-link] signup marker", error));
  await nameWorkspaceFromLink(admin, { workspaceId: args.workspaceId, user: args.user, link });

  const question = args.cta ? QUESTIONS[link.language][args.cta] ?? null : null;
  return {
    status: "claimed",
    roleId: role.role_id,
    talentId: link.talent_id,
    name: link.snapshot.name,
    workspaceId: args.workspaceId,
    roleActive,
    question,
  };
}

/**
 * After the claim has answered: the request and criteria of the Role the link made (one model call), which also
 * starts its matching. Nothing to do for a Role the company already had or one that has them.
 */
export async function completeShareLinkRole(args: { user: User; token: string; workspaceId: string }) {
  const admin = getSupabaseAdmin();
  const link = await readOpenLink(admin, args.token);
  if (!link || link.claimed_workspace_id !== args.workspaceId) return;
  const role = await readRole(admin, shareLinkRoleId(link.id, args.workspaceId));
  if (!role || role.status === "deleted") return;
  const write = () => writePostingRoleBrief(admin, {
    roleId: role.role_id,
    jd: postingJd(link, link.posting),
    user: args.user,
    source: "share_link",
    actorLabel: "후보가 지원한 공고",
  });
  // Nothing polls this Role afterwards, so one more try on a passing model or network error.
  await write().catch((error) => {
    console.warn("[share-link] role request, trying again", error);
    return write();
  });
}
