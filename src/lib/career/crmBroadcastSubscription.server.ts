import "server-only";

import { verifyCrmBroadcastUnsubscribe } from "@/lib/email/security";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

/**
 * Whether a talent receives Harper's group emails (/ops/crm broadcasts). Stopping them leaves recommendations,
 * replies and every other Harper email as they are. `talent_setting.crm_broadcast_unsubscribed_at` is null while
 * subscribed; the queue RPC skips the rest, and the Worker re-checks right before sending.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = ReturnType<typeof getTalentSupabaseAdmin>;

export async function fetchCrmBroadcastSubscribed(args: {
  admin: Admin;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_setting")
    .select("crm_broadcast_unsubscribed_at")
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load email setting");
  return !data?.crm_broadcast_unsubscribed_at;
}

/** Returns false when the talent has no settings row yet. */
export async function setCrmBroadcastSubscribed(args: {
  admin: Admin;
  subscribed: boolean;
  userId: string;
}) {
  const now = new Date().toISOString();
  let query = args.admin
    .from("talent_setting")
    .update({
      crm_broadcast_unsubscribed_at: args.subscribed ? null : now,
      updated_at: now,
    })
    .eq("user_id", args.userId);
  // Unsubscribing again keeps the first time it happened.
  if (!args.subscribed) query = query.is("crm_broadcast_unsubscribed_at", null);
  const { error } = await query;
  if (error) throw new Error(error.message ?? "Failed to save email setting");

  const { data, error: readError } = await args.admin
    .from("talent_setting")
    .select("user_id")
    .eq("user_id", args.userId)
    .maybeSingle();
  if (readError) {
    throw new Error(readError.message ?? "Failed to save email setting");
  }
  return Boolean(data);
}

/** The unsubscribe link in a group email. Idempotent. */
export async function unsubscribeCrmBroadcastByLink(args: {
  token: string;
  userId: string;
}) {
  const userId = args.userId.trim();
  if (!UUID_PATTERN.test(userId)) return { ok: false as const };
  if (!verifyCrmBroadcastUnsubscribe(userId, args.token)) {
    return { ok: false as const };
  }
  const found = await setCrmBroadcastSubscribed({
    admin: getTalentSupabaseAdmin(),
    subscribed: false,
    userId,
  });
  return found ? { ok: true as const } : { ok: false as const };
}
