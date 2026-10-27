import { PROMOTION_COOKIE } from "@/lib/org/billing/promotion";
import { NextRequest, NextResponse } from "next/server";
import { getBillingCatalog } from "@/lib/org/billing/stripe";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await getBillingCatalog(req.cookies.get(PROMOTION_COOKIE)?.value), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[billing/catalog]", error);
    return NextResponse.json(
      {
        available: false,
        amount: null,
        annualAmount: null,
        testMode: false,
        currency: null,
        taxBehavior: "unspecified",
      },
      { status: 503 }
    );
  }
}
