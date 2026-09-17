import { NextRequest, NextResponse } from "next/server";
import {
  getGtmOutreachGmailConfig,
  verifyGmailPubSubToken,
} from "@/lib/contentsEngine/gmail";
import { syncGtmOutreachGmailHistory } from "@/lib/contentsEngine/outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

type PubSubEnvelope = {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
};

function decodeNotification(data: string | undefined): {
  emailAddress: string;
  historyId: string;
} {
  if (!data) throw new Error("Missing Pub/Sub message data");
  const decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as {
    emailAddress?: string;
    historyId?: string;
  };
  const emailAddress = decoded.emailAddress?.trim();
  const historyId = decoded.historyId?.trim();
  if (!emailAddress || !historyId) {
    throw new Error("Invalid Gmail notification payload");
  }
  return { emailAddress, historyId };
}

export async function POST(request: NextRequest) {
  try {
    await verifyGmailPubSubToken(request.headers.get("authorization"));
    const envelope = (await request.json()) as PubSubEnvelope;
    const expectedSubscription =
      process.env.GTM_OUTREACH_GMAIL_PUBSUB_SUBSCRIPTION?.trim();
    if (
      expectedSubscription &&
      envelope.subscription !== expectedSubscription
    ) {
      return NextResponse.json({ error: "Unexpected subscription" }, { status: 401 });
    }
    const notification = decodeNotification(envelope.message?.data);
    const mailbox = getGtmOutreachGmailConfig().mailbox;
    if (notification.emailAddress.trim().toLowerCase() !== mailbox) {
      return NextResponse.json({ error: "Unexpected mailbox" }, { status: 400 });
    }
    const result = await syncGtmOutreachGmailHistory(notification.historyId);
    return NextResponse.json({
      messageId: envelope.message?.messageId ?? null,
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("[contents-engine/gmail/push]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync Gmail reply",
      },
      { status: 500 }
    );
  }
}
