import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { GTM_WORKSPACE_ID } from "./constants";
import { GTM_INVITE_VALID_MS } from "./invitePage.server";
import { canSeeGtmInvitePrefill, linkedinProfileUrl, type GtmInvitePrefillMail } from "./invitePrefill";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING = new Set(["42P01", "PGRST205", "42703"]);

type MailRow = GtmInvitePrefillMail & {
  candidate_source: string | null; candidate_ref: string | null; role_id: string | null; agent_person_id: string | null;
};

/**
 * The LinkedIn profile a #4 후보 메일 was sent from, for the signed-in person's onboarding (프로필 연결): an
 * external search result's or a scraped profile's linkedin.com/in/ URL, or for an agent mail the profile the agent
 * found the person by (a LinkedIn applicant, an open-to-work profile). Only for a signed-in viewer while the
 * mail is unclaimed or claimed by that viewer (canSeeGtmInvitePrefill); Harper members are already onboarded.
 */
export async function readGtmInvitePrefill(args: { mailId: string; viewer: User | null }) {
  const none = { linkedinUrl: null as string | null };
  if (!args.viewer || !UUID.test(args.mailId)) return none;
  const admin = getSupabaseAdmin();
  // gtm_mails is new and not in the generated Database types yet.
  const { data, error } = await (admin as unknown as { from: (name: string) => any }).from("gtm_mails")
    .select("audience,status,provider_message_id,created_at,claimed_talent_id,candidate_source,candidate_ref,role_id,agent_person_id").eq("id", args.mailId).maybeSingle();
  if (error) {
    if (MISSING.has(String(error.code))) return none;
    throw error;
  }
  const mail = data as MailRow | null;
  if (!canSeeGtmInvitePrefill({ viewerId: args.viewer.id, mail, now: Date.now(), validMs: GTM_INVITE_VALID_MS })) return none;
  if (mail?.agent_person_id && UUID.test(mail.agent_person_id)) {
    const { data: person, error: personError } = await (admin as unknown as { from: (name: string) => any }).from("gtm_agent_people")
      .select("profile_url,contact_url").eq("id", mail.agent_person_id).maybeSingle();
    if (personError) {
      if (MISSING.has(String(personError.code))) return none;
      throw personError;
    }
    const row = person as { profile_url: string | null; contact_url: string | null } | null;
    return { linkedinUrl: linkedinProfileUrl(row?.profile_url) ?? linkedinProfileUrl(row?.contact_url) };
  }
  if (!mail?.candidate_ref || !UUID.test(mail.candidate_ref)) return none;

  if (mail.candidate_source === "external") {
    // By the person's own id (one row): a #5 Role run's mail names a customer's real Role while the person was
    // found on its 'Harper GTM' copy, so the mail's role_id is not the row's.
    const { data: row, error: rowError } = await admin.from("external_candidates").select("linkedin_url")
      .eq("company_workspace_id", GTM_WORKSPACE_ID).eq("id", mail.candidate_ref).maybeSingle();
    if (rowError) throw rowError;
    return { linkedinUrl: linkedinProfileUrl((row as { linkedin_url: string | null } | null)?.linkedin_url) };
  }
  if (mail.candidate_source === "scraped") {
    const { data: row, error: rowError } = await admin.from("candid").select("linkedin_url").eq("id", mail.candidate_ref).maybeSingle();
    if (rowError) throw rowError;
    return { linkedinUrl: linkedinProfileUrl((row as { linkedin_url: string | null } | null)?.linkedin_url) };
  }
  return none;
}
