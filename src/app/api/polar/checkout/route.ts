import { NextResponse } from "next/server";
import { Polar } from "@polar-sh/sdk";
import {
  POLAR_PRODUCT_PROFILE,
  POLAR_SERVER,
  POLAR_SUCCESS_URL,
  getPolarProductId,
} from "@/lib/polar/config";

export const runtime = "nodejs";

type PlanKey = "pro" | "max";
type Billing = "monthly" | "yearly";

const POLAR_API_KEY =
  process.env.POLAR_API_KEY || process.env.POLAR_ACCESS_TOKEN || "";

const polarClient = POLAR_API_KEY
  ? new Polar({
      accessToken: POLAR_API_KEY,
      server: POLAR_SERVER,
    })
  : null;

export async function POST(req: Request) {
  if (!polarClient) {
    return NextResponse.json(
      { error: "Missing Polar API key" },
      { status: 500 }
    );
  }

  let userId = "";
  let planKey = "" as PlanKey | "";
  let billing = "" as Billing | "";
  try {
    const body = await req.json();
    userId = String(body?.userId ?? "");
    planKey = String(body?.planKey ?? "") as PlanKey | "";
    billing = String(body?.billing ?? "") as Billing | "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if ((planKey !== "pro" && planKey !== "max") || (billing !== "monthly" && billing !== "yearly")) {
    return NextResponse.json(
      { error: "Invalid planKey or billing" },
      { status: 400 }
    );
  }

  const productId = getPolarProductId(planKey, billing);
  if (!productId) {
    return NextResponse.json(
      {
        error: "Polar product is not configured for this plan/billing",
        planKey,
        billing,
        profile: POLAR_PRODUCT_PROFILE,
      },
      { status: 400 }
    );
  }

  try {
    const checkout = await polarClient.checkouts.create({
      products: [productId],
      successUrl: POLAR_SUCCESS_URL,
      externalCustomerId: userId,
      metadata: {
        user_id: userId,
        plan_key: planKey,
        billing,
      },
      customerMetadata: {
        user_id: userId,
      },
    });

    return NextResponse.json(
      {
        url: checkout.url,
        checkoutId: checkout.id,
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const err = e as {
      message?: string;
      statusCode?: number;
      body?: string;
    };
    const statusCode =
      typeof err?.statusCode === "number" && err.statusCode >= 400
        ? err.statusCode
        : 502;

    const message = err?.body || err?.message || "Unknown error";

    return NextResponse.json(
      {
        error: "Failed to create Polar checkout",
        message,
        polarServer: POLAR_SERVER,
        productProfile: POLAR_PRODUCT_PROFILE,
        productId,
      },
      { status: statusCode }
    );
  }
}
