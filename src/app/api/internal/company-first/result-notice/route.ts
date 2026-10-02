import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildCompanyMatchingResultContext } from "@/lib/companyFirstSearch/resultContext";
import {
  DEFAULT_INTRO_SEARCH_DAYS,
  DEFAULT_INTRO_SEARCH_HOUR,
  parseIntroSearchDays,
  parseIntroSearchHour,
} from "@/lib/org/introSearchSchedule";
import {
  InternalApiError,
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { generateOrgAgentBackgroundResultReply } from "@/lib/org/agent/chat";
import {
  ensureOrgRoleCreationConversation,
  insertOrgAgentMessage,
  type OrgAgentConversationRow,
} from "@/lib/org/agent/store";
import type { OrgAgentMessageMetadata } from "@/lib/org/agent/types";
import {
  convertMarkdownLinksToSlackMrkdwn,
  getOrgPublicSiteUrl,
} from "@/lib/org/slackMessages";
import { renderSlackOrgLinks } from "@/lib/org/slackTalentLinks";
import { sendHarperWorkspaceSlackMessage } from "@/lib/org/slackHarper";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getOrgWorkspaceLocale } from "@/lib/org/workspaceLocale.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, maxLength = 4_000) {
  return String(value ?? "")
    .replaceAll("\u0000", "")
    .trim()
    .slice(0, maxLength);
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function roleSalary(row: Record<string, any>) {
  const explicit = text(row.salary_range, 300);
  if (explicit) return explicit;
  const bounds = [row.salary_min, row.salary_max]
    .filter(
      (value) => value !== null && value !== undefined && text(value, 50) !== ""
    )
    .map((value) => text(value, 50));
  if (!bounds.length) return null;
  return `${bounds.join(" ~ ")}${text(row.salary_currency, 20) ? ` ${text(row.salary_currency, 20)}` : ""}${text(row.salary_period, 40) ? ` / ${text(row.salary_period, 40)}` : ""}`;
}

async function hasPriorDeliveredCompanyFirstResult(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  workspaceId: string;
}) {
  const [outbox, messages] = await Promise.all([
    (args.admin.from("company_first_slack_outbox" as any) as any)
      .select("id")
      .eq("company_workspace_id", args.workspaceId)
      .eq("status", "sent")
      .limit(1),
    (args.admin.from("company_messages" as any) as any)
      .select("id")
      .eq("company_workspace_id", args.workspaceId)
      .eq("role", "assistant")
      .in("metadata->>source", [
        "company_matching_search_result",
        "company_first_candidate_result",
      ])
      .limit(1),
  ]);
  if (outbox.error) throw outbox.error;
  if (messages.error) throw messages.error;
  return Boolean(outbox.data?.length || messages.data?.length);
}

function candidateProfileUrl(args: {
  roleId: string;
  talentId: string;
  workspaceId: string;
}) {
  const params = new URLSearchParams({
    detailRoleId: args.roleId,
    detailWorkspaceId: args.workspaceId,
    orgId: args.workspaceId,
    roleId: args.roleId,
    source: "company_matching_result",
    tab: "pipeline",
    talentId: args.talentId,
    view: "pipeline",
  });
  return `${getOrgPublicSiteUrl()}/org/role?${params.toString()}`;
}

