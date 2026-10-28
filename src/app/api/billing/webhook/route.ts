import { after, NextRequest, NextResponse } from "next/server";
import {
  getBillingStripe,
  STRIPE_BILLING_WEBHOOK_VERSIONS,
} from "@/lib/org/billing/stripe";
import { handleBillingWebhook } from "@/lib/org/billing/service";
import { recordBillingWebhookNotification } from "@/lib/org/billing/notifications";
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
  let supportedVersion = false;
  let billingSynced = false;
  try {
    if (!STRIPE_BILLING_WEBHOOK_VERSIONS.includes(event.api_version ?? ""))
      throw new Error(
        "Webhook API version does not match the configured billing schema"
      );
    supportedVersion = true;
    await handleBillingWebhook(event);
    billingSynced = true;
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[billing/webhook]", event.id, event.type, error);
    return NextResponse.json({ error: "Retry required" }, { status: 500 });
  } finally {
    // A payment can succeed even if entitlement synchronization fails. The
    // internal alert still reports the charge and the failed application step.
    if (supportedVersion)
      after(() =>
        recordBillingWebhookNotification(event, billingSynced).catch(
          (error) => {
            console.error(
              "[billing/notification]",
              event.id,
              event.type,
              error
            );
          }
        )
      );
  }
}
