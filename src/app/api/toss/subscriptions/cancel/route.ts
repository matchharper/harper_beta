import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/billing/server";
import { getActiveSubscriptionOrFilter } from "@/lib/billing/common";

export const runtime = "nodejs";

type CancelBody = {
  userId?: string;
};

export async function POST(req: Request) {
  let body: CancelBody;
  try {
    body = (await req.json()) as CancelBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = String(body?.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data: paymentData, error } = await supabaseAdmin
    .from("payments")
    .select("id, provider_status, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .eq("provider", "toss")
    .or(getActiveSubscriptionOrFilter(nowIso))
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load active Toss subscription" },
      { status: 500 }
    );
  }

  const payment = (paymentData as unknown) as {
    id: number;
    provider_status: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean | null;
  } | null;

  if (!payment?.id) {
    return NextResponse.json(
      { error: "No active Toss subscription" },
      { status: 404 }
    );
  }

  if (payment.cancel_at_period_end) {
    return NextResponse.json(
      {
        status: "already_scheduled",
        currentPeriodEnd: payment.current_period_end,
      },
      { status: 200 }
    );
  }

  if (payment.provider_status !== "active") {
    return NextResponse.json(
      { error: "Only active subscriptions can be canceled at period end" },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("payments")
    .update({
      cancel_at_period_end: true,
      provider_status: "cancel_scheduled",
      cancelled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", payment.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to schedule cancellation" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      status: "cancel_requested",
      currentPeriodEnd: payment.current_period_end,
    },
    { status: 200 }
  );
}
