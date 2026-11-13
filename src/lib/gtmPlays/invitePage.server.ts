import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { GtmPostingSnapshot } from "./mailSend.server";

/**
 * Read by a Pages Router page's getServerSideProps (/jobs/invite/[mailId]), so it imports only the database
 * client and no "server-only" marker (the Pages Router refuses both that and the company-side agent code the
 * mail sender pulls in). Never import it from client code: it uses the service-role client.
 */

/** How long a candidate mail's link keeps working (its page and putting its posting in the inbox). */
export const GTM_INVITE_VALID_MS = 90 * 86_400_000;

export type GtmInvitePage = {
  mailId: string;
  language: "ko" | "en";
  senderName: string | null;
  posting: GtmPostingSnapshot;
  /** Signing up or in from the page puts the posting in the inbox (an outside posting link was kept). */
  importable: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The page a candidate mail's button opens (/jobs/invite/<id>): the posting the mail was about, readable
 * before sign-up. Only sent candidate mails within the link's validity that carry a posting.
 */
export async function readGtmInvitePage(mailId: string): Promise<GtmInvitePage | null> {
  if (!UUID.test(mailId)) return null;
  // gtm_mails is new and not in the generated Database types yet.
  const table = (getSupabaseAdmin() as unknown as { from: (name: string) => any }).from("gtm_mails");
  const { data, error } = await table
    .select("id,audience,status,created_at,language,from_name,posting,posting_url").eq("id", mailId).maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703") return null;
    throw error;
  }
  const row = data as { id: string; audience: string; status: string; created_at: string; language: string | null;
    from_name: string | null; posting: GtmPostingSnapshot | null; posting_url: string | null } | null;
  if (!row || row.audience !== "candidate" || row.status !== "sent" || !row.posting?.title) return null;
  if (Date.now() - Date.parse(row.created_at) > GTM_INVITE_VALID_MS) return null;
  return {
    mailId: row.id,
    language: row.language === "en" ? "en" : "ko",
    senderName: row.from_name,
    posting: row.posting,
    // The mail keeps an outside posting link only when the job-link import can read it.
    importable: Boolean(row.posting_url) && !/^https?:\/\/(www\.)?matchharper\.com\//i.test(row.posting_url ?? ""),
  };
}
