import { NextRequest, NextResponse } from "next/server";
import { unsubscribeExternalInvite } from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escapeAttribute(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function page(body: string, status = 200) {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Harper</title></head><body style="margin:0;font-family:Arial,sans-serif;background:#f7f7f5;color:#111827"><main style="max-width:440px;margin:15vh auto;padding:24px;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;font-size:14px;line-height:1.6">${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** The link in the invitation shows a confirmation; mail scanners that follow links do not opt anyone out. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  return page(`<p style="margin:0 0 16px">Harper에서 오는 연락을 더 받지 않으시겠어요?<br>Stop receiving messages from Harper?</p>
<form method="post"><input type="hidden" name="t" value="${escapeAttribute(token.slice(0, 200))}"><button type="submit" style="padding:8px 14px;border-radius:8px;border:0;background:#111827;color:#fff;font-size:14px;cursor:pointer">연락 받지 않기 · Unsubscribe</button></form>`);
}

/** One-click (RFC 8058 List-Unsubscribe-Post) and the confirmation form. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("t") ?? req.nextUrl.searchParams.get("t") ?? "");
  try {
    const result = await unsubscribeExternalInvite({ admin: getSupabaseAdmin(), token });
    if (!result.ok) return page("<p style=\"margin:0\">링크가 올바르지 않아요. · This link is not valid.</p>", 404);
    return page("<p style=\"margin:0\">앞으로 Harper에서 연락드리지 않을게요. · You won’t hear from Harper again.</p>");
  } catch (error) {
    console.error("[external-invite] unsubscribe failed", error);
    return page("<p style=\"margin:0\">처리하지 못했어요. 잠시 뒤 다시 시도해 주세요. · Something went wrong. Please try again later.</p>", 500);
  }
}
