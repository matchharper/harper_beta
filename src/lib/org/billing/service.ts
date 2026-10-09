import {
  executeSubscriptionChange,
  recoverSubscriptionChange,
} from "./subscriptionChange";
import type Stripe from "stripe";
import {
  billingDb,
  billingRpc,
  billingWorkspace,
  getBillingSummary,
  throwBillingDbError,
} from "./store";
import {
  billingSiteUrl,
  getSlotPrice,
  getBillingStripe,
  paidInvoicePeriod,
  monthlyCreditPeriods,
  stripeId,
  timestamp,
} from "./stripe";
import {
  WorkspaceBillingError,
  isSlotPurchaseQuantity,
  type BillingInvoice,
  type BillingInterval,
  type BillingSlot,
} from "./types";

import { SLOT_PRODUCT_KEY, isSlotBillingProduct, slotPriceId } from "./compat";

// The assigned Stripe price is authoritative; a new catalog price must never
// rewrite the displayed price of an existing subscription. No invoice replica.
export async function withSlotPrices(
  workspaceId: string,
  slots: BillingSlot[]
) {
  if (!slots.length) return slots;
  const { data, error } = await billingDb()
    .from("company_workspace_slots")
    .select("id,stripe_price_id")
    .eq("company_workspace_id", workspaceId)
    .not("stripe_price_id", "is", null);
  throwBillingDbError(error);
  const rows = (data ?? []) as { id: string; stripe_price_id: string }[];
  const prices = new Map<string, Stripe.Price>();
  await Promise.all(
    [...new Set(rows.map((row) => row.stripe_price_id))].map(async (id) => {
      try {
        prices.set(id, await getBillingStripe().prices.retrieve(id));
      } catch {
        /* Entitlements remain readable during a Stripe outage. */
      }
    })
  );
  const bySlot = new Map(
    rows.map((row) => [row.id, prices.get(row.stripe_price_id)])
  );
  return slots.map((slot) => ({
    ...slot,
    recurringAmount: bySlot.get(slot.id)?.unit_amount ?? null,
    currency: bySlot.get(slot.id)?.currency ?? null,
  }));
}
export async function syncBillingSubscription(
  subscriptionId: string,
  expectedWorkspace?: string,
  invoiceId?: string
) {
  const stripe = getBillingStripe();
  // Reading the revision BEFORE Stripe plus compare-and-swap prevents a slower
  // webhook from overwriting a later cancellation/renewal snapshot.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await billingDb()
      .from("company_workspace_slots")
      .select("id,revision,company_workspace_id,stripe_price_id")
      .eq("stripe_subscription_id", subscriptionId);
    throwBillingDbError(error);
    const rows = data ?? [];
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (!isSlotBillingProduct(subscription.metadata.harper_product))
      return false;
    const workspaceId = subscription.metadata.workspace_id;
    if (
      !workspaceId ||
      (expectedWorkspace && expectedWorkspace !== workspaceId) ||
      rows.some((row) => row.company_workspace_id !== workspaceId)
    ) {
      throw new WorkspaceBillingError("billing_forbidden", 403);
    }
    await recoverSubscriptionChange(workspaceId);
    const workspace = await billingWorkspace(workspaceId);
    const item = subscription.items.data[0];
    const initialQuantity = Number(subscription.metadata.slot_quantity ?? 1);
    if (
      stripeId(subscription.customer) !== workspace.stripe_customer_id ||
      subscription.items.data.length !== 1 ||
      !isSlotPurchaseQuantity(initialQuantity) ||
      !isSlotPurchaseQuantity(item?.quantity) ||
      item.quantity > initialQuantity ||
      (rows.length > 0 && rows.length !== initialQuantity) ||
      !(
        rows.length
          ? rows.map((row) => row.stripe_price_id)
          : [slotPriceId("month"), slotPriceId("year")]
      ).includes(item.price.id) ||
      !["month", "year"].includes(item.price.recurring?.interval ?? "") ||
      item.price.recurring?.interval_count !== 1
    ) {
      throw new WorkspaceBillingError("billing_conflict");
    }
    const invoices = new Map<string, Stripe.Invoice>();
    const latestId = stripeId(subscription.latest_invoice);
    for (const id of new Set(
      [invoiceId, latestId].filter((id): id is string => Boolean(id))
    )) {
      invoices.set(id, await stripe.invoices.retrieve(id));
    }
    const periods = [];
    for (const invoice of invoices.values()) {
      const payments =
        invoice.status === "paid" && invoice.amount_due > 0
          ? await stripe.invoicePayments.list({
              invoice: invoice.id,
              status: "paid",
              limit: 100,
            })
          : null;
      const settled =
        invoice.amount_due === 0 ||
        Boolean(
          payments &&
          !payments.has_more &&
          payments.data
            .filter(
              (payment) =>
                payment.payment.type === "payment_intent" ||
                payment.payment.type === "charge"
            )
            .reduce(
              (total, payment) => total + (payment.amount_paid ?? 0),
              0
            ) >= invoice.amount_due
        );
      const period = paidInvoicePeriod(invoice, subscription, settled);
      if (period)
        periods.push(
          ...monthlyCreditPeriods(
            period,
            item.price.recurring!.interval as BillingInterval,
            subscription.billing_cycle_anchor
          ).map((monthly) => ({
            ...monthly,
            quantity: period.quantity,
            invoiceStartsAt: period.startsAt,
            confirmedAt: timestamp(invoice.status_transitions.paid_at),
          }))
        );
    }
    const applied = await billingRpc<boolean>(
      "workspace_billing_sync_slots_v1",
      {
        p_workspace: workspaceId,
        p_subscription: subscription.id,
        p_expected_revisions: Object.fromEntries(
          rows.map((row) => [row.id, row.revision])
        ),
        p_snapshot: {
          initialQuantity,
          quantity: item.quantity,
          customer: stripeId(subscription.customer),
          price: item.price.id,
          billingInterval: item.price.recurring!.interval,
          status: subscription.status,
          startedAt: timestamp(subscription.start_date),
          periodEnd: timestamp(item.current_period_end),
          cancelAt: timestamp(
            subscription.cancel_at ??
              (subscription.cancel_at_period_end
                ? item.current_period_end
                : null)
          ),
          endedAt: timestamp(subscription.ended_at),
        },
        p_periods: periods,
      }
    );
    if (applied) return true;
  }
  throw new WorkspaceBillingError("billing_conflict");
}

