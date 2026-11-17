import "server-only";

import { parseCareerJobUrl } from "@/lib/career/jobLinkImport";
import { importCareerJobLink } from "@/lib/career/jobLinkImportServer";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { GTM_INVITE_VALID_MS } from "./invitePage.server";
import { gtmMailsTable } from "./mailSend.server";

/**
 * The claim path for candidate mails already sent (#4 sent them before it was removed; #5's Role mode sent them
 * before it was removed too; the #5 agent sends them now). The mail's Harper button carries the mail's id: when
 * the person opens Harper from it and signs in (new or existing account), the posting is put in their inbox with
 * the same import a pasted job link uses (importCareerJobLink), or the mail's Role is added (claimGtmCandidateMail).
 */

const CLAIM_VALID_MS = GTM_INVITE_VALID_MS;

/** The posting link the button puts into the person's inbox: only links the job-link import can read. */
export function gtmImportablePostingUrl(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  try {
    parseCareerJobUrl(text);
    return /^https?:\/\//i.test(text) && !/^https?:\/\/(www\.)?matchharper\.com\//i.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** A posting on Harper's own job pages (matchharper.com/jobs/<slug>): Harper customers' published Roles. */
const HARPER_JOB_PAGE = /^https?:\/\/(?:www\.)?matchharper\.com\/jobs\/([a-z0-9][a-z0-9-]*)\/?(?:[?#].*)?$/i;

export function harperJobSlug(value: string | null | undefined) {
  return HARPER_JOB_PAGE.exec(value?.trim() ?? "")?.[1]?.toLowerCase() ?? null;
}

export type GtmClaimResult =
  | { status: "imported"; roleId: string; recommendationId: string }
  | { status: "no_posting" | "unavailable" | "not_found" | "expired" };

/**
 * The mail's own Role in the person's 내 기회 (ensure_gtm_mail_opportunity_v1): a customer's Role, or a 'Harper GTM'
 * Role, which stays sealed from everyone but the people its mails reached. null when the mail has no Role or the
 * Role cannot be added (closed, another sealed Role, or a company the person blocked).
 */
async function addGtmMailRole(admin: ReturnType<typeof getTalentSupabaseAdmin>, userId: string, mailId: string) {
  const { data, error } = await (admin.rpc as unknown as (
    name: string, args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "ensure_gtm_mail_opportunity_v1", { p_talent: userId, p_mail: mailId },
  );
  if (error) throw new Error(error.message ?? "Could not add the mail's Role");
  const result = (data ?? {}) as { status?: string; roleId?: string; recommendationId?: string };
  return result.status === "added" && result.roleId && result.recommendationId
    ? { roleId: result.roleId, recommendationId: result.recommendationId }
    : null;
}

/**
 * When someone opens Harper from a candidate mail's button and is signed in: the mail's posting goes into
 * their inbox (a New opportunity, as when Harper finds a posting for them). Anyone who opens the link gets
 * it; the first person is kept on the mail row. In order:
 *   an outside posting link the import can read   imported as an outside posting (as a pasted job link)
 *   otherwise, the mail's Role                     that Role as an internal opportunity (a customer's Role, or the
 *                                                  'Harper GTM' Role a pasted JD or an unreadable link was saved as)
 *   a Harper job page                              nothing here: that Role's own page and sign-up carry on
 * `internal`: the person is Harper staff (checking the link). They get the posting too, but the mail row does not
 * keep them, so the person the mail was for can still come in from it and the numbers count only people
 * outside Harper (as its clicks do).
 */
export async function claimGtmCandidateMail(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>; userId: string; mailId: string; locale: "ko" | "en";
  internal?: boolean;
}): Promise<GtmClaimResult> {
  const table = gtmMailsTable(args.admin as unknown as ReturnType<typeof getSupabaseAdmin>);
  const { data, error } = await table.select("id,campaign,audience,status,posting_url,postings,role_id,created_at,claimed_talent_id")
    .eq("id", args.mailId).maybeSingle();
  if (error) throw error;
  const mail = data as { id: string; campaign: string; audience: string; status: string; posting_url: string | null;
    postings: Array<{ url?: string | null; roleId?: string | null; kind?: string }> | null; role_id: string | null; created_at: string;
    claimed_talent_id: string | null } | null;
  if (!mail || mail.audience !== "candidate" || mail.status !== "sent") return { status: "not_found" };
  if (Date.now() - Date.parse(mail.created_at) > CLAIM_VALID_MS) return { status: "expired" };
  // #5 agent mails propose 2-3 postings: the other ones go in too (best effort; the mail's main posting below decides
  // the answer, as for a #4 mail). A Harper Role (customer or GTM) as its Role, an outside posting by its link.
  if (mail.campaign === "agent" && Array.isArray(mail.postings)) {
    for (const item of mail.postings) {
      if (item.kind === "external" || !item.roleId || item.roleId === mail.role_id) continue;
      const { error: roleError } = await (args.admin.rpc as unknown as (
        name: string, values: Record<string, unknown>,
      ) => Promise<{ error: { message?: string } | null }>)("ensure_gtm_mail_opportunity_v2", { p_talent: args.userId, p_mail: mail.id, p_role: item.roleId });
      if (roleError) console.error("[gtm-agent] role into inbox", item.roleId, roleError);
    }
    const extra = [...new Set(mail.postings.filter((item) => item.kind === "external").map((item) => gtmImportablePostingUrl(item.url ?? null))
      .filter((url): url is string => Boolean(url)))]
      .filter((url) => url !== gtmImportablePostingUrl(mail.posting_url));
    for (const url of extra) {
      try {
        await importCareerJobLink({ admin: args.admin, talentId: args.userId, url, savedStage: null, preserveExistingProgress: true, locale: args.locale });
      } catch (error) {
        const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
        if (!/closed|unavailable|blocked|Test-only|job_details_required/i.test(message)) console.error("[gtm-agent] posting import", url, error);
      }
    }
  }
  // A Harper job page carries on with that Role's own flow (its page and signup); only outside postings are
  // imported here. Either way the mail row keeps who came in from it.
  const postingUrl = gtmImportablePostingUrl(mail.posting_url);
  let imported: Awaited<ReturnType<typeof importCareerJobLink>> | null = null;
  let unavailable = false;
  let blocked = false;
  if (postingUrl) {
    try {
      imported = await importCareerJobLink({
        admin: args.admin, talentId: args.userId, url: postingUrl, savedStage: null, preserveExistingProgress: true,
        locale: args.locale,
      });
    } catch (error) {
      // The posting closed, the company is one they blocked, or the page can no longer be read: nothing to
      // add, and trying again on the next visit would not change that.
      const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
      if (!/closed|unavailable|blocked|Test-only|job_details_required/i.test(message)) throw error;
      unavailable = true;
      blocked = /blocked/i.test(message);
    }
  }
  // No outside posting went in: the mail's Role does, unless the button opened a Harper job page (that Role's own
  // page and sign-up carry on there).
  let added: { roleId: string; recommendationId: string } | null = null;
  if (!imported && !blocked && mail.role_id && !harperJobSlug(mail.posting_url)) {
    added = await addGtmMailRole(args.admin, args.userId, mail.id);
    if (!added) unavailable = true;
  }
  const placed = imported ? { roleId: imported.roleId, recommendationId: imported.recommendationId } : added;
  if (!mail.claimed_talent_id && !args.internal) {
    const { error: claimError } = await table.update({
      claimed_talent_id: args.userId, claimed_recommendation_id: placed?.recommendationId ?? null,
      claimed_at: new Date().toISOString(),
    }).eq("id", mail.id).is("claimed_talent_id", null);
    if (claimError) console.error("[gtm-plays] claimed but the mail row was not updated", mail.id, claimError);
  }
  if (placed) return { status: "imported", roleId: placed.roleId, recommendationId: placed.recommendationId };
  return { status: unavailable ? "unavailable" : "no_posting" };
}
