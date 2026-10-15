import { after, NextRequest, NextResponse } from "next/server";
import { COMPANY_SELF_SERVE_SIGNUP_ENABLED } from "@/lib/org/billing/rollout";
import {
  canUseSignupWorkspace,
  isAdditionalOrgCreator,
  type WorkspaceSignupState,
} from "@/lib/org/signup";
import {
  requireAuthenticatedUser,
  getSupabaseAdmin,
} from "@/lib/server/candidateAccess";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import {
  companyInput,
  runSignupResearch,
  signupEntry,
  signupRpc,
} from "@/lib/org/signupServer";

export const maxDuration = 90;
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status =
    message === "Unauthorized"
      ? 401
      : message === "signup_forbidden" ||
          (error instanceof OrgHttpError && error.status === 403)
        ? 403
        : message.startsWith("signup_") && message !== "signup_unavailable"
          ? 409
          : 503;
  return NextResponse.json(
    {
      error:
        status === 401
          ? "Unauthorized"
          : status === 403
            ? "signup_forbidden"
            : message.startsWith("signup_")
              ? message
              : "signup_unavailable",
    },
    { status }
  );
}
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const id = req.nextUrl.searchParams.get("workspaceId");
    if (!id) {
      if (!COMPANY_SELF_SERVE_SIGNUP_ENABLED)
        throw new Error("signup_forbidden");
      return NextResponse.json(await signupEntry(user));
    }
    const admin = getSupabaseAdmin();
    await assertOrgWorkspacePermission({
      admin,
      user,
      workspaceId: id,
      permission: "view",
    });
    const { data, error } = await admin
      .from("company_workspace")
      .select("signup_state,company_name,company_description,linkedin_url")
      .eq("company_workspace_id", id)
      .single();
    if (error) throw error;
    const signupState = data.signup_state as WorkspaceSignupState | null;
    if (
      !canUseSignupWorkspace(
        signupState,
        user.id,
        COMPANY_SELF_SERVE_SIGNUP_ENABLED
      )
    )
      throw new Error("signup_forbidden");
    const research = await admin
      .from("company_data")
      .select("source_payload")
      .eq("company_workspace_id", id)
      .maybeSingle();
    if (research.error) throw research.error;
    const payload = research.data?.source_payload as any;
    return NextResponse.json({
      state: data.signup_state,
      company: signupState?.companyConfirmedAt
        ? {
            name: data.company_name,
            description: data.company_description || "",
            linkedinUrl: data.linkedin_url || "",
            sources: [],
          }
        : (payload?.signupResearch ?? null),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();
    if (body.action === "begin") {
      if (!COMPANY_SELF_SERVE_SIGNUP_ENABLED)
        throw new Error("signup_forbidden");
      const result = await signupEntry(user, true);
      if (result.status === "created" && result.workspaceId)
        after(() => runSignupResearch(user.id, result.workspaceId!));
      return NextResponse.json(result);
    }
    const id = body.workspaceId;
    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
    )
      throw new Error("signup_forbidden");
    const admin = getSupabaseAdmin();
    const authority = await assertOrgWorkspacePermission({
      admin,
      user,
      workspaceId: id,
      permission: "manage_workspace",
    });
    const { data: workspace, error: workspaceError } = await admin
      .from("company_workspace")
      .select("signup_state")
      .eq("company_workspace_id", id)
      .single();
    const signupState = workspace?.signup_state as WorkspaceSignupState | null;
    if (
      workspaceError ||
      authority !== "owner" ||
      !canUseSignupWorkspace(
        signupState,
        user.id,
        COMPANY_SELF_SERVE_SIGNUP_ENABLED
      )
    )
      throw new Error("signup_forbidden");
    if (
      body.action === "plan" &&
      isAdditionalOrgCreator(signupState, user.id)
    )
      throw new Error("signup_forbidden");
    // The RPC also checks creator ownership under a row lock for every mutation.
    if (body.action === "research") {
      after(() => runSignupResearch(user.id, id));
      return NextResponse.json({ ok: true });
    }
    if (!["company", "plan"].includes(body.action))
      throw new Error("signup_invalid_action");
    const values =
      body.action === "company" ? companyInput(body) : { plan: body.plan };
    return NextResponse.json(
      await signupRpc("workspace_signup_update_v1", {
        p_user: user.id,
        p_workspace: id,
        p_action: body.action,
        p_values: values,
      })
    );
  } catch (error) {
    return failure(error);
  }
}
