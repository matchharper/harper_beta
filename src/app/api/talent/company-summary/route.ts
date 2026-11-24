import { NextRequest, NextResponse } from "next/server";
import { readCompanySummariesInLanguage } from "@/lib/career/companies/summaryLanguage";
import { readCompanyProjections } from "@/lib/career/resources/companyData";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The saved shared overview of an opportunity's company. The employer is
 * resolved under the viewer's access, so an anonymous Role reveals nothing.
 * This read never starts a new search. The overview comes in the reader's language.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const kind = req.nextUrl.searchParams.get("kind");
    const id = String(req.nextUrl.searchParams.get("id") ?? "").trim();
    if ((kind !== "role" && kind !== "company_workspace") || !UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: "kind and id are required" }, { status: 400 });
    }
    const admin = getTalentSupabaseAdmin();
    const projections = await readCompanyProjections(
      { admin, userId: user.id },
      [{ kind, id }],
      { mode: "detail" }
    );
    const summary = projections.get(`${kind}:${id}`)?.summary ?? null;
    const locale =
      req.nextUrl.searchParams.get("locale") ??
      req.cookies.get("NEXT_LOCALE")?.value ??
      null;
    const text = summary
      ? await readCompanySummariesInLanguage(admin, [summary], locale, {
          signal: req.signal,
        })
      : null;
    return NextResponse.json({
      ok: true,
      summary: summary
        ? {
            markdown: text?.get(summary.dataRef.id) ?? summary.content,
            checkedAt: summary.checkedAt ?? null,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load company summary" },
      { status: 500 }
    );
  }
}
