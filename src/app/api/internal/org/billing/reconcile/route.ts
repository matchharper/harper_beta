import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { reconcileWorkspaceBilling } from "@/lib/org/billing/reconcile";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const received = req.headers.get("authorization") ?? "";
  if (
    !expected ||
    Buffer.byteLength(received) !== Buffer.byteLength(`Bearer ${expected}`) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(`Bearer ${expected}`))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await reconcileWorkspaceBilling();
    return NextResponse.json(result, {
      status: result.failures.length || result.unresolved ? 503 : 200,
    });
  } catch (error) {
    console.error("[billing/reconcile]", error);
    return NextResponse.json(
      { error: "Reconciliation failed" },
      { status: 503 }
    );
  }
}
