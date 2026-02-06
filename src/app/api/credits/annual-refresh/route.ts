import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
}

export async function POST(req: Request) {
  let userId = "";
  try {
    const body = await req.json();
    userId = String(body?.userId ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("payments")
    .select(
      `
        plan_id,
        current_period_start,
        current_period_end,
        plans (
          cycle,
          credit,
          name,
          display_name
        )
      `
    )
    .eq("user_id", userId)
    .gte("current_period_end", nowIso)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (paymentError) {
    return NextResponse.json(
      { error: "Failed to load subscription" },
      { status: 500 }
    );
  }

  if (!payment?.plan_id) {
    return NextResponse.json(
      { status: "no_active_subscription" },
      { status: 200 }
    );
  }

  const cycle = (payment as any)?.plans?.cycle ?? null;
  if (cycle !== 1) {
    return NextResponse.json({ status: "not_annual" }, { status: 200 });
  }

  const creditAmount = Number((payment as any)?.plans?.credit ?? 0);
  const planName = (payment as any)?.plans?.name ?? "annual";

  const { data: creditsRow, error: creditsErr } = await supabaseAdmin
    .from("credits")
    .select("id, charged_credit, remain_credit, last_updated_at, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (creditsErr) {
    return NextResponse.json(
      { error: "Failed to load credits" },
      { status: 500 }
    );
  }

  const lastUpdated =
    creditsRow?.last_updated_at ?? creditsRow?.created_at ?? null;
  const periodStart = payment.current_period_start ?? null;
  const periodEnd = payment.current_period_end ?? null;

  let dueAt: Date | null = null;

  if (lastUpdated) {
    const next = addMonths(new Date(lastUpdated), 1);
    if (now >= next) {
      dueAt = next;
    }
  } else if (periodStart) {
    const next = addMonths(new Date(periodStart), 1);
    if (now >= next) {
      dueAt = next;
    }
  }

  if (!dueAt) {
    return NextResponse.json({ status: "not_due" }, { status: 200 });
  }

  if (periodEnd) {
    const end = new Date(periodEnd);
    if (!isNaN(end.getTime()) && dueAt >= end) {
      return NextResponse.json({ status: "period_ended" }, { status: 200 });
    }
  }

  const payload = {
    charged_credit: creditAmount,
    remain_credit: creditAmount,
    last_updated_at: dueAt.toISOString(),
    type: "annual",
  };

  if (creditsRow?.id) {
    const { error: updateErr } = await supabaseAdmin
      .from("credits")
      .update(payload)
      .eq("id", creditsRow.id);
    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to update credits" },
        { status: 500 }
      );
    }
  } else {
    const { error: insertErr } = await supabaseAdmin.from("credits").insert({
      user_id: userId,
      ...payload,
    });
    if (insertErr) {
      return NextResponse.json(
        { error: "Failed to insert credits" },
        { status: 500 }
      );
    }
  }

  await supabaseAdmin.from("credits_history").insert({
    user_id: userId,
    charged_credits: creditAmount,
    event_type: `${planName}_monthly_refill`,
  });

  return NextResponse.json(
    { status: "refilled", credits: creditAmount },
    { status: 200 }
  );
}
