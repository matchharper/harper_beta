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

function getMatchedOrgIntroCaptureAddresses(args: {
  ccAddresses: readonly string[];
  toAddresses: readonly string[];
}) {
  const domain = getEmailReplyDomain();
  const recipients = [...args.toAddresses, ...args.ccAddresses]
    .map((item) => normalizeEmailAddress(item))
    .filter((item): item is string => Boolean(item));

  return Array.from(
    new Set(
      recipients.filter((address) => {
        const [localPart, actualDomain] = address.split("@");
        return (
          actualDomain === domain &&
          /^intro\+[a-z0-9_-]{12,}$/i.test(localPart ?? "")
        );
      })
    )
  );
}

function referralJobMetadata(args: { matchedAddresses: readonly string[] }) {
  return {
    referralIntro: {
      matchedAddresses: [...args.matchedAddresses],
      source: "inbound_email",
    },
  };
}

export function classifyInboundEmailJob(args: {
  ccAddresses: readonly string[];
  toAddresses: readonly string[];
}) {
  const orgIntroCaptureAddresses = getMatchedOrgIntroCaptureAddresses(args);
  if (orgIntroCaptureAddresses.length > 0) {
    return {
      kind: "org_intro_capture",
      metadata: {
        orgIntroCapture: {
          matchedAddresses: orgIntroCaptureAddresses,
          source: "inbound_email",
        },
      },
    };
  }

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

  const { data: result, error } = await (admin.rpc as any)(
    "create_email_inbound_event_and_job_v1",
    {
      p_cc_addresses: rowPayload.cc_addresses,
      p_from_email: rowPayload.from_email,
      p_job_kind: jobClassification.kind,
      p_job_metadata: jobClassification.metadata,
      p_message_id: rowPayload.message_id,
      p_provider: rowPayload.provider,
      p_provider_email_id: rowPayload.provider_email_id,
      p_provider_event_id: rowPayload.provider_event_id,
      p_received_at: rowPayload.received_at,
      p_subject: rowPayload.subject,
      p_to_addresses: rowPayload.to_addresses,
    }
  );
  if (error) {
    throw new Error(
      error.message ?? "Failed to create or adopt inbound email job"
    );
  }
  return {
    inboundEventId: String(result?.inboundEventId ?? ""),
    inserted: result?.inserted === true,
    queued: result?.queued === true,
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
    throw new Error(
      insertError.message ?? "Failed to insert test inbound event"
    );
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
    throw new Error(
      jobError.message ?? "Failed to enqueue test referral intro"
    );
  }

  return {
    inboundEventId: inboundEvent.id,
    providerEmailId,
  };
}
