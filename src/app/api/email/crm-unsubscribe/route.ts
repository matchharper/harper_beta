import { NextRequest, NextResponse } from "next/server";
import { unsubscribeCrmBroadcastByLink } from "@/lib/career/crmBroadcastSubscription.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function page(body: string, status = 200) {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Harper</title></head><body style="margin:0;font-family:Arial,sans-serif;background:#f7f7f5;color:#111827"><main style="max-width:440px;margin:15vh auto;padding:24px;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;font-size:14px;line-height:1.6">${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * The unsubscribe link in a CRM group email (/ops/crm). Opening it only shows a confirmation, so mail scanners
 * that follow links do not unsubscribe anyone. Recommendation emails keep coming.
 */
export async function GET(req: NextRequest) {
  const userId = (req.nextUrl.searchParams.get("u") ?? "").slice(0, 64);
  const token = (req.nextUrl.searchParams.get("t") ?? "").slice(0, 64);
  return page(`<p style="margin:0 0 16px">Harper 소식 메일을 더 받지 않으시겠어요?<br>Stop receiving Harper update emails?</p>
<form method="post"><input type="hidden" name="u" value="${escapeAttribute(userId)}"><input type="hidden" name="t" value="${escapeAttribute(token)}"><button type="submit" style="padding:8px 14px;border-radius:8px;border:0;background:#111827;color:#fff;font-size:14px;cursor:pointer">수신거부 · Unsubscribe</button></form>`);
}

/** One-click (RFC 8058 List-Unsubscribe-Post, from the mail app) and the confirmation form. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const userId = String(form?.get("u") ?? req.nextUrl.searchParams.get("u") ?? "");
  const token = String(form?.get("t") ?? req.nextUrl.searchParams.get("t") ?? "");
  try {
    const result = await unsubscribeCrmBroadcastByLink({ token, userId });
    if (!result.ok) return page("<p style=\"margin:0\">링크가 올바르지 않아요. · This link is not valid.</p>", 404);
    return page(
      "<p style=\"margin:0\">앞으로 Harper 소식 메일을 보내지 않을게요. 추천 메일은 그대로 받아요. 설정 &gt; 계정에서 다시 켤 수 있어요.<br>You won’t get Harper update emails anymore. Recommendation emails will still arrive. You can turn updates back on in Settings &gt; Account.</p>"
    );
  } catch (error) {
    console.error("[crm-unsubscribe] failed", error);
    return page("<p style=\"margin:0\">처리하지 못했어요. 잠시 뒤 다시 시도해 주세요. · Something went wrong. Please try again later.</p>", 500);
  }
}
