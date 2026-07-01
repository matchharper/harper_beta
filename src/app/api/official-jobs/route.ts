import { NextResponse } from "next/server";
import { getPublicOfficialJobListItems } from "@/lib/officialJobs/server";

export const runtime = "nodejs";

const PUBLIC_OFFICIAL_JOBS_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";

export async function GET() {
  const jobs = await getPublicOfficialJobListItems();
  const response = NextResponse.json({ jobs });
  response.headers.set("Cache-Control", PUBLIC_OFFICIAL_JOBS_CACHE_CONTROL);
  return response;
}
