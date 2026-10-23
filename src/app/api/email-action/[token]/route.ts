import { type NextRequest, NextResponse } from "next/server";
import {
  getCompanyEmailActionView,
  submitCompanyEmailAction,
} from "@/lib/email/companyEmailAction.server";

type RouteContext = { params: Promise<{ token: string }> };

// The token is a bearer credential: never cache it or send it onward as Referer.
const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function errorResponse(error: unknown) {
  console.error("[company-email-action]", error);
  return NextResponse.json(
    { error: "처리 화면을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." },
    { status: 500, headers: HEADERS }
  );
}

/** Reads state only; opening a mail button never records anything. */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const result = await getCompanyEmailActionView(
      token,
      req.headers.get("accept-language")
    );
    return NextResponse.json(result.view, { status: result.status, headers: HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = await req.json().catch(() => ({}));
    const result = await submitCompanyEmailAction(
      token,
      body,
      req.headers.get("accept-language")
    );
    return NextResponse.json(result.view, { status: result.status, headers: HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
