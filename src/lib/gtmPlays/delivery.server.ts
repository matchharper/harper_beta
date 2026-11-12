import "server-only";

import {
  parseGtmResendDeliveryEvent,
  type ResendDeliveryEventPayload,
} from "@/lib/contentsEngine/resendDelivery";
import { externalEmailHash } from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type Admin = ReturnType<typeof getSupabaseAdmin>;

export type GtmDeliveryStatus = "bounced" | "complained" | "failed";

function mailsTable(admin: Admin) {
  // gtm_mails is new and not in the generated Database types yet.
  return (admin as unknown as { from: (table: string) => any }).from("gtm_mails");
}

// Before 20261113100000_gtm_mails_delivery is applied (or before gtm_mails exists) the event is not ours to keep.
const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

/**
 * A Resend delivery event (bounced, complained, failed, delayed) for a GTM plays mail, found by the provider id
 * kept when it was sent. Permanent outcomes are written on the mail (Ops send history shows them); a bounced or
 * complaining address also goes on Harper's outreach suppression list (shared with external invitations), so the
 * next GTM send to it is refused. Temporary bounces and delays change nothing. handled=false: not a GTM mail.
 */
export async function ingestGtmMailDeliveryEvent(args: { admin?: Admin; event: ResendDeliveryEventPayload }) {
  const parsed = parseGtmResendDeliveryEvent(args.event);
  const admin = args.admin ?? getSupabaseAdmin();
  const { data: row, error } = await mailsTable(admin).select("id,to_email,delivery_status")
    .eq("provider_message_id", parsed.providerMessageId).maybeSingle();
  if (error) {
    if (MISSING.has(String(error.code))) return { handled: false as const };
    throw error;
  }
  const mail = row as { id: string; to_email: string; delivery_status: GtmDeliveryStatus | null } | null;
  if (!mail) return { handled: false as const };
  if (parsed.eventType === "email.delivery_delayed" || !parsed.permanent) {
    return { handled: true as const, ignored: "not_final" as const };
  }
  const status: GtmDeliveryStatus = parsed.eventType === "email.complained" ? "complained"
    : parsed.eventType === "email.failed" ? "failed" : "bounced";
  // A complaint is the strongest signal and is kept over an earlier bounce or failure; otherwise the first wins.
  if (!mail.delivery_status || (status === "complained" && mail.delivery_status !== "complained")) {
    const { error: updateError } = await mailsTable(admin).update({
      delivery_status: status, delivery_event_at: parsed.occurredAt, delivery_detail: parsed.diagnosticCode.slice(0, 500),
    }).eq("id", mail.id);
    if (updateError) throw updateError;
  }
  // A failed send says nothing about the address; a bounce or a complaint does.
  if (status !== "failed") {
    const address = (parsed.recipientEmail || mail.to_email).trim().toLowerCase();
    const { error: suppressError } = await admin.from("external_contact_suppressions")
      .upsert({ email_hash: externalEmailHash(address), reason: status, external_intro_request_id: null },
        { onConflict: "email_hash", ignoreDuplicates: true });
    if (suppressError) throw suppressError;
  }
  return { handled: true as const, status };
}
