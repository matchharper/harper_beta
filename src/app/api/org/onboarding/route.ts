import { NextRequest, NextResponse } from "next/server";
import { isOrgLocale } from "@/i18n/org/locale";
import { runOrgAgentChat } from "@/lib/org/agent/chat";
import {
  buildOrgOnboardingCompanyPrompt,
  ORG_ONBOARDING_COMPANY_AGENT_OPTIONS,
} from "@/lib/org/agent/onboardingPrompt";
import { canProvideOrgCompanyContext } from "@/lib/org/onboarding";
import {
  assertOrgWorkspacePermission,
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

type CompanySubmissionStatus =
  | { status: "missing" | "pending" | "failed" }
  | { status: "completed"; reply: string };
type CompanySubmissionResult = CompanySubmissionStatus & {
  submittedMessage?: string;
};

function companySubmissionResponse(result: CompanySubmissionResult) {
  const { submittedMessage: _submittedMessage, ...status } = result;
  return NextResponse.json(
    { ok: true, ...status },
    { status: status.status === "pending" ? 202 : 200 }
  );
}

function validSubmissionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

async function readCompanySubmission(args: {
  submissionId: string;
  userId: string;
  workspaceId: string;
}): Promise<CompanySubmissionResult> {
  const admin = getSupabaseAdmin();
  const metadata = {
    onboardingSubmissionId: args.submissionId,
    source: "org_onboarding_company",
  };
  const { data: submitted, error: submittedError } = await (
    admin.from("company_messages" as any) as any
  )
    .select("id, conversation_id, content")
    .eq("company_workspace_id", args.workspaceId)
    .eq("company_user_id", args.userId)
    .eq("role", "user")
    .contains("metadata", metadata)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (submittedError) throw submittedError;
  if (!submitted) return { status: "missing" };

  const { data: terminal, error: terminalError } = await (
    admin.from("company_messages" as any) as any
  )
    .select("content, status")
    .eq("company_workspace_id", args.workspaceId)
    .eq("conversation_id", submitted.conversation_id)
    .eq("role", "assistant")
    .contains("metadata", {
      ...metadata,
      agentTurn: { phase: "terminal" },
    })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (terminalError) throw terminalError;
  if (terminal) {
    return {
      status: "completed",
      reply: terminal.content,
      submittedMessage: submitted.content,
    };
  }
  const { data: failed, error: failedError } = await (
    admin.from("company_messages" as any) as any
  )
    .select("id")
    .eq("company_workspace_id", args.workspaceId)
    .eq("conversation_id", submitted.conversation_id)
    .eq("role", "assistant")
    .eq("status", "failed")
    .contains("metadata", metadata)
    .limit(1)
    .maybeSingle();
  if (failedError) throw failedError;
  if (failed) {
    return { status: "failed", submittedMessage: submitted.content };
  }
  return {
    status: "pending",
    submittedMessage: submitted.content,
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const workspaceId = req.nextUrl.searchParams.get("workspaceId")?.trim();
    const submissionId = req.nextUrl.searchParams.get("submissionId");
    if (!workspaceId || !validSubmissionId(submissionId)) {
      throw new OrgHttpError(400, "Invalid onboarding submission");
    }
    await assertOrgWorkspacePermission({
      admin: getSupabaseAdmin(),
      permission: "view",
      user,
      workspaceId,
    });
    return companySubmissionResponse(
      await readCompanySubmission({
        submissionId,
        userId: user.id,
        workspaceId,
      })
    );
  } catch (error) {
    const status =
      error instanceof OrgHttpError
        ? error.status
        : error instanceof Error && error.message === "Unauthorized"
          ? 401
          : 500;
    if (status === 500) console.error("[org/onboarding:status]", error);
    return NextResponse.json(
      {
        error:
          error instanceof OrgHttpError
            ? error.message
            : status === 401
              ? "로그인이 필요합니다."
              : "요청 상태를 확인하지 못했어요.",
      },
      { status }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json()) as {
      action?: unknown;
      workspaceId?: unknown;
      message?: unknown;
      submissionId?: unknown;
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
      const signup = bootstrap.workspace?.signupState;
      if (signup && (!signup.companyConfirmedAt || !signup.planSelectedAt)) {
        throw new OrgHttpError(409, "signup_setup_required");
      }
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
    if (
      member.onboardingCompletedAt &&
      body.action === "company" &&
      validSubmissionId(body.submissionId)
    ) {
      const existing = await readCompanySubmission({
        submissionId: body.submissionId,
        userId: user.id,
        workspaceId,
      });
      if (existing.status !== "missing") {
        const message =
          typeof body.message === "string" ? body.message.trim() : "";
        if (existing.submittedMessage !== message) {
          throw new OrgHttpError(
            409,
            "이미 다른 회사 정보에 사용된 요청입니다."
          );
        }
        return companySubmissionResponse(existing);
      }
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
      const submissionId = body.submissionId;
      if (submissionId != null && !validSubmissionId(submissionId)) {
        throw new OrgHttpError(400, "Invalid onboarding submission");
      }
      if (submissionId) {
        const existing = await readCompanySubmission({
          submissionId,
          userId: user.id,
          workspaceId,
        });
        if (
          existing.submittedMessage !== undefined &&
          existing.submittedMessage !== message
        ) {
          throw new OrgHttpError(
            409,
            "이미 다른 회사 정보에 사용된 요청입니다."
          );
        }
        if (existing.status !== "missing") {
          return companySubmissionResponse(existing);
        }
      }
      let result: Awaited<ReturnType<typeof runOrgAgentChat>>;
      try {
        result = await runOrgAgentChat({
          message,
          ...ORG_ONBOARDING_COMPANY_AGENT_OPTIONS,
          responseLocale: isOrgLocale(body.responseLocale)
            ? body.responseLocale
            : undefined,
          llmUserMessage: buildOrgOnboardingCompanyPrompt(message),
          userMessageMetadata: {
            source: "org_onboarding_company",
            ...(submissionId ? { onboardingSubmissionId: submissionId } : {}),
          },
          assistantMessageMetadata: {
            source: "org_onboarding_company",
            ...(submissionId ? { onboardingSubmissionId: submissionId } : {}),
          },
          ...(submissionId ? { turnRunId: submissionId } : {}),
          user,
          workspaceId,
        });
      } catch (error) {
        // The unique user-message index means a concurrent retry has already
        // claimed this submission. Read its result instead of running it twice.
        if (submissionId && (error as { code?: string }).code === "23505") {
          const existing = await readCompanySubmission({
            submissionId,
            userId: user.id,
            workspaceId,
          });
          if (existing.status !== "missing") {
            if (existing.submittedMessage !== message) {
              throw new OrgHttpError(
                409,
                "이미 다른 회사 정보에 사용된 요청입니다."
              );
            }
            return companySubmissionResponse(existing);
          }
        }
        throw error;
      }
      return NextResponse.json({
        ok: true,
        status:
          result.kind === "message" &&
          result.assistantMessage.status === "failed"
            ? "failed"
            : "completed",
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
