import { NextRequest, NextResponse } from "next/server";
import { collectPublishedContentMetrics } from "@/lib/contentsEngine/contentMetrics";
import { verifyCronSecret } from "@/lib/contentsEngine/outreach";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await collectPublishedContentMetrics({ limit: 50 });
    return NextResponse.json({ ok: result.failed === 0, ...result });
  } catch (error) {
    console.error("[contents-engine/content-metrics]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to collect content metrics",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
