import { NextRequest, NextResponse } from "next/server";
import { getFreshRequestUser } from "@/lib/supabaseServer";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { fetchCareerDevExternalFits } from "@/lib/career/devSql";
import {
  CAREER_DEV_EXTERNAL_FITS_MONTHS,
  type CareerDevExternalFitsMonths,
} from "@/lib/career/devExternalFits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getFreshRequestUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canUseCareerDevControls(user.email))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const months = Number(req.nextUrl.searchParams.get("months") ?? 1);
    const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
    if (
      !CAREER_DEV_EXTERNAL_FITS_MONTHS.includes(
        months as CareerDevExternalFitsMonths
      ) ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    )
      return NextResponse.json(
        { error: "Invalid period or offset" },
        { status: 400 }
      );

    const page = await fetchCareerDevExternalFits({
      userId: user.id,
      months: months as CareerDevExternalFitsMonths,
      offset,
    });
    return NextResponse.json(page, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Career dev external fits lookup failed", error);
    return NextResponse.json(
      { error: "외부 공고 fit을 불러오지 못했어요." },
      { status: 500 }
    );
  }
}
