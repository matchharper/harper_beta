import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { storedEvents, upcomingEvents } from "./agent/events";
import type { AgentOfferEvent } from "./agent/types";
import type { GtmPostingSnapshot } from "./mailSend.server";
import { gtmMailWentOut } from "./shared";

/**
 * Read by a Pages Router page's getServerSideProps (/jobs/invite/[mailId]), so it imports only the database
 * client and no "server-only" marker (the Pages Router refuses both that and the company-side agent code the
 * mail sender pulls in). Never import it from client code: it uses the service-role client.
 */

/** How long a candidate mail's link keeps working (its page and putting its posting in the inbox). */
export const GTM_INVITE_VALID_MS = 90 * 86_400_000;

/** One of the postings a #5 agent mail proposes (gtm_mails.postings), as its page shows it. */
/** summary/fit: the reason in the 후보자 링크 frame (company need → their experience → fit), when the mail has it. */
export type GtmInvitePosting = {
  companyName: string; title: string; location: string | null; url: string | null; why: string; summary: string | null; fit: string[];
};

export type GtmInvitePage = {
  mailId: string;
  language: "ko" | "en";
  senderName: string | null;
  /** The mail's main posting; null for an agent's general mail that proposed events only. */
  posting: GtmPostingSnapshot | null;
  /** #5 agent mails: the 2-3 postings the mail proposed (null for a #4 mail about one posting). */
  postings: GtmInvitePosting[] | null;
  /** An agent's general mail: its events still to come (agent/events.ts), shown under its postings; [] otherwise. */
  events: AgentOfferEvent[];
  /** utm_campaign of the continue link: gtm_outreach (#4) or gtm_agent (#5). */
  campaign: "gtm_outreach" | "gtm_agent";
  /**
   * Signing up or in from the page puts the posting in the inbox: an outside posting link was kept, or the mail
   * carries its Role (a customer's Role or a 'Harper GTM' Role, added as an internal opportunity).
   */
  importable: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS = "id,campaign,audience,status,provider_message_id,created_at,language,from_name,posting,postings,posting_url,role_id";

/**
 * The page a candidate mail's button opens (/jobs/invite/<id>): the posting the mail was about, readable
 * before sign-up. Only sent candidate mails within the link's validity that carry a posting or (an agent's
 * general mail) events still to come; a coaching mail carries neither and goes straight to Harper.
 */
export async function readGtmInvitePage(mailId: string): Promise<GtmInvitePage | null> {
  if (!UUID.test(mailId)) return null;
  // gtm_mails is new and not in the generated Database types yet.
  const mails = () => (getSupabaseAdmin() as unknown as { from: (name: string) => any }).from("gtm_mails");
  let { data, error } = await mails().select(`${COLUMNS},events`).eq("id", mailId).maybeSingle();
  // Before the 11/23 migration gtm_mails has no events column: the page reads the mail without it.
  if (error?.code === "42703") ({ data, error } = await mails().select(COLUMNS).eq("id", mailId).maybeSingle());
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") return null;
    throw error;
  }
  const row = data as { id: string; campaign: string; audience: string; status: string; provider_message_id: string | null; created_at: string;
    language: string | null; from_name: string | null; posting: GtmPostingSnapshot | null;
    postings: Array<Partial<GtmInvitePosting>> | null; posting_url: string | null; role_id: string | null; events?: unknown } | null;
  if (!row || row.audience !== "candidate" || !gtmMailWentOut(row)) return null;
  if (Date.now() - Date.parse(row.created_at) > GTM_INVITE_VALID_MS) return null;
  const events = row.campaign === "agent" ? upcomingEvents(storedEvents(row.events), new Date()) : [];
  if (!row.posting?.title && !events.length) return null;
  return {
    mailId: row.id,
    language: row.language === "en" ? "en" : "ko",
    senderName: row.from_name,
    posting: row.posting?.title ? row.posting : null,
    postings: row.campaign === "agent" && Array.isArray(row.postings) && row.postings.length
      ? row.postings.flatMap((item) => (item.title && item.companyName ? [{
        companyName: item.companyName, title: item.title, location: item.location ?? null, url: item.url ?? null,
        why: item.why ?? "",
        summary: typeof item.summary === "string" && item.summary.trim() ? item.summary.trim() : null,
        fit: Array.isArray(item.fit) ? item.fit.filter((line): line is string => typeof line === "string" && Boolean(line.trim())).slice(0, 3) : [],
      }] : []))
      : null,
    events,
    campaign: row.campaign === "agent" ? "gtm_agent" : "gtm_outreach",
    // The mail keeps an outside posting link only when the job-link import can read it; without one, its Role goes in.
    importable: Boolean(row.role_id)
      || (Boolean(row.posting_url) && !/^https?:\/\/(www\.)?matchharper\.com\//i.test(row.posting_url ?? "")),
  };
}
