import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { harperJobSlug } from "./candidateMail.server";
import { shortPostingSummary, type GtmInviteFirstScreen } from "./inviteFirstScreen";
import { GTM_INVITE_VALID_MS } from "./invitePage.server";
import type { GtmPostingSnapshot } from "./mailSend.server";
import { gtmMailWentOut } from "./shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING = new Set(["42P01", "PGRST205", "42703"]);

/**
 * The posting a sent #4 후보 메일 was about, for the first screen after sign-up: the posting as the mail kept it,
 * or the Harper job page (official job) its button opened. Only sent candidate mails within the link's validity;
 * null otherwise. The same posting is public on the mail's own page (/jobs/invite/<id>) or the job page.
 */
export async function readGtmInviteFirstScreen(mailId: string): Promise<GtmInviteFirstScreen | null> {
  if (!UUID.test(mailId)) return null;
  const admin = getSupabaseAdmin();
  // gtm_mails is new and not in the generated Database types yet.
  const { data, error } = await (admin as unknown as { from: (name: string) => any }).from("gtm_mails")
    .select("id,audience,status,provider_message_id,created_at,posting,posting_url").eq("id", mailId).maybeSingle();
  if (error) {
    if (MISSING.has(String(error.code))) return null;
    throw error;
  }
  const mail = data as { id: string; audience: string; status: string; provider_message_id: string | null; created_at: string;
    posting: GtmPostingSnapshot | null; posting_url: string | null } | null;
  if (!mail || mail.audience !== "candidate" || !gtmMailWentOut(mail)) return null;
  if (Date.now() - Date.parse(mail.created_at) > GTM_INVITE_VALID_MS) return null;

  if (mail.posting?.title) {
    return {
      mailId: mail.id,
      companyName: mail.posting.companyName?.trim() || null,
      title: mail.posting.title.trim(),
      location: mail.posting.location?.trim() || null,
      summary: shortPostingSummary(mail.posting.description),
    };
  }
  const slug = harperJobSlug(mail.posting_url);
  if (!slug) return null;
  const { data: job, error: jobError } = await admin.from("official_jobs")
    .select("company_name,role_title,location,short_description,role_description_markdown")
    .eq("slug", slug).eq("is_published", true).maybeSingle();
  if (jobError) throw jobError;
  if (!job) return null;
  return {
    mailId: mail.id,
    companyName: job.company_name?.trim() || null,
    title: job.role_title.trim(),
    location: job.location?.trim() || null,
    summary: shortPostingSummary(job.short_description?.trim() || job.role_description_markdown),
  };
}
