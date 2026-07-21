import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { sendOpsReferralPayoutInformationRequest } from "@/lib/ops/referralsServer";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      recommendationId?: unknown;
      referredUserId?: unknown;
      roleId?: unknown;
    };
    const recommendationId = String(body.recommendationId ?? "").trim();
    const referredUserId = String(body.referredUserId ?? "").trim();
    const roleId = String(body.roleId ?? "").trim();
    if (!recommendationId) {
      throw new InternalApiError(400, "recommendationId is required");
    }
    if (!referredUserId) {
      throw new InternalApiError(400, "referredUserId is required");
    }
    if (!roleId) throw new InternalApiError(400, "roleId is required");

    return NextResponse.json({
      ok: true,
      payoutInformation: await sendOpsReferralPayoutInformationRequest({
        actorEmail: user.email ?? null,
        baseUrl: getPublicSiteUrlFromRequest(req),
        recommendationId,
        referredUserId,
        roleId,
      }),
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to send referral payout information request"
    );
  }
}
