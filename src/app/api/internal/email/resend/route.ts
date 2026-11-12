import { NextResponse } from "next/server";
import {
  ingestResendInboundEvent,
  type ResendInboundEventPayload,
} from "@/lib/email/inbound";
import {
  recordResendEmailOpenedEvent,
  type ResendEmailOpenedEventPayload,
} from "@/lib/email/openTracking";
import {
  ingestGtmResendDeliveryEvent,
  isGtmResendDeliveryEventType,
  type ResendDeliveryEventPayload,
} from "@/lib/contentsEngine/resendDelivery";
import { verifyResendWebhookSignature } from "@/lib/email/security";
import {
  ingestExternalInviteDeliveryEvent,
  ingestExternalInviteOpenedEvent,
} from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { ingestGtmMailDeliveryEvent } from "@/lib/gtmPlays/delivery.server";
import { dispatchInboundEmailReply } from "@/lib/email/runtime/queue";

export const runtime = "nodejs";

/**
 * External-invitation events first. A failure there (for example before its migration is applied)
 * is logged and the event falls through, so career open tracking and GTM delivery keep working.
 */
async function handledAsExternalInvite(ingest: () => Promise<{ handled: boolean }>, svixId: string | null) {
  try {
    return (await ingest()).handled;
  } catch (error) {
    console.error("[email-webhook] external invite event failed", {
      error: error instanceof Error ? error.message : String(error),
      svixId,
    });
    return false;
  }
}

/** Ops GTM plays mails next (sent from Chris's address, found by the provider id); same fall-through on error. */
async function handledAsGtmMail(event: ResendDeliveryEventPayload, svixId: string | null) {
  try {
    return (await ingestGtmMailDeliveryEvent({ event })).handled;
  } catch (error) {
    console.error("[email-webhook] GTM mail event failed", {
      error: error instanceof Error ? error.message : String(error),
      svixId,
    });
    return false;
  }
}

export async function POST(req: Request) {
  const payload = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  let verified = false;
  try {
    verified = verifyResendWebhookSignature({
      id: svixId,
      payload,
      signature: svixSignature,
      timestamp: svixTimestamp,
    });
  } catch (error) {
    console.error("[email-webhook] signature verification unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Webhook verification is not configured" },
      { status: 500 }
    );
  }

  if (!verified) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 }
    );
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  if (!event || typeof event !== "object") {
    return NextResponse.json(
      { error: "Invalid webhook payload" },
      { status: 400 }
    );
  }

  const eventType = (event as { type?: unknown }).type;
  if (eventType === "email.opened") {
    // External invitations share Harper's sender; match them by provider email ID first.
    if (await handledAsExternalInvite(() => ingestExternalInviteOpenedEvent({
      admin: getSupabaseAdmin(),
      event: event as ResendEmailOpenedEventPayload,
    }), svixId)) {
      return NextResponse.json({ ok: true, external: true }, { status: 200 });
    }
    try {
      const result = await recordResendEmailOpenedEvent({
        event: event as ResendEmailOpenedEventPayload,
      });
      return NextResponse.json({ ok: true, ...result }, { status: 200 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to record email open";
      console.error("[email-webhook] open tracking failed", {
        error: message,
        svixId,
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (isGtmResendDeliveryEventType(eventType)) {
    if (await handledAsExternalInvite(() => ingestExternalInviteDeliveryEvent({
      admin: getSupabaseAdmin(),
      event: event as ResendDeliveryEventPayload,
    }), svixId)) {
      return NextResponse.json({ ok: true, external: true }, { status: 200 });
    }
    if (await handledAsGtmMail(event as ResendDeliveryEventPayload, svixId)) {
      return NextResponse.json({ ok: true, gtmMail: true }, { status: 200 });
    }
    try {
      const result = await ingestGtmResendDeliveryEvent({
        event: event as ResendDeliveryEventPayload,
        providerEventId: svixId,
      });
      return NextResponse.json({ ok: true, ...result }, { status: 200 });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to record Resend delivery event";
      console.error("[email-webhook] delivery event failed", {
        error: message,
        svixId,
      });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const typedEvent = event as ResendInboundEventPayload;
  if (typedEvent.type !== "email.received") {
    return NextResponse.json({ ignored: true, ok: true }, { status: 200 });
  }

  try {
    const result = await ingestResendInboundEvent({
      event: typedEvent,
      providerEventId: svixId,
    });
    await dispatchInboundEmailReply(result.jobId);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to ingest email event";
    console.error("[email-webhook] ingest failed", { error: message, svixId });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
