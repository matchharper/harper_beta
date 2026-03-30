import { NextResponse } from "next/server";
import {
  confirmPayment,
  getPayment,
  TossRequestError,
} from "@/lib/toss/server";

export const runtime = "nodejs";

const ONE_TIME_PAYMENT_AMOUNT_KRW = 1000;

type ConfirmOneTimePaymentBody = {
  paymentKey?: string;
  orderId?: string;
  amount?: string | number;
};

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
