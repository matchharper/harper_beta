import { NextRequest, NextResponse } from "next/server";
import {
  GmailPubSubAuthenticationError,
  getGtmOutreachGmailConfig,
  verifyGmailPubSubToken,
} from "@/lib/contentsEngine/gmail";
import { syncGtmOutreachGmailHistory } from "@/lib/contentsEngine/outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

import { decodeGmailNotification } from "@/lib/contentsEngine/gmailNotification";

type PubSubEnvelope = {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function internalError(error: unknown) {
  console.error("[contents-engine/gmail/push]", error);
  return jsonError("Failed to sync Gmail reply", 500);
}

export async function POST(request: NextRequest) {
  try {
    await verifyGmailPubSubToken(request.headers.get("authorization"));
  } catch (error) {
    if (error instanceof GmailPubSubAuthenticationError) {
      return jsonError("Unauthorized Pub/Sub caller", 401);
    }
    return internalError(error);
  }

  let envelope: PubSubEnvelope;
  try {
    envelope = (await request.json()) as PubSubEnvelope;
  } catch {
    return jsonError("Invalid Pub/Sub request body", 400);
  }

  const expectedSubscription =
    process.env.GTM_OUTREACH_GMAIL_PUBSUB_SUBSCRIPTION?.trim();
  if (expectedSubscription && envelope.subscription !== expectedSubscription) {
    return jsonError("Unexpected subscription", 401);
  }

  let notification: ReturnType<typeof decodeGmailNotification>;
  try {
    notification = decodeGmailNotification(envelope.message?.data);
  } catch {
    return jsonError("Invalid Gmail notification payload", 400);
  }

  let mailbox: string;
  try {
    mailbox = getGtmOutreachGmailConfig().mailbox;
  } catch (error) {
    return internalError(error);
  }
  if (notification.emailAddress.trim().toLowerCase() !== mailbox) {
    return jsonError("Unexpected mailbox", 400);
  }

  try {
    const result = await syncGtmOutreachGmailHistory(notification.historyId);
    return NextResponse.json({
      messageId: envelope.message?.messageId ?? null,
      ok: true,
      ...result,
    });
  } catch (error) {
    return internalError(error);
  }
}
