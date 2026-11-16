import "server-only";

import type { User } from "@supabase/supabase-js";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Before 20261117090000_gtm_mails_opens is applied (function or columns missing) nothing is counted.
const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST202", "42883"]);

/**
 * The Harper page a GTM mail's button opens reports that it was on screen (after a second, in a browser). Counted
 * on the mail (first/last opened, count; repeats within 30 seconds once) when the mail exists and went out. Not
 * counted when the viewer is signed in as Harper staff (checking the page). Returns whether it was counted.
 */
export async function recordGtmMailOpen(args: { mailId: string; viewer?: User | null }) {
  if (!UUID.test(args.mailId)) return false;
  if (args.viewer && isInternalDomainEmail(args.viewer.email)) return false;
  const { data, error } = await (getSupabaseAdmin().rpc as any)("record_gtm_mail_open_v1", { p_mail_id: args.mailId });
  if (error) {
    if (MISSING.has(String(error.code))) return false;
    throw error;
  }
  return data === true;
}
