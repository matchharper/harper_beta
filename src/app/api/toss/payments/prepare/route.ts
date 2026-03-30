import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  getCompanyUserSummary,
  getTossCustomerKeyForUser,
} from "@/lib/billing/server";
import { buildOrderId } from "@/lib/billing/common";
import { getTossClientKey } from "@/lib/toss/server";

export const runtime = "nodejs";

const ONE_TIME_PAYMENT_AMOUNT_KRW = 1000;
const ONE_TIME_PAYMENT_ORDER_NAME = "Harper 일회성 결제";

type PrepareOneTimePaymentBody = {
  userId?: string;
};

export async function POST(req: Request) {
  const clientKey = getTossClientKey();
  if (!clientKey || !clientKey.includes("_ck_")) {
    return NextResponse.json(
      { error: "Missing Toss API client key" },
      { status: 500 }
    );
  }

  let body: PrepareOneTimePaymentBody;
  try {
    body = (await req.json()) as PrepareOneTimePaymentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = String(body?.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const companyUser = await getCompanyUserSummary(supabaseAdmin, userId);
  if (!companyUser?.user_id || !companyUser.is_authenticated) {
    return NextResponse.json({ error: "Unauthorized user" }, { status: 403 });
  }

  const origin = new URL(req.url).origin;
  const orderId = buildOrderId(
    "oneoff",
    `${userId}_${Date.now()}`
  );

  return NextResponse.json(
    {
      amount: ONE_TIME_PAYMENT_AMOUNT_KRW,
      orderId,
      orderName: ONE_TIME_PAYMENT_ORDER_NAME,
      customerKey: getTossCustomerKeyForUser(userId),
      clientKey,
      successUrl: `${origin}/my/billing?one_time_payment=success`,
      failUrl: `${origin}/my/billing?one_time_payment=fail`,
    },
    { status: 200 }
  );
}
