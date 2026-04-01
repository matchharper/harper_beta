import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  getCompanyUserSummary,
} from "@/lib/billing/server";
import { notifyBillingPaymentSucceeded } from "@/lib/billing/notifications";
import {
  confirmPayment,
  getPayment,
  TossRequestError,
} from "@/lib/toss/server";

export const runtime = "nodejs";

const ONE_TIME_PAYMENT_AMOUNT_KRW = 1000;
const ONE_TIME_PAYMENT_USER_ID_REGEX =
  /^oneoff_([0-9a-fA-F-]{36})_\d+$/;

type ConfirmOneTimePaymentBody = {
  paymentKey?: string;
  orderId?: string;
  amount?: string | number;
};

function parseOneTimePaymentUserId(orderId: string) {
  const matched = orderId.match(ONE_TIME_PAYMENT_USER_ID_REGEX);
  return matched?.[1] ?? null;
}

export async function POST(req: Request) {
  let body: ConfirmOneTimePaymentBody;
  try {
    body = (await req.json()) as ConfirmOneTimePaymentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const paymentKey = String(body?.paymentKey ?? "").trim();
  const orderId = String(body?.orderId ?? "").trim();
  const amount = Number(body?.amount);

  if (!paymentKey || !orderId || !Number.isFinite(amount)) {
    return NextResponse.json(
      { error: "Missing paymentKey, orderId, or amount" },
      { status: 400 }
    );
  }

  if (!orderId.startsWith("oneoff_")) {
    return NextResponse.json(
      { error: "Unsupported orderId for one-time payment" },
      { status: 400 }
    );
  }

  if (amount !== ONE_TIME_PAYMENT_AMOUNT_KRW) {
    return NextResponse.json(
      { error: "Unexpected one-time payment amount" },
      { status: 400 }
    );
  }

  try {
    const payment = await confirmPayment({
      paymentKey,
      orderId,
      amount,
    });

    const userId = parseOneTimePaymentUserId(orderId);
    if (userId) {
      try {
        const supabaseAdmin = createSupabaseAdminClient();
        const companyUser = await getCompanyUserSummary(supabaseAdmin, userId);
        await notifyBillingPaymentSucceeded({
          kind: "one_time_payment",
          userId,
          userEmail: companyUser?.email ?? null,
          userName: companyUser?.name ?? null,
          planName: "Harper 일회성 결제",
          billing: null,
          amountKRW: amount,
          approvedAt: payment.approvedAt ?? null,
          orderId: payment.orderId,
          paymentKey: payment.paymentKey,
        });
      } catch (slackError) {
        console.error("[billing] slack notify failed after one-time payment", {
          orderId,
          error: slackError,
        });
      }
    }

    return NextResponse.json(
      {
        status: "confirmed",
        paymentKey: payment.paymentKey,
        orderId: payment.orderId,
        approvedAt: payment.approvedAt ?? null,
        receiptUrl: payment.receipt?.url ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    if (
      error instanceof TossRequestError &&
      error.code === "ALREADY_PROCESSED_PAYMENT"
    ) {
      const payment = await getPayment(paymentKey);
      return NextResponse.json(
        {
          status: "already_confirmed",
          paymentKey: payment.paymentKey,
          orderId: payment.orderId,
          approvedAt: payment.approvedAt ?? null,
          receiptUrl: payment.receipt?.url ?? null,
        },
        { status: 200 }
      );
    }

    const message =
      error instanceof TossRequestError
        ? error.message
        : "Failed to confirm one-time payment";
    const code = error instanceof TossRequestError ? error.code : null;
    const status =
      error instanceof TossRequestError && error.status >= 400
        ? error.status
        : 502;

    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status }
    );
  }
}
