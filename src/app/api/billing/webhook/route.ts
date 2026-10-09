import { NextRequest, NextResponse } from "next/server";
import {
  getBillingStripe,
  STRIPE_BILLING_WEBHOOK_VERSIONS,
} from "@/lib/org/billing/stripe";
import { handleBillingWebhook } from "@/lib/org/billing/service";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  let event;
  try {
    event = getBillingStripe().webhooks.constructEvent(
      await req.text(),
      req.headers.get("stripe-signature") ?? "",
      secret
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    if (!STRIPE_BILLING_WEBHOOK_VERSIONS.includes(event.api_version ?? ""))
      throw new Error(
        "Webhook API version does not match the configured billing schema"
      );
    await handleBillingWebhook(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[billing/webhook]", event.id, event.type, error);
    return NextResponse.json({ error: "Retry required" }, { status: 500 });
  }
}
