import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { fillExternalRoleSalaries } from "@/lib/externalRecommendationsV2/salaryEstimation.server";
export const runtime = "nodejs";
export const maxDuration = 180;
const input = z
  .object({ roleIds: z.array(z.string().uuid()).max(500) })
  .strict();
export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const { roleIds } = input.parse(await req.json());
    return NextResponse.json(
      await fillExternalRoleSalaries(
        getTalentSupabaseAdmin(),
        [...new Set(roleIds)],
        req.signal
      )
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Salary cache fill failed");
  }
}
