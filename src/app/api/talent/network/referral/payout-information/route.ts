import { NextRequest, NextResponse } from "next/server";
import {
  getReferralPayoutStatus,
  ReferralPayoutError,
  submitReferralPayoutInformation,
} from "@/lib/referralPayout/server";

export const runtime = "nodejs";

function json(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      submission?: unknown;
      token?: unknown;
    };
    const action = String(body.action ?? "").trim();

    if (action === "status") {
      return json({
        ok: true,
        status: await getReferralPayoutStatus(body.token),
      });
    }
    if (action === "submit") {
      return json({
        ok: true,
        ...(await submitReferralPayoutInformation({
          submission: body.submission,
          token: body.token,
        })),
      });
    }
    return json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
  } catch (error) {
    if (error instanceof ReferralPayoutError) {
      return json({ error: error.message }, { status: error.status });
    }
    console.error("Referral payout information request failed", error);
    return json(
      { error: "지급정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
