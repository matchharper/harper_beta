import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const FREE_REFRESH_EXCLUDED_USER_IDS = new Set<string>([
  "5219cf7f-90fa-4b71-907a-6f7ad03bb837",
  "111fe5c4-8f66-4392-9a27-e81fb8dfa7dd",
]);

type FreePlan = {
  plan_id: string;
  credit: number | null;
  name: string | null;
  display_name: string | null;
};

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
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { status: "skipped_missing_service_role_key" },
      { status: 200 }
    );
  }

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

  if (FREE_REFRESH_EXCLUDED_USER_IDS.has(userId)) {
    return NextResponse.json({ status: "excluded_user" }, { status: 200 });
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: activePayment, error: activeErr } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("user_id", userId)
    .gte("current_period_end", nowIso)
    .limit(1)
    .maybeSingle();

  if (activeErr) {
    return NextResponse.json(
      { error: "Failed to check active subscription" },
      { status: 500 }
    );
  }

  if (activePayment?.id) {
    return NextResponse.json(
      { status: "active_subscription" },
      { status: 200 }
    );
  }

  const { data: freePlan, error: freeErr } = await supabaseAdmin
    .from("plans")
    .select("plan_id, credit, name, display_name")
    .eq("ls_variant_id", "0000000")
    .maybeSingle();

  if (freeErr || !freePlan) {
    return NextResponse.json({ error: "Free plan not found" }, { status: 500 });
  }

  const { data: latestPayment, error: latestErr } = await supabaseAdmin
    .from("payments")
    .select("current_period_end")
    .eq("user_id", userId)
    .not("current_period_end", "is", null)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (latestErr) {
    return NextResponse.json(
      { error: "Failed to load latest payment" },
      { status: 500 }
    );
  }

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

  const freeCredit = Number(freePlan.credit ?? 10);
  const lastUpdated =
    creditsRow?.last_updated_at ?? creditsRow?.created_at ?? null;
  const latestEnd = latestPayment?.current_period_end ?? null;

  let dueAt: Date | null = null;

  if (latestEnd) {
    const end = new Date(latestEnd);
    if (!isNaN(end.getTime())) {
      const lastUpdatedDate = lastUpdated ? new Date(lastUpdated) : null;
      if (!lastUpdatedDate || lastUpdatedDate < end) {
        if (now >= end) {
          dueAt = end;
        }
      }
    }
  }

  if (!dueAt && lastUpdated) {
    const next = addMonths(new Date(lastUpdated), 1);
    if (now >= next) {
      dueAt = next;
    }
  }

  // Seed first free-plan credits for accounts with no prior credit row or billing anchor.
  if (!dueAt && !creditsRow?.id && !latestEnd) {
    dueAt = now;
  }

  if (!dueAt) {
    return NextResponse.json({ status: "not_due" }, { status: 200 });
  }

  const payload = {
    charged_credit: freeCredit,
    remain_credit: freeCredit,
    last_updated_at: dueAt.toISOString(),
    type: "free",
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

  const eventType = `${freePlan.name ?? "free"}_subscription`;
  await supabaseAdmin.from("credits_history").insert({
    user_id: userId,
    charged_credits: freeCredit,
    event_type: eventType,
  });

  return NextResponse.json(
    { status: "refilled", credits: freeCredit },
    { status: 200 }
  );
}
