import { NextRequest, NextResponse } from "next/server";
import { readCompanySummariesInLanguage } from "@/lib/career/companies/summaryLanguage";
import { isPostingRoleId } from "@/lib/career/postingLinks";
import { readCompanyBundles } from "@/lib/career/resources/companyData";
import type {
  CareerInlineCardCompany,
  CareerInlineCardRecord,
} from "@/lib/career/inlineCard";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentPostingCardsByRoleIds,
  toCandidateOpportunityResponse,
} from "@/lib/talentOpportunity";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

type Admin = ReturnType<typeof getTalentSupabaseAdmin>;

/** The shared company record and every saved research entry, grouped by topic.
 * The overview comes in the reader's language. */
async function readCompany(
  admin: Admin,
  workspaceId: string,
  locale: string | null
): Promise<CareerInlineCardCompany | null> {
  const given = await admin
    .from("company_workspace")
    .select("company_workspace_id, logo_url")
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (given.error) throw new Error(given.error.message);
  if (!given.data) return null;
  // An empty label list reads entries of every label.
  const [bundle] = await readCompanyBundles(admin, [workspaceId], [], 0);
  if (!bundle?.name) return null;
  let logoUrl = given.data.logo_url;
  if (!logoUrl && bundle.companyRef.id !== workspaceId) {
    const home = await admin
      .from("company_workspace")
      .select("logo_url")
      .eq("company_workspace_id", bundle.companyRef.id)
      .maybeSingle();
    logoUrl = home.data?.logo_url ?? null;
  }
  const overview = await readCompanySummariesInLanguage(
    admin,
    bundle.items.filter((item) => item.label === "summary"),
    locale
  );
  const topics = new Map<string, CareerInlineCardCompany["topics"][number]>();
  for (const item of bundle.items) {
    const topic = topics.get(item.label) ?? { label: item.label, entries: [] };
    topic.entries.push({
      content: overview.get(item.dataRef.id) ?? item.content,
      checkedAt: item.checkedAt ?? null,
    });
    topics.set(item.label, topic);
  }
  return {
    id: workspaceId,
    name: bundle.name,
    logoUrl: logoUrl || null,
    website: bundle.website ?? null,
    topics: [...topics.values()],
  };
}

/**
 * Reads the records a chat card names. Display only: nothing is recorded as
 * viewed, recommended or saved.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const roleId = req.nextUrl.searchParams.get("roleId")?.trim().toLowerCase();
    const companyId = req.nextUrl.searchParams
      .get("companyId")
      ?.trim()
      .toLowerCase();
    if (
      (!roleId && !companyId) ||
      (roleId && !isPostingRoleId(roleId)) ||
      (companyId && !isPostingRoleId(companyId))
    )
      return NextResponse.json(
        { error: "roleId or companyId is required" },
        { status: 400 }
      );
    const locale =
      req.nextUrl.searchParams.get("locale") ??
      req.cookies.get("NEXT_LOCALE")?.value ??
      null;
    const admin = getTalentSupabaseAdmin();
    const [roles, company] = await Promise.all([
      roleId
        ? fetchTalentPostingCardsByRoleIds({
            admin,
            locale,
            roleIds: [roleId],
            userId: user.id,
          })
        : [],
      companyId ? readCompany(admin, companyId, locale) : null,
    ]);
    const body: CareerInlineCardRecord = {
      role: roles[0] ? toCandidateOpportunityResponse(roles[0]) : null,
      company,
    };
    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load card record",
      },
      { status: 500 }
    );
  }
}
