import { NextRequest, NextResponse } from "next/server";
import { fetchCompanyJobsPage } from "@/lib/career/companyJobs.server";
import { isPostingRoleId } from "@/lib/career/postingLinks";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const params = req.nextUrl.searchParams;
    const companyDbId = params.has("companyDbId")
      ? Number(params.get("companyDbId"))
      : null;
    const roleId = params.get("roleId") || null;
    const offset = Number(params.get("offset") ?? 0);
    if (
      (companyDbId === null && !roleId) ||
      (companyDbId !== null &&
        (!Number.isSafeInteger(companyDbId) || companyDbId <= 0)) ||
      (roleId !== null && !isPostingRoleId(roleId)) ||
      !Number.isSafeInteger(offset) ||
      offset < 0
    ) {
      return NextResponse.json(
        { error: "Invalid company, role, or offset" },
        { status: 400 }
      );
    }
    const page = await fetchCompanyJobsPage({
      admin: getTalentSupabaseAdmin(),
      companyDbId,
      roleId,
      offset,
      userId: user.id,
      locale:
        params.get("locale") ?? req.cookies.get("NEXT_LOCALE")?.value ?? null,
    });
    return NextResponse.json(page);
  } catch (error) {
    console.error("[career:company-jobs]", error);
    return NextResponse.json(
      { error: "Failed to load company jobs" },
      { status: 500 }
    );
  }
}
