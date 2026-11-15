import "server-only";

import { randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { finishPostingDraftRole } from "@/lib/gtmPlays/companyInvite.server";
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
  shareLinkDomain,
  shareLinkLanguage,
  shareLinkPostingKey,
  type ShareLinkClaim,
  type ShareLinkCta,
  type ShareLinkPage,
  type ShareLinkPosting,
  type ShareLinkScope,
  type ShareLinkSnapshot,
  type ShareLinkSource,
  type ShareLinkTeaser,
} from "./shared";
import { readShareLinkProfile, writeShareLinkSnapshot } from "./snapshot.server";

type Admin = ReturnType<typeof getSupabaseAdmin>;

export type ShareLinkRow = {
  id: string;
  token: string;
  talent_id: string;
  company_name: string;
  company_domain: string | null;
  recipient_emails: string[];
  posting: ShareLinkPosting | null;
  posting_key: string;
  source: ShareLinkSource;
  operation_id: string | null;
  scope: ShareLinkScope;
  snapshot: ShareLinkSnapshot;
  language: "ko" | "en";
  status: "active" | "revoked";
  expires_at: string;
  first_opened_at: string | null;
  open_count: number;
  cta: string | null;
  cta_at: string | null;
  claimed_by: string | null;
  claimed_workspace_id: string | null;
  claimed_role_id: string | null;
  claimed_at: string | null;
  created_at: string;
};

function linksTable(admin: Admin) {
  // talent_share_links is new and not in the generated Database types yet.
  return (admin as unknown as { from: (table: string) => any }).from("talent_share_links");
}

// Before 20261116090000_talent_share_links is applied there is no link to read.
const MISSING = new Set(["42P01", "PGRST205"]);

export function shareLinkUrl(token: string, origin: string = gtmMailLinkOrigin()) {
  return `${origin}${SHARE_LINK_PATH}/${token}`;
}

const newToken = () => randomBytes(16).toString("base64url");

export class ShareLinkUnavailableError extends Error {
  constructor(readonly reason: "candidate_unavailable" | "company_blocked" | "personal_recipient") {
    super(`Share link unavailable: ${reason}`);
  }
}

/**
 * The link for one candidate, company and posting: the active one if it exists (follow-ups reuse it), else a new
 * one with the snapshot written now. The caller has the candidate's consent (Career) or is Harper staff (Ops).
 */
