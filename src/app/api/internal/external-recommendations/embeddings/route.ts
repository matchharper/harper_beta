import { NextRequest, NextResponse } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { drainRoleTitleEmbeddings } from "@/lib/externalRecommendationsV2/embeddings";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return new NextResponse(null, { status: 401 });
  const result = await drainRoleTitleEmbeddings(getTalentSupabaseAdmin());
  const incomplete = result.remaining !== 0 || result.errors.length > 0;
  if (incomplete) console.error("[title-embeddings] incomplete", result);
  else console.info("[title-embeddings] complete", result);
  return NextResponse.json(result, { status: incomplete ? 503 : 200 });
}
