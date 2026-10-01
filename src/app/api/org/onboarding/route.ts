import { NextRequest, NextResponse } from "next/server";
import { isOrgLocale } from "@/i18n/org/locale";
import { runOrgAgentChat } from "@/lib/org/agent/chat";
import { buildOrgOnboardingCompanyPrompt } from "@/lib/org/agent/onboardingPrompt";
import { canProvideOrgCompanyContext } from "@/lib/org/onboarding";
import {
  fetchOrgBootstrap,
  OrgHttpError,
  sendOrgWorkspaceInvitations,
} from "@/lib/org/server";
import {
  getSupabaseAdmin,
  requireAuthenticatedUser,
} from "@/lib/server/candidateAccess";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json()) as {
      action?: unknown;
      workspaceId?: unknown;
      message?: unknown;
      responseLocale?: unknown;
      email?: unknown;
    };
    if (typeof body.workspaceId !== "string" || !body.workspaceId.trim()) {
      throw new OrgHttpError(400, "회사를 선택해 주세요.");
    }
    const workspaceId = body.workspaceId.trim();
    const bootstrap = await fetchOrgBootstrap({ orgId: workspaceId, user });
    const member = bootstrap.currentUser;
    // Bootstrap may fall back to another workspace for an inaccessible orgId.
    if (!member || bootstrap.workspace?.workspaceId !== workspaceId) {
      throw new OrgHttpError(403, "이 회사에 접근할 수 없습니다.");
    }
    if (body.action === "complete") {
      if (!member.name?.trim() || !member.role?.trim()) {
        throw new OrgHttpError(400, "이름과 직함을 먼저 입력해 주세요.");
      }
      if (member.onboardingCompletedAt) {
        return NextResponse.json({
          ok: true,
          completedAt: member.onboardingCompletedAt,
        });
      }
      const completedAt = new Date().toISOString();
      const { data, error } = await getSupabaseAdmin()
        .from("company_users")
        .update({ onboarding_completed_at: completedAt })
        .eq("user_id", user.id)
        .is("onboarding_completed_at", null)
        .select("user_id");
      if (error) throw error;
      if (!data?.length) {
        const { data: saved, error: readError } = await getSupabaseAdmin()
          .from("company_users")
          .select("onboarding_completed_at")
          .eq("user_id", user.id)
          .single();
        if (readError || !saved?.onboarding_completed_at)
          throw readError ?? new Error("Completion was not saved");
        return NextResponse.json({
          ok: true,
          completedAt: saved.onboarding_completed_at,
        });
      }
      return NextResponse.json({ ok: true, completedAt });
    }
    if (member.onboardingCompletedAt) {
      throw new OrgHttpError(
        409,
        "온보딩을 이미 완료했어요. 회사 화면에서 이어서 진행해 주세요."
      );
    }
    if (body.action === "invite") {
      if (typeof body.email !== "string")
        throw new OrgHttpError(400, "초대할 이메일을 입력해 주세요.");
      return NextResponse.json(
        await sendOrgWorkspaceInvitations({
          emails: [body.email],
          onboardingAlternateAccount: true,
          role: member.authority,
          siteUrl: getPublicSiteUrlFromRequest(req),
          user,
          workspaceId,
        })
      );
    }
    if (body.action === "company") {
      if (body.responseLocale != null && !isOrgLocale(body.responseLocale)) {
        throw new OrgHttpError(400, "Invalid response locale");
      }
      if (!canProvideOrgCompanyContext(bootstrap.members, member)) {
        throw new OrgHttpError(
          403,
          "첫 번째 팀원만 온보딩에서 회사 정보를 추가할 수 있어요."
        );
      }
      const message =
        typeof body.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 8_000)
        throw new OrgHttpError(
          400,
          "회사에 대한 내용을 8,000자 이내로 입력해 주세요."
        );
      const result = await runOrgAgentChat({
        message,
        responseLocale: isOrgLocale(body.responseLocale) ? body.responseLocale : undefined,
        llmUserMessage: buildOrgOnboardingCompanyPrompt(message),
        userMessageMetadata: { source: "org_onboarding_company" },
        assistantMessageMetadata: { source: "org_onboarding_company" },
        user,
        workspaceId,
      });
      return NextResponse.json({
        ok: true,
        reply:
          result.kind === "message"
            ? result.assistantMessage.content
            : result.presentationText,
      });
    }
    throw new OrgHttpError(400, "지원하지 않는 온보딩 요청입니다.");
  } catch (error) {
    const status =
      error instanceof OrgHttpError
        ? error.status
        : error instanceof Error && error.message === "Unauthorized"
          ? 401
          : 500;
    if (status === 500) console.error("[org/onboarding]", error);
    return NextResponse.json(
      {
        error:
          error instanceof OrgHttpError
            ? error.message
            : status === 401
              ? "로그인이 필요합니다."
              : "요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
      { status }
    );
  }
}
