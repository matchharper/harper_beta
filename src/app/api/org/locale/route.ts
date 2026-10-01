import { NextRequest, NextResponse } from "next/server";
import { isOrgLocale } from "@/i18n/org/locale";
import { upsertOrgCompanyUser } from "@/lib/org/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";

async function companyUserLocale(req: NextRequest) {
  const user = await requireAuthenticatedUser(req);
  const admin = getSupabaseAdmin();
  await upsertOrgCompanyUser(admin, user);
  return { admin, user };
}

export async function GET(req: NextRequest) {
  try {
    const { admin, user } = await companyUserLocale(req);
    const { data, error } = await admin
      .from("company_users")
      .select("locale")
      .eq("user_id", user.id)
      .single();
    if (error) throw error;
    return NextResponse.json(
      { locale: isOrgLocale(data.locale) ? data.locale : null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    if (status === 500) console.error("[org/locale:get]", error);
    return NextResponse.json({ error: "Could not load language setting" }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      locale?: unknown;
      ifUnset?: unknown;
    };
    if (!isOrgLocale(body.locale) || (body.ifUnset != null && typeof body.ifUnset !== "boolean")) {
      return NextResponse.json({ error: "Invalid language setting" }, { status: 400 });
    }
    const { admin, user } = await companyUserLocale(req);
    let query = admin
      .from("company_users")
      .update({ locale: body.locale })
      .eq("user_id", user.id);
    if (body.ifUnset) query = query.is("locale", null);
    const { data, error } = await query.select("locale").maybeSingle();
    if (error) throw error;
    if (data) return NextResponse.json({ locale: data.locale });

    const { data: saved, error: readError } = await admin
      .from("company_users")
      .select("locale")
      .eq("user_id", user.id)
      .single();
    if (readError) throw readError;
    return NextResponse.json({ locale: saved.locale });
  } catch (error) {
    const status = error instanceof Error && error.message === "Unauthorized" ? 401 : 500;
    if (status === 500) console.error("[org/locale:put]", error);
    return NextResponse.json({ error: "Could not save language setting" }, { status });
  }
}
