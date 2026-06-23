import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  fetchTalentCompanyWatchlistDetail,
  fetchTalentCompanyWatchlistPage,
  parseCompanyWatchlistTab,
} from "@/lib/career/companyWatchlist";

const parsePositiveIntegerParam = (
  value: string | null,
  fallback: number,
  max: number
) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
};

const parseOffsetParam = (value: string | null) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const parseCompanyDbIdParam = (value: string | null) => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const companyDbId =
      parseCompanyDbIdParam(req.nextUrl.searchParams.get("companyDbId")) ??
      parseCompanyDbIdParam(req.nextUrl.searchParams.get("company"));
    const preferredLocale =
      (await fetchTalentSetting({ admin, userId: user.id }))
        ?.preferred_locale ??
      req.nextUrl.searchParams.get("locale") ??
      req.cookies.get("NEXT_LOCALE")?.value;

    if (companyDbId) {
      const item = await fetchTalentCompanyWatchlistDetail({
        admin,
        companyDbId,
        preferredLocale,
        userId: user.id,
      });

      if (!item) {
        return NextResponse.json(
          { error: "Company not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        item,
        ok: true,
      });
    }

    const page = await fetchTalentCompanyWatchlistPage({
      admin,
      limit: parsePositiveIntegerParam(
        req.nextUrl.searchParams.get("limit"),
        12,
        50
      ),
      offset: parseOffsetParam(req.nextUrl.searchParams.get("offset")),
      tab: parseCompanyWatchlistTab(req.nextUrl.searchParams.get("tab")),
      userId: user.id,
    });

    return NextResponse.json({
      ...page,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load company watchlist",
      },
      { status: 500 }
    );
  }
}