export async function syncWorkspaceSubscriptions(workspaceId: string) {
  await recoverSubscriptionChange(workspaceId);
  const workspace = await billingWorkspace(workspaceId);
  if (!workspace.stripe_customer_id) return;
  const stripe = getBillingStripe();
  for await (const sub of stripe.subscriptions.list({
    customer: workspace.stripe_customer_id,
    status: "all",
    limit: 100,
  })) {
    if (isSlotBillingProduct(sub.metadata.harper_product))
      await syncBillingSubscription(sub.id, workspaceId);
  }
}

type CheckoutIntent = {
  price: string;
  interval: BillingInterval;
  quantity: number;
  locale: string;
  actorId: string;
  freeRoleId: string | null;
  onboarding: boolean;
};
type CheckoutLock = {
  key: string;
  expiresAt: string;
  sessionId?: string;
  intent?: CheckoutIntent;
};
export async function createSlotCheckout(
  workspaceId: string,
  actorId: string,
  email?: string,
  locale = "ko",
  interval: BillingInterval = "month",
  quantity = 1
) {
  if (!isSlotPurchaseQuantity(quantity))
    throw new WorkspaceBillingError("billing_conflict", 400);
  if (
    !process.env.STRIPE_WEBHOOK_SECRET ||
    !process.env.STRIPE_PORTAL_CONFIGURATION_ID
  )
    throw new WorkspaceBillingError("billing_unavailable", 503);
  const stripe = getBillingStripe();
  const price = await getSlotPrice(interval);
  const workspace = await billingWorkspace(workspaceId);
  if (workspace.signup_state && !workspace.signup_state.companyConfirmedAt)
    throw new WorkspaceBillingError("billing_conflict");
  const summary = await getBillingSummary(workspaceId);
  if (
    summary.model === "scale" ||
    (summary.model === "legacy" && summary.activeRoles > 1)
  ) {
    throw new WorkspaceBillingError("billing_conflict");
  }
  let customerId = workspace.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        name: workspace.company_name,
        ...(email ? { email } : {}),
        metadata: {
          workspace_id: workspaceId,
          harper_product: SLOT_PRODUCT_KEY,
        },
      },
      { idempotencyKey: `workspace-customer-v1:${workspaceId}` }
    );
    customerId = customer.id;
  }
  const requested: CheckoutIntent = {
    price: price.id,
    interval,
    quantity,
    locale: locale === "en" ? "en" : "ko",
    actorId,
    freeRoleId: null,
    onboarding: Boolean(
      workspace.signup_state && !workspace.signup_state.planSelectedAt
    ),
  };
  let lock = await billingRpc<CheckoutLock>("workspace_billing_checkout_v2", {
    p_intent: requested,
    p_workspace: workspaceId,
    p_customer: customerId,
  });
  if (lock.sessionId) {
    const existing = await stripe.checkout.sessions.retrieve(lock.sessionId);
    if (
      existing.status === "open" &&
      existing.url &&
      (existing.metadata?.billing_interval ?? "month") === interval &&
      Number(existing.metadata?.slot_quantity ?? 1) === quantity
    )
      return { url: existing.url };
    if (existing.status === "open")
      await stripe.checkout.sessions.expire(existing.id);
    // A paid checkout must be synchronized before starting another Slot.
    if (existing.status === "complete" && stripeId(existing.subscription)) {
      await syncBillingSubscription(
        stripeId(existing.subscription)!,
        workspaceId
      );
    }
    await billingRpc("workspace_billing_checkout_v1", {
      p_workspace: workspaceId,
      p_key: lock.key,
    });
    lock = await billingRpc<CheckoutLock>("workspace_billing_checkout_v2", {
      p_intent: requested,
      p_workspace: workspaceId,
    });
  }
  const intent = lock.intent;
  if (
    !intent ||
    intent.price !== price.id ||
    intent.quantity !== quantity ||
    intent.interval !== interval
  )
    throw new WorkspaceBillingError("billing_conflict");
  const returnUrl = `${billingSiteUrl()}/org/${intent.onboarding ? "onboarding" : "slots"}?orgId=${encodeURIComponent(workspaceId)}&interval=${interval}&quantity=${quantity}${intent.onboarding ? "&step=plan" : ""}`;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: workspaceId,
      line_items: [{ price: intent.price, quantity: intent.quantity }],
      allowed_payment_method_types: ["card"],
      adaptive_pricing: { enabled: false },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
      ...(process.env.STRIPE_AUTOMATIC_TAX === "true"
        ? { automatic_tax: { enabled: true } }
        : {}),
      tax_id_collection: { enabled: true },
      locale: intent.locale === "en" ? "en" : "ko",
      metadata: {
        workspace_id: workspaceId,
        harper_product: SLOT_PRODUCT_KEY,
        actor_id: intent.actorId,
        checkout_key: lock.key,
        billing_interval: intent.interval,
        slot_quantity: String(intent.quantity),
        ...(intent.freeRoleId ? { free_role_id: intent.freeRoleId } : {}),
      },
      subscription_data: {
        metadata: {
          slot_quantity: String(intent.quantity),
          workspace_id: workspaceId,
          harper_product: SLOT_PRODUCT_KEY,
        },
      },
      success_url: `${returnUrl}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnUrl}&checkout=cancelled`,
      expires_at: Math.floor(new Date(lock.expiresAt).getTime() / 1000),
    },
    { idempotencyKey: `workspace-checkout-v1:${lock.key}` }
  );
  await billingRpc("workspace_billing_checkout_v1", {
    p_workspace: workspaceId,
    p_key: lock.key,
    p_session: session.id,
  });
  if (!session.url) throw new WorkspaceBillingError("billing_unavailable", 503);
  return { url: session.url };
}

