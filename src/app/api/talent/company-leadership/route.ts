import { NextRequest, NextResponse } from "next/server";
import { fetchCompanyLeadership } from "@/lib/career/companyLeadership";
import { getRequestUser } from "@/lib/supabaseServer";

const parseCompanyDbIdParam = (value: string | null) => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const parseCompanyWorkspaceIdParam = (value: string | null) => {
  const text = String(value ?? "").trim();
  return UUID_PATTERN.test(text) ? text : null;
};

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyWorkspaceId = parseCompanyWorkspaceIdParam(
      req.nextUrl.searchParams.get("companyWorkspaceId")
    );
    const companyDbId =
      parseCompanyDbIdParam(req.nextUrl.searchParams.get("companyDbId")) ??
      parseCompanyDbIdParam(req.nextUrl.searchParams.get("company"));

    if (!companyWorkspaceId && !companyDbId) {
      return NextResponse.json(
        { error: "companyWorkspaceId or companyDbId is required" },
        { status: 400 }
      );
    }

    const leaders = await fetchCompanyLeadership({
      companyDbId,
      companyWorkspaceId,
    });

    return NextResponse.json({
      leaders,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load company leadership",
      },
      { status: 500 }
    );
  }
}
