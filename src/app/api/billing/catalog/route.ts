import { NextResponse } from "next/server";
import { getBillingCatalog } from "@/lib/org/billing/stripe";
export const runtime = "nodejs";
export async function GET() {
  try {
    return NextResponse.json(await getBillingCatalog(), {
      headers: { "Cache-Control": "public, max-age=60" },
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