export async function confirmSlotCheckout(
  workspaceId: string,
  sessionId: string
) {
  const session =
    await getBillingStripe().checkout.sessions.retrieve(sessionId);
  const workspace = await billingWorkspace(workspaceId);
  if (
    session.metadata?.workspace_id !== workspaceId ||
    stripeId(session.customer) !== workspace.stripe_customer_id ||
    !isSlotBillingProduct(session.metadata?.harper_product)
  )
    throw new WorkspaceBillingError("billing_forbidden", 403);
  if (session.status !== "complete") return { confirmed: false };
  const subscriptionId = stripeId(session.subscription);
  if (!subscriptionId) return { confirmed: false };
  await syncBillingSubscription(subscriptionId, workspaceId);
  const { data, error } = await billingDb()
    .from("company_workspace_credit_periods")
    .select("slot_id")
    .eq("company_workspace_id", workspaceId)
    .eq(
      "stripe_invoice_id",
      stripeId(
        (await getBillingStripe().subscriptions.retrieve(subscriptionId))
          .latest_invoice
      )
    )
    .lte("starts_at", new Date().toISOString())
    .gt("ends_at", new Date().toISOString());
  throwBillingDbError(error);
  // Keep the completed checkout lock until the next deliberate purchase. A
  // repeated return/old browser tab can never clear a newer open checkout.
  if (
    new Set((data ?? []).map((period) => period.slot_id)).size !==
    Number(session.metadata?.slot_quantity ?? 1)
  )
    return { confirmed: false };
  let transferredRoleName: string | null = null;
  if (session.metadata?.free_role_id) {
    const [{ data: slots, error: slotError }, summary] = await Promise.all([
      billingDb()
        .from("company_workspace_slots")
        .select("id")
        .eq("company_workspace_id", workspaceId)
        .eq("stripe_subscription_id", subscriptionId),
      getBillingSummary(workspaceId),
    ]);
    throwBillingDbError(slotError);
    const purchased = new Set((slots ?? []).map((slot) => slot.id));
    const assigned = summary.slots.find(
      (item) =>
        purchased.has(item.id) && item.roleId === session.metadata?.free_role_id
    );
    if (assigned?.roleId === session.metadata.free_role_id)
      transferredRoleName = assigned.roleName;
  }
  return { confirmed: true, transferredRoleName };
}