async function workspaceUser(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  workspaceId: string;
}) {
  const { data: membership, error: membershipError } = await (
    args.admin.from("company_user_workspace" as any) as any
  )
    .select("company_user_id")
    .eq("company_workspace_id", args.workspaceId)
    .in("authority", ["owner", "admin", "member"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  const userId = text(membership?.company_user_id, 100);
  if (!userId)
    throw new Error("Company workspace has no member for result delivery");
  const { data, error } = await args.admin.auth.admin.getUserById(userId);
  if (error) throw error;
  if (!data.user) throw new Error("Company workspace member user not found");
  return data.user as User;
}

async function updateNoticeFailure(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  error: unknown;
  result: Record<string, any>;
  runId: string;
}) {
  const current = record(args.result.companyNotice);
  const attempt = Math.max(1, Number(current.attemptCount ?? 1));
  const retryMinutes = Math.min(60, 2 ** Math.min(6, attempt));
  await (args.admin.from("company_first_search_runs" as any) as any)
    .update({
      result: {
        ...args.result,
        companyNotice: {
          ...current,
          attemptCount: attempt,
          availableAt: new Date(
            Date.now() + retryMinutes * 60_000
          ).toISOString(),
          error: text(
            args.error instanceof Error ? args.error.message : args.error,
            2_000
          ),
          status: "failed",
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.runId);
}

export async function POST(req: NextRequest) {
  let admin: ReturnType<typeof getSupabaseAdmin> | null = null;
  let runId = "";
  let runResult: Record<string, any> = {};
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as { runId?: unknown };
    runId = text(body.runId, 100);
    if (!runId) throw new InternalApiError(400, "runId is required");

    admin = getSupabaseAdmin();
    const { data: run, error: runError } = await (
      admin.from("company_first_search_runs" as any) as any
    )
      .select(
        "id, company_workspace_id, requested_role_ids, result, scheduled_slot, status, trigger_reason, workspace:company_workspace(company_name)"
      )
      .eq("id", runId)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) throw new InternalApiError(404, "Company search run not found");
    if (
      run.trigger_reason !== "company_requested" ||
      !["succeeded", "skipped", "failed"].includes(text(run.status, 40))
    ) {
      throw new InternalApiError(
        409,
        "Run is not ready for a company result notice"
      );
    }

    runResult = record(run.result);
    const existingNotice = record(runResult.companyNotice);
    const workspaceId = text(run.company_workspace_id, 100);
    const roleIds = Array.from(
      new Set(
        (Array.isArray(run.requested_role_ids) ? run.requested_role_ids : [])
          .map((value: unknown) => text(value, 100))
          .filter(Boolean)
      )
    );
    if (!workspaceId || roleIds.length === 0) {
      throw new InternalApiError(
        409,
        "Run is missing its requested Role scope"
      );
    }

    const [
      { data: roles, error: rolesError },
      { data: intros, error: introsError },
    ] = await Promise.all([
      (admin.from("company_roles" as any) as any)
        .select(
          "role_id, name, salary_range, salary_min, salary_max, salary_currency, salary_period, internal_role:company_internal_roles(is_company_first_search, intro_search_date, intro_search_time, request)"
        )
        .eq("company_workspace_id", workspaceId)
        .in("role_id", roleIds),
      (admin.from("company_intro_candidates" as any) as any)
        .select(
          "id, role_id, talent_id, selection_reason, presentation, role:company_roles(name)"
        )
        .eq("company_workspace_id", workspaceId)
        .eq("selection_run_id", runId),
    ]);
    if (rolesError) throw rolesError;
    if (introsError) throw introsError;
    const roleRows = (roles ?? [])
      .map((row: any) => {
        const internalRole = Array.isArray(row.internal_role)
          ? row.internal_role[0]
          : row.internal_role;
        return {
          automaticSearchEnabled:
            internalRole?.is_company_first_search === true,
          introSearchDate:
            parseIntroSearchDays(internalRole?.intro_search_date) ??
            DEFAULT_INTRO_SEARCH_DAYS,
          introSearchTime:
            parseIntroSearchHour(internalRole?.intro_search_time) ??
            DEFAULT_INTRO_SEARCH_HOUR,
          id: text(row.role_id, 100),
          name: text(row.name, 300) || "이름 없는 Role",
          request: text(internalRole?.request, 2_000) || null,
          salary: roleSalary(row),
        };
      })
      .sort(
        (left: { id: string }, right: { id: string }) =>
          roleIds.indexOf(left.id) - roleIds.indexOf(right.id)
      );
    if (roleRows.length === 0) {
      throw new InternalApiError(404, "Requested Role not found");
    }
    const roleNameById = new Map<string, string>(
      roleRows.map((role: { id: string; name: string }) => [role.id, role.name])
    );
    const candidates = (intros ?? []).map((row: any) => {
      const presentation = record(row.presentation);
      const role = Array.isArray(row.role) ? row.role[0] : row.role;
      const roleId = text(row.role_id, 100);
      return {
        headline: text(presentation.headline, 500) || null,
        name: text(presentation.name, 300) || "이름 비공개",
        profileUrl: candidateProfileUrl({
          roleId,
          talentId: text(row.talent_id, 100),
          workspaceId,
        }),
        reason: text(row.selection_reason, 2_000),
        roleId,
        roleName: text(role?.name, 300) || roleNameById.get(roleId) || "Role",
        summary: text(presentation.summary, 2_000) || null,
        talentId: text(row.talent_id, 100),
      };
    });
    const workspace = Array.isArray(run.workspace)
      ? run.workspace[0]
      : run.workspace;
    const companyName = text(workspace?.company_name, 300) || "현재 회사";
    const primaryRoleId = roleRows[0]!.id;
    const idempotencyKey = `company_matching_result:${runId}`;
    const metadata = {
      companyMatchingSearchResult: { idempotencyKey, runId },
      source: "company_matching_search_result",
    } satisfies OrgAgentMessageMetadata;

    const { data: existingMessage, error: existingMessageError } = await (
      admin.from("company_messages" as any) as any
    )
      .select("id, content, model")
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", primaryRoleId)
      .eq("role", "assistant")
      .contains("metadata", { companyMatchingSearchResult: { runId } })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingMessageError) throw existingMessageError;

    const user = await workspaceUser({ admin, workspaceId });
    const { data: storedConversation, error: conversationError } = await (
      admin.from("company_conversations" as any) as any
    )
      .select(
        "id, company_workspace_id, role_id, title, last_message_at, last_message_id, summary_cursor_message_id, metadata, created_at, updated_at"
      )
      .eq("company_workspace_id", workspaceId)
      .eq("role_id", primaryRoleId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    const conversation = storedConversation
      ? (storedConversation as OrgAgentConversationRow)
      : (
          await ensureOrgRoleCreationConversation({
            allowCompletedRole: true,
            roleId: primaryRoleId,
            user,
            workspaceId,
          })
        ).conversation;
    let message = text(existingMessage?.content, 12_000);
    let model = text(existingMessage?.model, 200) || null;
    let companyMessageId = Number(existingMessage?.id) || null;
    if (!message) {
      const firstCompanyFirstResultDelivery =
        run.status === "succeeded" &&
        !(await hasPriorDeliveredCompanyFirstResult({ admin, workspaceId }));
      const firstResultContext = buildCompanyMatchingResultContext({
        candidates,
        firstDelivery: firstCompanyFirstResultDelivery,
        roles: roleRows,
        runStatus: text(run.status, 40),
      });
      const scheduledSlot = text(run.scheduled_slot, 100);
      const recentQuery = (admin.from("company_messages" as any) as any)
        .select("id, role, content")
        .eq("conversation_id", conversation.id)
        .eq("message_type", "chat")
        .eq("role", "user")
        .order("id", { ascending: false })
        .limit(1);
      const { data: recentRows, error: recentError } = await (scheduledSlot
        ? recentQuery.lte("created_at", scheduledSlot)
        : recentQuery);
      if (recentError) throw recentError;
      const conversationMessages = (recentRows ?? [])
        .toReversed()
        .map((row: any) => ({
          content: text(row.content, 4_000),
          role:
            row.role === "user" ? ("user" as const) : ("assistant" as const),
        }))
        .filter((row: { content: string }) => Boolean(row.content));
      const requestMessage = conversationMessages[0]?.content || "";
      const generated = await generateOrgAgentBackgroundResultReply({
        companyName,
        firstCompanyFirstResultDelivery,
        responseLocale: await getOrgWorkspaceLocale(workspaceId, admin),
        resultText: firstResultContext,
        roleId: primaryRoleId,
        roleName: roleNameById.get(primaryRoleId) || "현재 채용",
        surface: "chat",
        userMessage:
          requestMessage ||
          `이 채용에 관해 앞서 부탁한 확인 결과를 알려주세요.`,
      });
      message = generated.reply;
      model = text(generated.model, 200) || null;
      const stored = await insertOrgAgentMessage({
        admin,
        content: message,
        conversation,
        messageType: "chat",
        metadata,
        model,
        role: "assistant",
        roleId: primaryRoleId,
        userId: null,
      });
      companyMessageId = stored.id;
    }

    let slackStatus = text(existingNotice.slackStatus, 40) || "pending";
    let slackMessageTs = text(existingNotice.slackMessageTs, 100) || null;
    if (slackStatus !== "sent" && slackStatus !== "not_configured") {
      const receipts: Array<{ slackMessageTs: string }> = [];
      const slackText = convertMarkdownLinksToSlackMrkdwn(
        renderSlackOrgLinks({
          message,
          publicSiteUrl: getOrgPublicSiteUrl(),
          roleTargets: roleRows.map((role: { id: string }) => ({
            roleId: role.id,
          })),
          talentTargets: candidates.map(
            (candidate: { profileUrl: string; talentId: string }) => ({
              profileUrl: candidate.profileUrl,
              talentId: candidate.talentId,
            })
          ),
          workspaceId,
        })
      );
      const delivered = await sendHarperWorkspaceSlackMessage({
        idempotencyKey,
        messageMetadata: metadata,
        onPosted: (receipt) => receipts.push(receipt),
        recordConversationMessage: false,
        roleId: primaryRoleId,
        text: slackText,
        unfurlLinks: false,
        unfurlMedia: false,
        workspaceId,
      });
      slackStatus = delivered ? "sent" : "not_configured";
      slackMessageTs = receipts[0]?.slackMessageTs || slackMessageTs;
    }

    const notice = {
      attemptCount: Math.max(1, Number(existingNotice.attemptCount ?? 1)),
      companyMessageId,
      deliveredAt: new Date().toISOString(),
      model,
      slackMessageTs,
      slackStatus,
      status: slackStatus === "sent" ? "sent" : "not_configured",
    };
    const { error: updateError } = await (
      admin.from("company_first_search_runs" as any) as any
    )
      .update({
        result: { ...runResult, companyNotice: notice },
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (updateError) throw updateError;

    return NextResponse.json({ message, notice, ok: true });
  } catch (error) {
    if (admin && runId) {
      try {
        await updateNoticeFailure({ admin, error, result: runResult, runId });
      } catch (noticeError) {
        console.error(
          "[company-first/result-notice:failure-state]",
          noticeError
        );
      }
    }
    return toInternalApiErrorResponse(
      error,
      "Failed to deliver Company-first result notice"
    );
  }
}
