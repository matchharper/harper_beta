import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  isShareLinkToken,
  type ShareLinkPage,
  type ShareLinkPosting,
  type ShareLinkScope,
  type ShareLinkSnapshot,
  type ShareLinkSource,
  type ShareLinkTeaser,
} from "./shared";

/**
 * Read by the Pages Router page /c/[token] (getServerSideProps), so it imports only the database client and no
 * "server-only" marker: the Pages Router refuses both that and the company-side code the claim pulls in (same as
 * gtmPlays/invitePage.server). Never import it from client code: it uses the service-role client.
 */

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

export function linksTable(admin: Admin) {
  // talent_share_links is new and not in the generated Database types yet.
  return (admin as unknown as { from: (table: string) => any }).from("talent_share_links");
}

// Before 20261116090000_talent_share_links is applied there is no link to read.
export const MISSING = new Set(["42P01", "PGRST205"]);

/** A link the company may still open: active, not expired, candidate still here. */
export async function readOpenLink(admin: Admin, token: string): Promise<ShareLinkRow | null> {
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
