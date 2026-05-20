import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { normalizeAddressList, normalizeEmailAddress } from "@/lib/email/parse";
import { createReplyToken, hashReplyToken } from "@/lib/email/security";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

type UntypedAdmin = ReturnType<typeof getTalentSupabaseAdmin> & {
  from: (table: string) => any;
};

type InboundEventRow = {
  id: string;
};

const EMAIL_REPLY_DOMAIN = "matchharper.com";

export type ResendInboundEventPayload = {
  created_at?: string;
  data?: {
    cc?: unknown;
    created_at?: string;
    email_id?: string;
    from?: string;
    message_id?: string;
    subject?: string;
    to?: unknown;
  };
  type?: string;
};

function toUntypedAdmin(admin: TalentAdminClient): UntypedAdmin {
  return admin as unknown as UntypedAdmin;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getEmailReplyDomain() {
  return EMAIL_REPLY_DOMAIN;
}

export async function createEmailReplyAlias(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  expiresAt?: string | null;
  userId: string;
}) {
  const domain = getEmailReplyDomain();

  const token = createReplyToken();
  const admin = toUntypedAdmin(args.admin);
  const { error } = await admin.from("email_reply_aliases").insert({
    conversation_id: args.conversationId ?? null,
    expires_at: args.expiresAt ?? null,
    talent_id: args.userId,
    token_hash: hashReplyToken(token),
  });
  if (error) {
    throw new Error(error.message ?? "Failed to create email reply alias");
  }

  return {
    address: `reply+${token}@${domain}`,
    token,
  };
}

export async function ingestResendInboundEvent(args: {
  event: ResendInboundEventPayload;
  providerEventId?: string | null;
}) {
  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const data = asObject(args.event.data);
  const providerEmailId = getString(data.email_id);
  if (!providerEmailId) {
    throw new Error("Resend email.received event is missing data.email_id");
  }

  const receivedAt =
    getString(data.created_at) ||
    getString(args.event.created_at) ||
    new Date().toISOString();

  const rowPayload = {
    cc_addresses: normalizeAddressList(data.cc),
    from_email: normalizeEmailAddress(getString(data.from)),
    message_id: getString(data.message_id) || null,
    provider: "resend",
    provider_email_id: providerEmailId,
    provider_event_id: args.providerEventId ?? null,
    received_at: receivedAt,
    subject: getString(data.subject) || null,
    to_addresses: normalizeAddressList(data.to),
  };

  const { data: inserted, error: insertError } = await admin
    .from("email_inbound_events")
    .insert(rowPayload)
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code !== "23505") {
      throw new Error(insertError.message ?? "Failed to insert inbound event");
    }

    let { data: existing, error: existingError } = await admin
      .from("email_inbound_events")
      .select("id")
      .eq("provider", "resend")
      .eq("provider_email_id", providerEmailId)
      .maybeSingle();
    if (!existing && args.providerEventId) {
      const existingByEvent = await admin
        .from("email_inbound_events")
        .select("id")
        .eq("provider", "resend")
        .eq("provider_event_id", args.providerEventId)
        .maybeSingle();
      existing = existingByEvent.data;
      existingError = existingByEvent.error;
    }
    if (existingError || !existing) {
      throw new Error(
        existingError?.message ?? "Failed to load existing inbound event"
      );
    }
    return {
      inboundEventId: String(existing.id),
      inserted: false,
      queued: false,
    };
  }

  const inboundEvent = inserted as InboundEventRow;
  const { error: jobError } = await admin.from("email_reply_jobs").insert({
    inbound_event_id: inboundEvent.id,
    status: "queued",
  });
  if (jobError && jobError.code !== "23505") {
    throw new Error(jobError.message ?? "Failed to enqueue email reply job");
  }

  return {
    inboundEventId: inboundEvent.id,
    inserted: true,
    queued: !jobError,
  };
}
