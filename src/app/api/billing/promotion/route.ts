import { NextRequest, NextResponse } from "next/server";
import { PROMOTION_COOKIE, PROMOTION_END, readPromotion } from "@/lib/org/billing/promotion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  try {
    if (!readPromotion(token)) throw new Error("Missing invitation");
    const response = NextResponse.redirect(new URL("/org/slots?purchase=slot&interval=month&lang=ko", req.url));
    response.cookies.set(PROMOTION_COOKIE, token!, {
      httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax",
      path: "/", expires: new Date(PROMOTION_END),
    });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return new NextResponse("프로모션 링크가 유효하지 않거나 신청 기간이 끝났어요. chris@matchharper.com으로 문의해 주세요.", {
      status: 410, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
