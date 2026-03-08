import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";
import { notifySlack } from "../../hello/utils";

const CREDIT_FEEDBACK_SOURCE = "credit";

type CreditFeedbackBody = {
  content?: string;
  planName?: string;
  billing?: "monthly" | "yearly" | string;
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreditFeedbackBody;
  try {
    body = (await req.json()) as CreditFeedbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = String(body?.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ error: "Missing feedback content" }, { status: 400 });
  }
  const planName = String(body?.planName ?? "").trim() || "알 수 없음";
  const billingRaw = String(body?.billing ?? "").trim().toLowerCase();
  const billingLabel =
    billingRaw === "yearly"
      ? "연간"
      : billingRaw === "monthly"
        ? "월간"
        : "알 수 없음";
  const contentWithContext = `[구독 문의]\n플랜: ${planName}\n결제 주기: ${billingLabel}\n\n${content}`;

  const { data, error } = await supabaseServer
    .from("feedback")
    .insert({
      user_id: user.id,
      content: contentWithContext,
      from: CREDIT_FEEDBACK_SOURCE,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save feedback" },
      { status: 500 }
    );
  }

  try {
    await notifySlack(`💳 *Credit Subscription Inquiry*

• *User ID*: ${user.id}
• *Email*: ${user.email ?? "정보 없음"}
• *Plan*: ${planName}
• *Billing*: ${billingLabel}
• *Content*: ${content}
• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);
  } catch (slackError) {
    console.error("credit feedback slack notify failed:", slackError);
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}
