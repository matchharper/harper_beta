import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  OPS_REFERRALS_PAGE_SIZE,
  type OpsReferralEditableField,
} from "@/lib/ops/referrals";
import {
  fetchOpsReferralsPage,
  updateOpsReferralApplication,
  updateOpsReferralStage,
} from "@/lib/ops/referralsServer";

export const runtime = "nodejs";

function normalizeNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      OPS_REFERRALS_PAGE_SIZE,
      Math.max(
        1,
        normalizeNumber(searchParams.get("limit"), OPS_REFERRALS_PAGE_SIZE)
      )
    );
    const offset = Math.max(0, normalizeNumber(searchParams.get("offset"), 0));
    const query = String(searchParams.get("query") ?? "").trim();
    const rewardPaid = String(searchParams.get("rewardPaid") ?? "").trim();
    const stage = String(searchParams.get("stage") ?? "").trim();

    return NextResponse.json(
      await fetchOpsReferralsPage({
        limit,
        offset,
        query,
        rewardPaid,
        stage,
      })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load referrals");
  }
}

const EDITABLE_FIELDS = new Set<OpsReferralEditableField>([
  "amount",
  "hiredAt",
  "memo",
  "rewardPaid",
  "rewardPaidAt",
  "settlementCompletedAt",
]);

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      field?: unknown;
      recommendationId?: unknown;
      referredUserId?: unknown;
      roleId?: unknown;
      value?: unknown;
    };
    const field = String(body.field ?? "").trim();
    const referredUserId = String(body.referredUserId ?? "").trim();
    const roleId = String(body.roleId ?? "").trim();
    if (!referredUserId) {
      throw new InternalApiError(400, "referredUserId is required");
    }
    if (!roleId) throw new InternalApiError(400, "roleId is required");

    if (field === "stage") {
      if (typeof body.value !== "string") {
        throw new InternalApiError(400, "stage value is required");
      }
      return NextResponse.json({
        currentStage: await updateOpsReferralStage({
          actorEmail: user.email ?? null,
          referredUserId,
          roleId,
          stage: body.value,
        }),
        ok: true,
      });
    }

    if (!EDITABLE_FIELDS.has(field as OpsReferralEditableField)) {
      throw new InternalApiError(400, "Unsupported referral field");
    }
    const recommendationId = String(body.recommendationId ?? "").trim();
    if (!recommendationId) {
      throw new InternalApiError(400, "recommendationId is required");
    }
    return NextResponse.json({
      application: await updateOpsReferralApplication({
        field: field as OpsReferralEditableField,
        recommendationId,
        referredUserId,
        roleId,
        value: body.value,
      }),
      ok: true,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update referral");
  }
}
