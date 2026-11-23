import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { storedOffer } from "./agent/channels";
import { signupLanding, type SignupLanding } from "./agent/signupMove";
import { harperJobSlug } from "./candidateMail.server";
import { firstScreenPostings, shortPostingSummary, type GtmInviteFirstScreen } from "./inviteFirstScreen";
import { GTM_INVITE_VALID_MS } from "./invitePage.server";
import type { GtmPostingSnapshot } from "./mailSend.server";
import { gtmMailWentOut } from "./shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING = new Set(["42P01", "PGRST205", "42703"]);

/**
 * Where sign-up from a sent candidate mail starts: its first screen (the posting, readGtmInviteFirstScreen) and where
 * the short onboarding ends (signupLanding: an agent's coaching mail in Harper's chat, every other mail in 내 기회).
 */
export async function readGtmInviteStart(mailId: string): Promise<{ posting: GtmInviteFirstScreen | null; landing: SignupLanding }> {
  const none = { posting: null, landing: signupLanding(null) };
  if (!UUID.test(mailId)) return none;
  const admin = getSupabaseAdmin();
  // gtm_mails is new and not in the generated Database types yet.
  const db = admin as unknown as { from: (name: string) => any };
  const { data, error } = await db.from("gtm_mails")
    .select("id,audience,campaign,status,provider_message_id,created_at,posting,posting_url,postings,agent_person_id").eq("id", mailId).maybeSingle();
  if (error) {
    if (MISSING.has(String(error.code))) return none;
    throw error;
  }
  const mail = data as { id: string; audience: string; campaign: string | null; status: string; provider_message_id: string | null;
    created_at: string; posting: GtmPostingSnapshot | null; posting_url: string | null; postings: unknown; agent_person_id: string | null } | null;
  if (!mail || mail.audience !== "candidate" || !gtmMailWentOut(mail)) return none;
  if (Date.now() - Date.parse(mail.created_at) > GTM_INVITE_VALID_MS) return none;
  // What the agent's first mail offered (gtm_agent_people.message_kind, Shaun 11/23); a #4 mail has no person.
  let landing = none.landing;
  if (mail.campaign === "agent" && mail.agent_person_id) {
    const { data: person, error: personError } = await db.from("gtm_agent_people").select("message_kind").eq("id", mail.agent_person_id).maybeSingle();
    if (personError) console.error("[gtm/invite-start] offer", mail.id, personError);
    landing = signupLanding(storedOffer((person as { message_kind?: string | null } | null)?.message_kind));
  }
  return { posting: await firstScreenOf(admin, mail), landing };
}

/**
 * The posting a sent #4 후보 메일 was about, for the first screen after sign-up: the posting as the mail kept it,
 * or the Harper job page (official job) its button opened. Only sent candidate mails within the link's validity;
 * null otherwise. The same posting is public on the mail's own page (/jobs/invite/<id>) or the job page.
 */
export async function readGtmInviteFirstScreen(mailId: string): Promise<GtmInviteFirstScreen | null> {
  return (await readGtmInviteStart(mailId)).posting;
}

async function firstScreenOf(
  admin: ReturnType<typeof getSupabaseAdmin>,
  mail: { id: string; campaign: string | null; posting: GtmPostingSnapshot | null; posting_url: string | null; postings: unknown },
): Promise<GtmInviteFirstScreen | null> {
  if (mail.posting?.title) {
    return {
      mailId: mail.id,
      companyName: mail.posting.companyName?.trim() || null,
      title: mail.posting.title.trim(),
      location: mail.posting.location?.trim() || null,
      summary: shortPostingSummary(mail.posting.description),
      // An agent mail proposes 2-3 postings: the first screen lists them all.
      postings: mail.campaign === "agent" ? firstScreenPostings(mail.postings) : [],
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
    postings: [],
  };
}
