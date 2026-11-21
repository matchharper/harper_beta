import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { GTM_INVITE_VALID_MS } from "./invitePage.server";
import { canSeeGtmInvitePrefill, linkedinProfileUrl, type GtmInvitePrefillMail } from "./invitePrefill";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING = new Set(["42P01", "PGRST205", "42703"]);

type MailRow = GtmInvitePrefillMail & { agent_person_id: string | null };

/**
 * The LinkedIn profile an agent mail (#5) was sent from, for the signed-in person's onboarding (프로필 연결): the
 * profile the agent found the person by (a LinkedIn applicant, an open-to-work profile). #4 mails are gone. Only for a signed-in viewer while the
 * mail is unclaimed or claimed by that viewer (canSeeGtmInvitePrefill); Harper members are already onboarded.
 */
export async function readGtmInvitePrefill(args: { mailId: string; viewer: User | null }) {
  const none = { linkedinUrl: null as string | null };
  if (!args.viewer || !UUID.test(args.mailId)) return none;
  const admin = getSupabaseAdmin();
  // gtm_mails is new and not in the generated Database types yet.
  const { data, error } = await (admin as unknown as { from: (name: string) => any }).from("gtm_mails")
    .select("audience,status,provider_message_id,created_at,claimed_talent_id,agent_person_id").eq("id", args.mailId).maybeSingle();
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
  return none;
}
