import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { normalizeAddressList, normalizeEmailAddress } from "@/lib/email/parse";
import { GTM_OUTREACH_RESEND_FROM } from "@/lib/contentsEngine/resend";
import { notifyGtmOutreachDeliveryFailure } from "@/lib/contentsEngine/slack";

const DELIVERY_EVENT_TYPES = new Set([
  "email.bounced",
  "email.complained",
  "email.delivery_delayed",
  "email.failed",
]);

type RpcError = { message?: string };
type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export type ResendDeliveryEventPayload = {
  created_at?: unknown;
  data?: Record<string, unknown>;
  type?: unknown;
};

type DeliveryResult = {
  activity_id?: string;
  creator_id?: string;
  creator_name?: string;
  creator_ref?: number | string;
  diagnostic_code?: string | null;
  dispatch_ref?: number | string;
  inserted?: boolean;
  matched?: boolean;
  notify_needed?: boolean;
  permanent?: boolean;
  recipient_email?: string;
  status?: string | null;
  subject?: string;
};

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstRecipient(value: unknown) {
  for (const item of normalizeAddressList(value)) {
    const email = normalizeEmailAddress(item);
    if (email) return email;
  }
  return null;
}

export function isGtmResendDeliveryEventType(value: unknown) {
  return typeof value === "string" && DELIVERY_EVENT_TYPES.has(value);
}

export function parseGtmResendDeliveryEvent(event: ResendDeliveryEventPayload) {
  const eventType = stringValue(event.type);
  if (!isGtmResendDeliveryEventType(eventType)) {
    throw new Error(
      `Unsupported Resend delivery event: ${eventType || "empty"}`
    );
  }
  const data = asObject(event.data);
  const providerMessageId = stringValue(data.email_id);
  if (!providerMessageId) {
    throw new Error(`${eventType} is missing data.email_id`);
  }

  const rawOccurredAt =
    stringValue(data.created_at) || stringValue(event.created_at);
  const occurredAt = Date.parse(rawOccurredAt);
  if (!rawOccurredAt || !Number.isFinite(occurredAt)) {
    throw new Error(`${eventType} has an invalid created_at`);
  }

  const bounce = asObject(data.bounce);
  const failed = asObject(data.failed);
  const error = asObject(data.error);
  const bounceType = stringValue(bounce.type);
  const bounceSubType = stringValue(bounce.subType);
  const diagnosticCode =
    stringValue(bounce.message) ||
    stringValue(failed.reason) ||
    stringValue(failed.message) ||
    stringValue(error.message) ||
    stringValue(data.reason) ||
    stringValue(data.message) ||
    [bounceType, bounceSubType].filter(Boolean).join(" / ") ||
    eventType;

  return {
    diagnosticCode,
    eventType,
    fromEmail: normalizeEmailAddress(stringValue(data.from)),
    occurredAt: new Date(occurredAt).toISOString(),
    permanent:
      eventType === "email.complained" ||
      eventType === "email.failed" ||
      (eventType === "email.bounced" &&
        bounceType.toLowerCase() === "permanent"),
    providerMessageId,
    recipientEmail: firstRecipient(data.to),
  };
}

export async function ingestGtmResendDeliveryEvent(args: {
  admin?: RpcClient;
  event: ResendDeliveryEventPayload;
  notify?: typeof notifyGtmOutreachDeliveryFailure;
  providerEventId: string | null;
}) {
  const parsed = parseGtmResendDeliveryEvent(args.event);
  const expectedSender = normalizeEmailAddress(GTM_OUTREACH_RESEND_FROM);
  if (parsed.fromEmail !== expectedSender) {
    return { ignored: true as const, reason: "different_sender" as const };
  }
  const providerEventId = String(args.providerEventId ?? "").trim();
  if (!providerEventId) {
    throw new Error("Resend delivery event is missing svix-id");
  }

  const admin =
    args.admin ?? (getTalentSupabaseAdmin() as unknown as RpcClient);
  const { data, error } = await admin.rpc(
    "gtm_outreach_ingest_resend_delivery_event",
    {
      p_diagnostic_code: parsed.diagnosticCode,
      p_event_type: parsed.eventType,
      p_occurred_at: parsed.occurredAt,
      p_permanent: parsed.permanent,
      p_provider_event_id: providerEventId,
      p_provider_message_id: parsed.providerMessageId,
      p_recipient_email: parsed.recipientEmail,
    }
  );
  if (error) {
    throw new Error(error.message ?? "Failed to record Resend delivery event");
  }
  const result = (data ?? {}) as DeliveryResult;
  if (!result.matched) {
    // Resend may beat the sender's delivery-record write. A non-2xx response
    // makes the provider retry instead of dropping that durable delivery fact.
    throw new Error("GTM Resend delivery event does not match a dispatch yet");
  }

  if (result.notify_needed && result.activity_id) {
    const notify = args.notify ?? notifyGtmOutreachDeliveryFailure;
    const slack = await notify({
      activityId: result.activity_id,
      creatorId: result.creator_id,
      creatorName: result.creator_name ?? "Unknown creator",
      creatorRef: result.creator_ref ?? "",
      diagnosticCode: result.diagnostic_code,
      dispatchRef: result.dispatch_ref ?? "",
      permanent: result.permanent === true,
      recipientEmail:
        result.recipient_email ?? parsed.recipientEmail ?? "unknown",
      status: result.status ?? parsed.eventType,
      subject: result.subject ?? "",
    });
    const recorded = await admin.rpc(
      "gtm_outreach_record_activity_slack_notification",
      {
        p_activity_id: result.activity_id,
        p_channel_id: slack.channel,
        p_slack_ts: slack.ts,
      }
    );
    if (recorded.error) {
      throw new Error(
        recorded.error.message ?? "Failed to record Slack notification"
      );
    }
  }

  return { ignored: false as const, ...result };
}
