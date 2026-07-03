import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { normalizeAddressList, normalizeEmailAddress } from "@/lib/email/parse";
import { createReplyToken, hashReplyToken } from "@/lib/email/security";
import type { TalentAdminClient } from "@/lib/talentOnboarding/server";

const DEFAULT_REFERRAL_INTRO_EMAILS = [
  "intro@matchharper.com",
  "referrals@matchharper.com",
  "intro@reply.matchharper.com",
  "referrals@reply.matchharper.com",
];

type UntypedAdmin = ReturnType<typeof getTalentSupabaseAdmin> & {
  from: (table: string) => any;
};

type InboundEventRow = {
  id: string;
};

const DEFAULT_EMAIL_REPLY_DOMAIN = "reply.matchharper.com";

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

export type ReferralIntroTestEmail = {
  cc?: unknown;
  from: string;
  html?: string | null;
  message_id?: string | null;
  subject?: string | null;
  text: string;
  to: unknown;
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
  return (
    process.env.EMAIL_REPLY_DOMAIN?.trim() || DEFAULT_EMAIL_REPLY_DOMAIN
  ).toLowerCase();
}

function normalizeConfiguredEmailList(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((item) => normalizeEmailAddress(item))
    .filter((item): item is string => Boolean(item));
}

export function getReferralIntroAddresses() {
  const configured = normalizeConfiguredEmailList(
    process.env.REFERRAL_INTRO_EMAILS
  );
  const defaults = DEFAULT_REFERRAL_INTRO_EMAILS.map((item) =>
    item.toLowerCase()
  );
  return Array.from(new Set([...configured, ...defaults]));
}

function getMatchedReferralIntroAddresses(args: {
  ccAddresses: readonly string[];
  toAddresses: readonly string[];
}) {
  const allowed = new Set(getReferralIntroAddresses());
  const recipients = [...args.toAddresses, ...args.ccAddresses]
    .map((item) => normalizeEmailAddress(item))
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(recipients.filter((item) => allowed.has(item))));
}

function referralJobMetadata(args: { matchedAddresses: readonly string[] }) {
  return {
    referralIntro: {
      matchedAddresses: [...args.matchedAddresses],
      source: "inbound_email",
    },
  };
}

function classifyInboundEmailJob(args: {
  ccAddresses: readonly string[];
  toAddresses: readonly string[];
}) {
  const matchedAddresses = getMatchedReferralIntroAddresses(args);
  if (matchedAddresses.length > 0) {
    return {
      kind: "referral_intro",
      metadata: referralJobMetadata({ matchedAddresses }),
    };
  }
  return {
    kind: "reply",
    metadata: {},
  };
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
  const jobClassification = classifyInboundEmailJob({
    ccAddresses: rowPayload.cc_addresses,
    toAddresses: rowPayload.to_addresses,
  });

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
    kind: jobClassification.kind,
    metadata: jobClassification.metadata,
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

export async function queueReferralIntroTestEvent(args: {
  email: ReferralIntroTestEmail;
}) {
  const admin = toUntypedAdmin(getTalentSupabaseAdmin());
  const providerEmailId = `test_referral_intro_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const toAddresses = normalizeAddressList(args.email.to);
  const ccAddresses = normalizeAddressList(args.email.cc);
  const matchedAddresses = getMatchedReferralIntroAddresses({
    ccAddresses,
    toAddresses,
  });
  if (matchedAddresses.length === 0) {
    throw new Error(
      `Test email must include one referral intro address: ${getReferralIntroAddresses().join(
        ", "
      )}`
    );
  }

  const { data: inserted, error: insertError } = await admin
    .from("email_inbound_events")
    .insert({
      cc_addresses: ccAddresses,
      from_email: normalizeEmailAddress(args.email.from),
      message_id:
        args.email.message_id || `<${providerEmailId}@matchharper.test>`,
      provider: "resend",
      provider_email_id: providerEmailId,
      provider_event_id: `manual_${providerEmailId}`,
      received_at: now,
      subject: args.email.subject || "Intro to Harper",
      to_addresses: toAddresses,
    })
    .select("id")
    .single();
  if (insertError) {
    throw new Error(insertError.message ?? "Failed to insert test inbound event");
  }

  const inboundEvent = inserted as InboundEventRow;
  const { error: jobError } = await admin.from("email_reply_jobs").insert({
    inbound_event_id: inboundEvent.id,
    kind: "referral_intro",
    metadata: {
      referralIntro: {
        email: {
          cc: ccAddresses,
          created_at: now,
          from: args.email.from,
          headers: {},
          html: args.email.html ?? null,
          message_id:
            args.email.message_id || `<${providerEmailId}@matchharper.test>`,
          subject: args.email.subject || "Intro to Harper",
          text: args.email.text,
          to: toAddresses,
        },
        matchedAddresses,
        source: "manual_test",
      },
    },
    status: "queued",
  });
  if (jobError) {
    throw new Error(jobError.message ?? "Failed to enqueue test referral intro");
  }

  return {
    inboundEventId: inboundEvent.id,
    providerEmailId,
  };
}