export async function updateSlotCancellation(
  workspaceId: string,
  slotId: string,
  revision: number,
  cancel: boolean
) {
  const { data: slot, error } = await billingDb()
    .from("company_workspace_slots")
    .select("stripe_subscription_id,revision,billing_change")
    .eq("id", slotId)
    .eq("company_workspace_id", workspaceId)
    .single();
  throwBillingDbError(error);
  if (!slot || slot.revision !== revision)
    throw new WorkspaceBillingError("billing_conflict");
  // Granted slots end on their own and have no Stripe cancellation to change.
  if (!slot.stripe_subscription_id)
    throw new WorkspaceBillingError("billing_conflict");
  if (
    slot.billing_change &&
    slot.billing_change.revision === revision &&
    slot.billing_change.cancel === cancel
  ) {
    await executeSubscriptionChange(workspaceId, slot.billing_change);
    await syncBillingSubscription(slot.stripe_subscription_id, workspaceId);
    return { ok: true };
  }
  await recoverSubscriptionChange(workspaceId);
  const stripe = getBillingStripe();
  const subscription = await stripe.subscriptions.retrieve(
    slot.stripe_subscription_id
  );
  const workspace = await billingWorkspace(workspaceId);
  const item = subscription.items.data[0];
  if (
    subscription.metadata.workspace_id !== workspaceId ||
    stripeId(subscription.customer) !== workspace.stripe_customer_id ||
    !isSlotBillingProduct(subscription.metadata.harper_product) ||
    subscription.items.data.length !== 1 ||
    !["active", "past_due", "unpaid"].includes(subscription.status)
  )
    throw new WorkspaceBillingError("billing_conflict");
  const change = await billingRpc<
    Parameters<typeof executeSubscriptionChange>[1] | null
  >("workspace_billing_prepare_change_v1", {
    p_workspace: workspaceId,
    p_slot: slotId,
    p_revision: revision,
    p_cancel: cancel,
    p_item: item.id,
    p_period_end: timestamp(item.current_period_end),
  });
  if (change) await executeSubscriptionChange(workspaceId, change);
  await syncBillingSubscription(slot.stripe_subscription_id, workspaceId);
  return { ok: true };
}
export async function createBillingPortal(workspaceId: string) {
  const workspace = await billingWorkspace(workspaceId);
  if (
    !workspace.stripe_customer_id ||
    !process.env.STRIPE_PORTAL_CONFIGURATION_ID
  )
    throw new WorkspaceBillingError("billing_unavailable", 503);
  const configuration =
    await getBillingStripe().billingPortal.configurations.retrieve(
      process.env.STRIPE_PORTAL_CONFIGURATION_ID
    );
  if (
    !configuration.active ||
    configuration.features.subscription_update.enabled ||
    configuration.features.subscription_cancel.enabled
  ) {
    throw new WorkspaceBillingError("billing_unavailable", 503);
  }
  const portal = await getBillingStripe().billingPortal.sessions.create({
    customer: workspace.stripe_customer_id,
    configuration: configuration.id,
    return_url: `${billingSiteUrl()}/org/billing?orgId=${encodeURIComponent(workspaceId)}`,
  });
  return { url: portal.url };
}
export async function listBillingInvoices(workspaceId: string, after?: string) {
  const workspace = await billingWorkspace(workspaceId);
  if (!workspace.stripe_customer_id)
    return { invoices: [] as BillingInvoice[], hasMore: false };
  if (after) {
    const cursor = await getBillingStripe().invoices.retrieve(after);
    if (stripeId(cursor.customer) !== workspace.stripe_customer_id)
      throw new WorkspaceBillingError("billing_forbidden", 403);
  }
  const list = await getBillingStripe().invoices.list({
    customer: workspace.stripe_customer_id,
    limit: 20,
    ...(after ? { starting_after: after } : {}),
  });
  return {
    invoices: list.data
      .filter((invoice) => invoice.status !== "draft")
      .map((invoice) => ({
        id: invoice.id,
        planName: invoice.lines.data[0]?.description ?? null,
        number: invoice.number,
        date: timestamp(invoice.created)!,
        amountPaid: invoice.amount_paid,
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status ?? "unknown",
        hostedUrl: invoice.hosted_invoice_url,
        pdfUrl: invoice.invoice_pdf,
      })),
    hasMore: list.has_more,
    next: list.data.at(-1)?.id ?? null,
  };
}

export async function handleBillingWebhook(event: Stripe.Event) {
  if (event.type.startsWith("customer.subscription.")) {
    return syncBillingSubscription(
      (event.data.object as Stripe.Subscription).id
    );
  }
  if (event.type.startsWith("invoice.")) {
    const invoice = event.data.object as Stripe.Invoice;
    const sub = stripeId(invoice.parent?.subscription_details?.subscription);
    if (sub) return syncBillingSubscription(sub, undefined, invoice.id);
  }
  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!isSlotBillingProduct(session.metadata?.harper_product)) return;
    const sub = stripeId(session.subscription);
    if (sub) return syncBillingSubscription(sub, session.metadata.workspace_id);
  }
}
