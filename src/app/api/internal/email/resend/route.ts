import { NextResponse } from "next/server";
import {
  ingestResendInboundEvent,
  type ResendInboundEventPayload,
} from "@/lib/email/inbound";
import {
  recordResendEmailOpenedEvent,
  type ResendEmailOpenedEventPayload,
} from "@/lib/email/openTracking";
import { verifyResendWebhookSignature } from "@/lib/email/security";

export const runtime = "nodejs";

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

  const typedEvent = event as ResendInboundEventPayload;
  if (typedEvent.type !== "email.received") {
    return NextResponse.json({ ignored: true, ok: true }, { status: 200 });
  }

  try {
    const result = await ingestResendInboundEvent({
      event: typedEvent,
      providerEventId: svixId,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to ingest email event";
    console.error("[email-webhook] ingest failed", { error: message, svixId });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