export async function createShareLink(args: {
  admin?: Admin;
  talentId: string;
  companyName: string;
  /** The company's mail or web domain, when known. */
  companyDomain?: string | null;
  recipientEmails?: string[];
  posting: ShareLinkPosting | null;
  /** Fuller posting facts (the posting text), read only when a new link is made. Same URL and title. */
  loadPosting?: () => Promise<ShareLinkPosting | null>;
  source: ShareLinkSource;
  operationId?: string | null;
  scope?: ShareLinkScope;
  createdBy?: string | null;
  consentedAt?: string | null;
}): Promise<{ link: ShareLinkRow; url: string; created: boolean }> {
  const admin = args.admin ?? getSupabaseAdmin();
  const companyName = args.companyName.trim().slice(0, 160);
  const recipients = [...new Set((args.recipientEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const recipientDomain = recipients.map(shareLinkDomain).find((domain) => domain && !isPersonalMailDomain(domain)) ?? null;
  if (recipients.length && !recipientDomain) throw new ShareLinkUnavailableError("personal_recipient");
  const companyDomain = shareLinkDomain(args.companyDomain) ?? recipientDomain;
  const postingKey = shareLinkPostingKey(args.posting);
  const targetKey = (companyDomain ?? companyName).toLowerCase();

  // Checked every time, a reused link included: the person may have left or blocked the company since.
  const profile = await readShareLinkProfile(admin, args.talentId);
  if (!profile) throw new ShareLinkUnavailableError("candidate_unavailable");
  const blocked = [companyName.toLowerCase(), companyDomain?.split(".")[0] ?? ""].filter(Boolean);
  if (profile.blockedCompanies.some((name) => blocked.includes(name))) throw new ShareLinkUnavailableError("company_blocked");

  const { data: existing, error: existingError } = await linksTable(admin).select("*")
    .eq("talent_id", args.talentId).eq("status", "active").eq("posting_key", postingKey);
  if (existingError) throw existingError;
  const current = ((existing ?? []) as ShareLinkRow[])
    .find((row) => (row.company_domain ?? row.company_name).toLowerCase() === targetKey);
  if (current && Date.parse(current.expires_at) > Date.now()) {
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
    created_by: args.createdBy ?? null,
    consented_at: args.consentedAt ?? null,
  }).select("*").single();
  if (error) {
    // A concurrent call made it first: use that one.
    if (error.code === "23505") return createShareLink({ ...args, admin });
    throw error;
  }
  const link = data as ShareLinkRow;
  return { link, url: shareLinkUrl(link.token), created: true };
}

/** A link the company may still open: active, not expired, candidate still here. */
async function readOpenLink(admin: Admin, token: string): Promise<ShareLinkRow | null> {
  if (!isShareLinkToken(token)) return null;
  const { data, error } = await linksTable(admin).select("*").eq("token", token).maybeSingle();
  if (error) {
    if (MISSING.has(String(error.code))) return null;
    throw error;
  }
  const link = data as ShareLinkRow | null;
  if (!link || link.status !== "active" || Date.parse(link.expires_at) <= Date.now()) return null;
  const { data: talent, error: talentError } = await admin.from("talent_users").select("deleted_at")
    .eq("user_id", link.talent_id).maybeSingle();
  if (talentError) throw talentError;
  if (!talent || (talent as { deleted_at: string | null }).deleted_at) return null;
  return link;
}

export async function readShareLinkPage(token: string): Promise<ShareLinkPage | null> {
  const link = await readOpenLink(getSupabaseAdmin(), token);
  if (!link) return null;
  return {
    token: link.token,
    language: link.language,
    companyName: link.company_name,
    posting: link.posting ? { title: link.posting.title, url: link.posting.url } : null,
    snapshot: link.snapshot,
  };
}

export async function readShareLinkTeaser(token: string): Promise<ShareLinkTeaser | null> {
  const link = await readOpenLink(getSupabaseAdmin(), token);
  if (!link) return null;
  return { name: link.snapshot.name, postingTitle: link.posting?.title ?? null, language: link.language };
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

/** A Role this workspace already has for the same posting link (made earlier from another link or by hand). */
async function readPostingRole(admin: Admin, workspaceId: string, url: string | null): Promise<RoleRow | null> {
  if (!url) return null;
  const { data, error } = await admin.from("company_roles").select("role_id,company_workspace_id,name,status")
    .eq("company_workspace_id", workspaceId).eq("external_jd_url", url).neq("status", "deleted")
    .order("created_at", { ascending: true }).limit(1);
  if (error) throw error;
  return ((data ?? []) as RoleRow[])[0] ?? null;
}

function postingJd(link: ShareLinkRow): GtmJd {
  const posting = link.posting!;
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
  const name = (args.link.posting?.companyName ?? args.link.company_name).trim();
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
  const posting = link.posting;
  if (!posting || !posting.title.trim()) return { status: "no_posting" };
  const authority = await readAuthority(admin, args.workspaceId, args.user.id);
  if (authority !== "owner" && authority !== "admin") return { status: "forbidden" };

  const ownRoleId = shareLinkRoleId(link.id, args.workspaceId);
  let role = await readRole(admin, ownRoleId) ?? await readPostingRole(admin, args.workspaceId, posting.url);
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

  // The Role this link made gets the posting, a request and criteria, and turns on (one model call), so the page
  // the company lands on is the usual Role page. A Role the company already had is left as it is. At the plan's
  // active Role limit it stays a draft.
  let roleActive = role.status !== "draft";
  if (!roleActive && role.role_id === ownRoleId) {
    roleActive = await finishPostingDraftRole(admin, {
      role, jd: postingJd(link), user: args.user, source: "share_link", actorLabel: "후보가 보낸 공고",
    });
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

export type ShareLinkListItem = {
  id: string;
  createdAt: string;
  source: ShareLinkSource;
  talentId: string;
  name: string;
  companyName: string;
  postingTitle: string | null;
  url: string;
  openedAt: string | null;
  openCount: number;
  cta: string | null;
  claimedAt: string | null;
};

/** Ops #1: the links Harper made, newest first, with what the company did. */
export async function listShareLinks(args: { days: number; limit?: number }): Promise<ShareLinkListItem[]> {
  const since = new Date(Date.now() - Math.max(1, Math.min(args.days, 365)) * 86_400_000).toISOString();
  const { data, error } = await linksTable(getSupabaseAdmin())
    .select("id,token,created_at,source,talent_id,company_name,posting,snapshot,first_opened_at,open_count,cta,claimed_at")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(Math.min(args.limit ?? 200, 500));
  if (error) {
    if (MISSING.has(String(error.code))) return [];
    throw error;
  }
  return ((data ?? []) as ShareLinkRow[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    talentId: row.talent_id,
    name: row.snapshot?.name ?? "",
    companyName: row.company_name,
    postingTitle: row.posting?.title ?? null,
    url: shareLinkUrl(row.token),
    openedAt: row.first_opened_at,
    openCount: row.open_count,
    cta: row.cta,
    claimedAt: row.claimed_at,
  }));
}
