import { NextRequest, NextResponse } from "next/server";
import { fetchCompanyProfile } from "@/lib/career/companyProfile";
import { getRequestUser } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyDbId = Math.floor(
      Number(req.nextUrl.searchParams.get("companyDbId") ?? "")
    );
    if (!Number.isFinite(companyDbId) || companyDbId <= 0) {
      return NextResponse.json(
        { error: "companyDbId is required" },
        { status: 400 }
      );
    }

    const profile = await fetchCompanyProfile({
      companyDbId,
      talentId: user.id,
    });
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load company profile",
      },
      { status: 500 }
    );
  }
}
