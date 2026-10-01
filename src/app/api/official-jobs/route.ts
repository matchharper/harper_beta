import { NextRequest, NextResponse } from "next/server";
import {
  getPublicOfficialJobsPage,
  getPublicOfficialJobListItems,
} from "@/lib/officialJobs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rawOffset = req.nextUrl.searchParams.get("offset") ?? "0";
  const offset = Number(rawOffset);
  if (!/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "Invalid offset" }, { status: 400 });
  }
  try {
    const page = req.nextUrl.searchParams.has("offset")
      ? await getPublicOfficialJobsPage(offset)
      : { jobs: await getPublicOfficialJobListItems() };
    return NextResponse.json(page, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.warn("official jobs page query failed:", error);
    return NextResponse.json(
      { error: "Failed to load official jobs" },
      { status: 500 }
    );
  }
}
