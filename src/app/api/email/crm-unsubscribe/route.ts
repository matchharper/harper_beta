import { NextRequest, NextResponse } from "next/server";
import { unsubscribeCrmBroadcastByLink } from "@/lib/career/crmBroadcastSubscription.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The unsubscribe link in a CRM group email (/ops/crm). Opening it shows the confirmation page
 * (/email/crm-unsubscribe), so mail scanners that follow links do not unsubscribe anyone.
 */
export function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/email/crm-unsubscribe";
  return NextResponse.redirect(url);
}

/** One-click unsubscribe from the mail app (RFC 8058 List-Unsubscribe-Post). Recommendation emails keep coming. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const userId = String(form?.get("u") ?? req.nextUrl.searchParams.get("u") ?? "");
  const token = String(form?.get("t") ?? req.nextUrl.searchParams.get("t") ?? "");
  try {
    const result = await unsubscribeCrmBroadcastByLink({ token, userId });
    return new NextResponse(null, { status: result.ok ? 200 : 404 });
  } catch (error) {
    console.error("[crm-unsubscribe] failed", error);
    return new NextResponse(null, { status: 500 });
  }
}
