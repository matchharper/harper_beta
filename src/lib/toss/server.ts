import type { Database, Json } from "@/types/database.types";

type TossRequestOptions = {
  method: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
};

export type TossBillingResponse = {
  customerKey: string;
  billingKey: string;
  cardCompany?: string | null;
  cardNumber?: string | null;
  card?: {
    number?: string | null;
  } | null;
};

export type TossPaymentResponse = {
  paymentKey: string;
  orderId: string;
  status?: string | null;
  method?: string | null;
  approvedAt?: string | null;
  receipt?: {
    url?: string | null;
  } | null;
  card?: {
    company?: string | null;
    number?: string | null;
  } | null;
};

export class TossRequestError extends Error {
  status: number;
  code: string | null;
  responseBody: Json | null;

  constructor(args: {
    message: string;
    status: number;
    code?: string | null;
    responseBody?: Json | null;
  }) {
    super(args.message);
    this.status = args.status;
    this.code = args.code ?? null;
    this.responseBody = args.responseBody ?? null;
  }
}

export function getTossClientKey() {
  return (
    process.env.NEXT_PUBLIC_TOSS_BILLING_CLIENT_KEY ||
    process.env.TOSS_API_CLIENT_KEY ||
    process.env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY ||
    process.env.TOSS_WIDGET_CLIENT_KEY ||
    ""
  );
}

function getTossSecretKey() {
  return process.env.TOSS_API_SECRET_KEY || "";
}

function getTossAuthHeader() {
  const secretKey = getTossSecretKey();
  if (!secretKey) {
    throw new Error("Missing Toss API secret key");
  }
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

async function tossRequest<T>(path: string, options: TossRequestOptions) {
  const res = await fetch(`https://api.tosspayments.com${path}`, {
    method: options.method,
    headers: {
      Authorization: getTossAuthHeader(),
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await res.text();
  let parsed: Json | null = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as Json;
    } catch {
      parsed = rawText;
    }
  }

  if (!res.ok) {
    const responseObject =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    const code =
      typeof responseObject?.code === "string" ? responseObject.code : null;
    const message =
      typeof responseObject?.message === "string"
        ? responseObject.message
        : `Toss API request failed with status ${res.status}`;

    throw new TossRequestError({
      message,
      status: res.status,
      code,
      responseBody: parsed,
    });
  }

  return (parsed ?? null) as T;
}

export async function issueBillingKey(args: {
  authKey: string;
  customerKey: string;
}) {
  return tossRequest<TossBillingResponse>("/v1/billing/authorizations/issue", {
    method: "POST",
    body: {
      authKey: args.authKey,
      customerKey: args.customerKey,
    },
  });
}

export async function approveBilling(args: {
  billingKey: string;
  amount: number;
  customerKey: string;
  orderId: string;
  orderName: string;
  customerEmail?: string | null;
  customerName?: string | null;
  customerIp?: string | null;
}) {
  return tossRequest<TossPaymentResponse>(`/v1/billing/${args.billingKey}`, {
    method: "POST",
    body: {
      amount: args.amount,
      customerKey: args.customerKey,
      orderId: args.orderId,
      orderName: args.orderName,
      customerEmail: args.customerEmail ?? undefined,
      customerName: args.customerName ?? undefined,
      customerIp: args.customerIp ?? undefined,
    },
  });
}

export async function confirmPayment(args: {
  paymentKey: string;
  orderId: string;
  amount: number;
}) {
  return tossRequest<TossPaymentResponse>("/v1/payments/confirm", {
    method: "POST",
    body: {
      paymentKey: args.paymentKey,
      orderId: args.orderId,
      amount: args.amount,
    },
  });
}

export async function getPayment(paymentKey: string) {
  return tossRequest<TossPaymentResponse>(`/v1/payments/${paymentKey}`, {
    method: "GET",
  });
}

export async function deleteBillingKey(billingKey: string) {
  return tossRequest<null>(`/v1/billing/${billingKey}`, {
    method: "DELETE",
  });
}
