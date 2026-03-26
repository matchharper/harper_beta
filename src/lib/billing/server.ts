import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  billingToCycle,
  buildTossCustomerKey,
  type BillingAttemptReason,
  type BillingPeriod,
  type BillingPlanKey,
  type BillingProvider,
} from "@/lib/billing/common";

export type BillingPlanRow = Pick<
  Database["public"]["Tables"]["plans"]["Row"],
  "plan_id" | "name" | "display_name" | "cycle" | "credit" | "price_krw"
>;

export type BillingPaymentRow =
  Database["public"]["Tables"]["payments"]["Row"];
export type BillingSessionRow =
  Database["public"]["Tables"]["billing_sessions"]["Row"];
export type PaymentAttemptRow =
  Database["public"]["Tables"]["payment_attempts"]["Row"];

export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export async function getPlanByKeyAndBilling(
  supabaseAdmin: SupabaseClient<Database>,
  planKey: BillingPlanKey,
  billing: BillingPeriod
) {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("plan_id, name, display_name, cycle, credit, price_krw")
    .eq("name", planKey)
    .eq("cycle", billingToCycle(billing))
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as BillingPlanRow | null;
}

export async function getCompanyUserSummary(
  supabaseAdmin: SupabaseClient<Database>,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("company_users")
    .select("user_id, email, name, is_authenticated")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function resetCreditsForPlan(args: {
  supabaseAdmin: SupabaseClient<Database>;
  userId: string;
  plan: BillingPlanRow;
  eventType: string;
}) {
  const { supabaseAdmin, userId, plan, eventType } = args;
  const creditAmount = Number(plan.credit ?? 0);

  const { data: creditsRow, error: creditsErr } = await supabaseAdmin
    .from("credits")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (creditsErr) throw creditsErr;

  const payload = {
    charged_credit: creditAmount,
    remain_credit: creditAmount,
    last_updated_at: new Date().toISOString(),
    type: plan.name,
  };

  if (creditsRow?.id) {
    const { error } = await supabaseAdmin
      .from("credits")
      .update(payload)
      .eq("id", creditsRow.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from("credits").insert({
      user_id: userId,
      ...payload,
    });
    if (error) throw error;
  }

  const { error: historyError } = await supabaseAdmin
    .from("credits_history")
    .insert({
      user_id: userId,
      charged_credits: creditAmount,
      event_type: eventType,
    });

  if (historyError) throw historyError;
}

export async function getLatestTossPaymentForUser(
  supabaseAdmin: SupabaseClient<Database>,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "toss")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as BillingPaymentRow | null;
}

export async function getPaymentAttemptByAttemptKey(
  supabaseAdmin: SupabaseClient<Database>,
  attemptKey: string
) {
  const { data, error } = await supabaseAdmin
    .from("payment_attempts")
    .select("*")
    .eq("attempt_key", attemptKey)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as PaymentAttemptRow | null;
}

export async function createProcessingAttempt(args: {
  supabaseAdmin: SupabaseClient<Database>;
  paymentId?: number | null;
  userId: string;
  provider: BillingProvider;
  attemptKey: string;
  reason: BillingAttemptReason;
  planId?: string | null;
  amountKRW: number;
  orderId: string;
}) {
  const { supabaseAdmin } = args;
  const payload = {
    payment_id: args.paymentId ?? null,
    user_id: args.userId,
    provider: args.provider,
    attempt_key: args.attemptKey,
    reason: args.reason,
    plan_id: args.planId ?? null,
    amount_krw: args.amountKRW,
    order_id: args.orderId,
    status: "processing",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("payment_attempts")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as PaymentAttemptRow | null;
}

export async function updatePaymentAttempt(
  supabaseAdmin: SupabaseClient<Database>,
  attemptId: number,
  payload: Database["public"]["Tables"]["payment_attempts"]["Update"]
) {
  const { error } = await supabaseAdmin
    .from("payment_attempts")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (error) throw error;
}

export function getExistingAttemptConflictCode(error: { code?: string } | null) {
  return error?.code === "23505";
}

export function getTossCustomerKeyForUser(userId: string) {
  return buildTossCustomerKey(userId);
}
