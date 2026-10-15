import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  providerSchema,
  workerSearchContextSchema,
} from "@/lib/externalRecommendationsV2/contract";
import { runWorkerExternalSearch } from "@/lib/externalRecommendationsV2/worker";
export const runtime = "nodejs";
export const maxDuration = 800;
const input = z.object({
  userId: z.string().uuid(),
  experimentRunId: z.string().uuid().optional(),
  discoveryRunId: z.string().uuid().optional(),
  request: z.string().max(20000).optional(),
  language: z.enum(["ko", "en"]),
  surface: z.enum(["worker", "web"]).default("worker"),
  targetCount: z.number().int().min(0).max(20).default(5),
  dryRun: z.boolean().default(false),
  provider: providerSchema.optional(),
  workerSearchContext: workerSearchContextSchema.optional(),
  behaviorSnapshot: z.object({
    text: z.string().max(60000),
    version: z.number().int().nonnegative(),
  }),
});
export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const parsed = input.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: "Invalid search request" },
        { status: 400 }
      );
    const result = await runWorkerExternalSearch({
      ...parsed.data,
      admin: getTalentSupabaseAdmin(),
    });
    return NextResponse.json(result);
  } catch (error) {
    return toInternalApiErrorResponse(error, "External search failed");
  }
}
