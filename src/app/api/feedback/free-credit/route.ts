import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

const FREE_CREDIT_SOURCE = "free-credit-onetime";
const FREE_CREDIT_AMOUNT = 5;

export async function POST(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let content = "";
  try {
    const body = await req.json();
    content = String(body?.content ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!content) {
    return NextResponse.json({ error: "Missing feedback content" }, { status: 400 });
  }

  const { data: insertedFeedback, error: insertFeedbackError } = await supabaseServer
    .from("feedback")
    .insert({
      user_id: user.id,
      content,
      from: FREE_CREDIT_SOURCE,
    })
    .select("id")
    .single();

  if (insertFeedbackError || !insertedFeedback?.id) {
    return NextResponse.json(
      { error: insertFeedbackError?.message ?? "Failed to save feedback" },
      { status: 500 }
    );
  }

  // Grant free credit only to the earliest free-credit feedback per account.
  const { data: firstFeedback, error: firstFeedbackError } = await supabaseServer
    .from("feedback")
    .select("id")
    .eq("user_id", user.id)
    .eq("from", FREE_CREDIT_SOURCE)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstFeedbackError) {
    return NextResponse.json(
      { error: firstFeedbackError.message ?? "Failed to verify feedback history" },
      { status: 500 }
    );
  }

  const shouldGrantCredit = firstFeedback?.id === insertedFeedback.id;
  if (!shouldGrantCredit) {
    return NextResponse.json(
      { granted: false, freeCreditAmount: FREE_CREDIT_AMOUNT },
      { status: 200 }
    );
  }

  const { data: creditsRow, error: creditsError } = await supabaseServer
    .from("credits")
    .select("id, remain_credit, charged_credit")
    .eq("user_id", user.id)
    .maybeSingle();

  if (creditsError) {
    return NextResponse.json(
      { error: creditsError.message ?? "Failed to load credits" },
      { status: 500 }
    );
  }

  const nextRemainCredit = (creditsRow?.remain_credit ?? 0) + FREE_CREDIT_AMOUNT;
  const nextChargedCredit = (creditsRow?.charged_credit ?? 0) + FREE_CREDIT_AMOUNT;

  if (creditsRow?.id) {
    const { error: updateError } = await supabaseServer
      .from("credits")
      .update({
        remain_credit: nextRemainCredit,
        charged_credit: nextChargedCredit,
      })
      .eq("id", creditsRow.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message ?? "Failed to update credits" },
        { status: 500 }
      );
    }
  } else {
    const { error: insertCreditsError } = await supabaseServer
      .from("credits")
      .insert({
        user_id: user.id,
        remain_credit: nextRemainCredit,
        charged_credit: nextChargedCredit,
        type: "free",
      });

    if (insertCreditsError) {
      return NextResponse.json(
        { error: insertCreditsError.message ?? "Failed to create credits row" },
        { status: 500 }
      );
    }
  }

  const { error: historyError } = await supabaseServer.from("credits_history").insert({
    user_id: user.id,
    charged_credits: FREE_CREDIT_AMOUNT,
    event_type: FREE_CREDIT_SOURCE,
  });

  if (historyError) {
    console.error("Failed to insert free-credit history:", historyError);
  }

  return NextResponse.json(
    {
      granted: true,
      freeCreditAmount: FREE_CREDIT_AMOUNT,
      remainCredit: nextRemainCredit,
    },
    { status: 200 }
  );
}
