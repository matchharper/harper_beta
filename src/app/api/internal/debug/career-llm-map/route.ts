import { NextRequest, NextResponse } from "next/server";
import { requireInternalApiUser, toInternalApiErrorResponse } from "@/lib/internalApi";
import { buildCareerLlmMap, careerLlmMapDocument } from "@/lib/ops/careerLlmMap/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const manifest = await buildCareerLlmMap();
    const headers = {"Cache-Control": "private, no-store"};
    if (req.nextUrl.searchParams.get("revision") === manifest.revision)
      return NextResponse.json({revision: manifest.revision, unchanged: true}, {headers});
    return NextResponse.json({revision: manifest.revision, manifest, document: await careerLlmMapDocument()}, {headers});
  } catch (error) {
    return toInternalApiErrorResponse(error, "Career LLM 지도를 읽지 못했습니다.");
  }
}
