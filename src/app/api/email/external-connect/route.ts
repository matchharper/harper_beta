import { NextRequest, NextResponse } from "next/server";
import {
  acceptExternalInvite,
  getExternalConnectView,
  type ExternalConnectView,
} from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The token is a bearer credential: never cache the page or send it onward as Referer.
const HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function page(body: string, lang: string, status = 200) {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Harper</title></head><body style="margin:0;font-family:Arial,sans-serif;background:#f7f7f5;color:#111827"><main style="max-width:440px;margin:15vh auto;padding:24px;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:12px;font-size:14px;line-height:1.6">${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: HEADERS });
}

function paragraph(text: string) {
  return `<p style="margin:0 0 12px">${escapeHtml(text)}</p>`;
}

/** What the person sees for each state; the page itself never connects anyone. */
function render(view: ExternalConnectView, token: string) {
  if (view.state === "not_found") {
    return page(paragraph("링크가 올바르지 않아요. · This link is not valid."), "ko", 404);
  }
  const ko = view.language === "ko";
  const person = view.personName?.trim() || "";
  const team = view.companyName ? (ko ? `${view.companyName} 담당자` : `${view.companyName}'s hiring team`) : (ko ? "회사 담당자" : "the hiring team");
  const role = view.roleName ? (ko ? `${view.roleName} 포지션` : `the ${view.roleName} role`) : "";
  if (view.state === "connected") {
    return page(paragraph(ko ? `${team}와 연결했어요. 받은편지함에서 소개 메일을 확인해 주세요.`
      : `You are connected with ${team}. Please check your inbox for the introduction email.`), view.language);
  }
  if (view.state === "connecting") {
    return page(paragraph(ko ? `${team}와 연결하고 있어요. 곧 소개 메일을 받으실 거예요.`
      : `Connecting you with ${team}. The introduction email is on its way.`), view.language);
  }
  if (view.state === "closed") {
    return page(paragraph(ko ? "이 연결 요청은 더 이상 진행되지 않아요." : "This connection request is no longer open."), view.language);
  }
  const question = ko
    ? `${role ? `${role}으로 ` : ""}${team}와 이메일로 연결할까요?`
    : `Connect with ${team}${role ? ` about ${role}` : ""} by email?`;
  const detail = ko
    ? `연결하면 Harper가 ${person ? `${person}님과 ` : ""}담당자를 한 메일로 소개해요. 이때 담당자에게 이메일 주소가 전달돼요.`
    : "Harper will introduce you to them in one email, which shares your email address with them.";
  return page(`${paragraph(question)}${paragraph(detail)}<form method="post"><input type="hidden" name="t" value="${escapeHtml(token.slice(0, 200))}"><button type="submit" style="padding:8px 14px;border-radius:8px;border:0;background:#111827;color:#fff;font-size:14px;cursor:pointer">${ko ? "연결하기" : "Connect"}</button></form>`, view.language);
}

/** The link in the invitation: shows the question only, so mail scanners that open links connect nobody. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("t") ?? "";
  try {
    return render(await getExternalConnectView({ admin: getSupabaseAdmin(), token }), token);
  } catch (error) {
    console.error("[external-invite] connect page failed", error);
    return page(paragraph("처리하지 못했어요. 잠시 뒤 다시 시도해 주세요. · Something went wrong. Please try again later."), "ko", 500);
  }
}

/** The person's confirmation: recorded once, then the introduction email goes out. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("t") ?? req.nextUrl.searchParams.get("t") ?? "");
  try {
    return render(await acceptExternalInvite({ admin: getSupabaseAdmin(), token }), token);
  } catch (error) {
    console.error("[external-invite] connect failed", error);
    return page(paragraph("처리하지 못했어요. 잠시 뒤 다시 시도해 주세요. · Something went wrong. Please try again later."), "ko", 500);
  }
}
