/** Read-only configuration check. Never prints API keys or webhook secrets. */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
async function main() {
  const { getSlotPrice, getBillingStripe, billingSiteUrl } =
    await import("../src/lib/org/billing/stripe");
  const required = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_SLOT_PRICE_ID",
    "STRIPE_SLOT_ANNUAL_PRICE_ID",
    "STRIPE_PORTAL_CONFIGURATION_ID",
    "NEXT_PUBLIC_SITE_URL",
    "CRON_SECRET",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Missing: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    const price = await getSlotPrice();
    const annual = await getSlotPrice("year");
    const portal =
      await getBillingStripe().billingPortal.configurations.retrieve(
        process.env.STRIPE_PORTAL_CONFIGURATION_ID!
      );
    const valid =
      portal.active &&
      portal.features.payment_method_update.enabled &&
      portal.features.invoice_history.enabled &&
      !portal.features.subscription_cancel.enabled &&
      !portal.features.subscription_update.enabled;
    console.log({
      mode: price.livemode ? "LIVE" : "TEST",
      priceId: price.id,
      amount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring?.interval,
      annualPriceId: annual.id,
      annualAmount: annual.unit_amount,
      portalReady: valid,
      siteUrl: billingSiteUrl(),
      webhookApiVersions: ["2026-08-26.dahlia", "2026-09-30.endive"],
    });
    if (!valid) {
      console.error(
        "Portal must enable payment methods and invoice history, and disable subscription cancel/update."
      );
      process.exitCode = 1;
    }
  }
}
void main().catch(() => {
  console.error(
    "Stripe configuration validation failed. Check the key, Price and Portal configuration in the same Stripe environment."
  );
  process.exitCode = 1;
});
