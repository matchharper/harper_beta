import { NextRequest, NextResponse } from "next/server";
import { normalizeLinkedinCompanyUrl } from "@/lib/companyLinkedin";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

type CompanyDbRow = {
  id: number;
  last_updated_at: string | null;
  linkedin_url: string | null;
  location: string | null;
  logo: string | null;
  name: string | null;
};

const asCompanyRows = (value: unknown): CompanyDbRow[] =>
  Array.isArray(value) ? (value as CompanyDbRow[]) : [];

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const normalizedLinkedinUrl = normalizeLinkedinCompanyUrl(
      req.nextUrl.searchParams.get("linkedinUrl") ?? ""
    );
    if (!normalizedLinkedinUrl) {
      return NextResponse.json({ company: null, ok: true });
    }

    const admin = getTalentSupabaseAdmin();
    const candidates = [
      normalizedLinkedinUrl,
      `${normalizedLinkedinUrl}/`,
      normalizedLinkedinUrl.replace("https://www.", "https://"),
      `${normalizedLinkedinUrl.replace("https://www.", "https://")}/`,
    ];
    const { data, error } = await (admin.from("company_db") as any)
      .select("id, linkedin_url, name, location, logo, last_updated_at")
      .in("linkedin_url", candidates)
      .order("last_updated_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      throw new Error(error.message ?? "Failed to look up company");
    }

    let row: CompanyDbRow | null = asCompanyRows(data)[0] ?? null;
    if (!row) {
      const linkedinSlug = normalizedLinkedinUrl.split("/").at(-1) ?? "";
      const { data: fuzzyData, error: fuzzyError } = await (
        admin.from("company_db") as any
      )
        .select("id, linkedin_url, name, location, logo, last_updated_at")
        .ilike("linkedin_url", `%/company/${linkedinSlug}%`)
        .order("last_updated_at", { ascending: false, nullsFirst: false })
        .limit(10);

      if (fuzzyError) {
        throw new Error(fuzzyError.message ?? "Failed to look up company");
      }

      row =
        asCompanyRows(fuzzyData).find(
          (candidate) =>
            normalizeLinkedinCompanyUrl(candidate.linkedin_url ?? "") ===
            normalizedLinkedinUrl
        ) ?? null;
    }

    return NextResponse.json({
      company: row
        ? {
            id: String(row.id),
            linkedinUrl: normalizedLinkedinUrl,
            location: row.location,
            logo: row.logo,
            name: row.name,
          }
        : null,
      linkedinUrl: normalizedLinkedinUrl,
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to look up company",
      },
      { status: 500 }
    );
  }
}
