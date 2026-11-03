import { NextRequest, NextResponse } from "next/server";
import { updateCompanyEmailPreferences } from "@/lib/email/companyPreferences";
import { companyEmailTopicEnabled } from "@/lib/email/companyPreferencesContract";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import { normalizeOrgLinkedinUrl, type OrgPersonalSettings } from "@/lib/org/personalSettings";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  if (error instanceof Error && error.message === "Unauthorized")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  console.error("[org/personal-settings]", error);
  return NextResponse.json(
    { error: "Could not load or save personal settings" },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const workspaceId = req.nextUrl.searchParams.get("workspaceId")?.trim();
    if (!workspaceId) throw new OrgHttpError(400, "workspaceId is required");
    const admin = getSupabaseAdmin();
    await assertOrgWorkspacePermission({
      admin,
      user,
      workspaceId,
      permission: "view",
    });
    const [profile, assignments] = await Promise.all([
      admin
        .from("company_users")
        .select("email_preferences, linkedin_url")
        .eq("user_id", user.id)
        .single(),
      admin
        .from("company_role_assignees")
        .select("role_id, company_roles!inner(company_workspace_id)")
        .eq("company_user_id", user.id)
        .eq("company_roles.company_workspace_id", workspaceId),
    ]);
    if (profile.error) throw profile.error;
    if (assignments.error) throw assignments.error;
    const payload: OrgPersonalSettings = {
      assignedRoleIds: (assignments.data ?? []).map((row) => row.role_id),
      emailEnabled: companyEmailTopicEnabled(
        profile.data.email_preferences as Record<string, unknown> | null,
        "all_proactive"
      ),
      linkedinUrl: profile.data.linkedin_url ?? null,
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => null);
    // The member's own LinkedIn (account-wide, like the email preference); empty clears it.
    if (body && typeof body.linkedinUrl === "string") {
      let linkedinUrl: string | null;
      try {
        linkedinUrl = normalizeOrgLinkedinUrl(body.linkedinUrl);
      } catch {
        throw new OrgHttpError(400, "LinkedIn 주소를 확인해 주세요.");
      }
      const { error } = await getSupabaseAdmin().from("company_users")
        .update({ linkedin_url: linkedinUrl }).eq("user_id", user.id);
      if (error) throw error;
      return NextResponse.json({ linkedinUrl });
    }
    if (
      !body ||
      typeof body.emailEnabled !== "boolean" ||
      typeof body.workspaceId !== "string" ||
      !body.workspaceId.trim()
    )
      throw new OrgHttpError(400, "workspaceId and emailEnabled are required");
    const result = await updateCompanyEmailPreferences({
      admin: getSupabaseAdmin(),
      user,
      workspaceId: body.workspaceId.trim(),
      input: { scope: "all_proactive", enabled: body.emailEnabled },
    });
    return NextResponse.json({ emailEnabled: result.enabled });
  } catch (error) {
    return toErrorResponse(error);
  }
}
