import "server-only";

import { timingSafeEqual } from "node:crypto";
import { hashReplyToken } from "@/lib/email/security";
import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { GTM_HARPER_ORIGIN } from "./shared";

/**
 * What every GTM mail shares, whichever play sent it (the #5 agent sends; mails #4 sent earlier stay readable):
 * the gtm_mails table, the opt-out link and the posting kept on a candidate mail.
 */

/** Where a candidate mail's person was found (#4 Choice 1 · 2 · 3, and #5 Role runs). */
export type GtmCandidateSource = "member" | "external" | "scraped";

// gtm_mails is new (20261112100000) and not in the generated Database types yet.
export function gtmMailsTable(admin: ReturnType<typeof getSupabaseAdmin>) {
  return (admin as unknown as { from: (table: string) => any }).from("gtm_mails");
}

/** The opt-out link's proof that it came from this mail (derived from the mail id with the server secret). */
export function gtmUnsubscribeToken(mailId: string) {
  return hashReplyToken(`gtm-unsubscribe:${mailId}`).slice(0, 32);
}

/** The mail's own opt-out page: a confirmation (GET) or Gmail's one-click unsubscribe (POST). */
export function gtmUnsubscribeUrl(mailId: string, origin: string = GTM_HARPER_ORIGIN) {
  const url = new URL("/api/email/gtm-unsubscribe", origin);
  url.searchParams.set("m", mailId);
  url.searchParams.set("t", gtmUnsubscribeToken(mailId));
  return url.toString();
}

/**
 * Opt-out from a GTM mail's link: the address goes on Harper's shared outreach suppression list, which every
 * GTM mail and every external introduction checks before sending. Idempotent.
 */
export async function unsubscribeGtmMail(args: { mailId: string; token: string }) {
  const mailId = args.mailId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mailId)) return { ok: false as const };
  const expected = Buffer.from(gtmUnsubscribeToken(mailId));
  const given = Buffer.from(args.token.trim().toLowerCase());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false as const };
  const admin = getSupabaseAdmin();
  const { data, error } = await gtmMailsTable(admin).select("to_email").eq("id", mailId).maybeSingle();
  if (error) throw error;
  const to = (data as { to_email: string } | null)?.to_email;
  if (!to) return { ok: false as const };
  const { error: suppressError } = await admin.from("external_contact_suppressions")
    .upsert({ email_hash: externalEmailHash(to), reason: "unsubscribed", external_intro_request_id: null },
      { onConflict: "email_hash", ignoreDuplicates: true });
  if (suppressError) throw suppressError;
  // The #5 agent's timeline and numbers read the opt-out on this mail. Best effort: the opt-out above is what matters.
  const { error: markError } = await gtmMailsTable(admin).update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", mailId).is("unsubscribed_at", null);
  if (markError && markError.code !== "42703" && markError.code !== "PGRST204") {
    console.error("[gtm-plays] opted out but the mail row was not marked", mailId, markError);
  }
  return { ok: true as const };
}

/** The posting as a candidate mail described it, kept on the mail for its Harper page. */
export type GtmPostingSnapshot = {
  title: string;
  companyName: string | null;
  location: string | null;
  description: string;
  url: string | null;
};
