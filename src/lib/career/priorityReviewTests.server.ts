import { createHash } from "node:crypto";
import {
  buildTalentProfileContext,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
} from "@/lib/talentOnboarding/profileStore";
import {
  executeTalentTool,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { runCareerChatAssistant } from "./llm";
import { resolveCareerChatTools } from "./llmTools";
import { buildCareerConversationPromptPlan } from "./prompts/conversationPlan";
import { resolveCareerTextChatModel } from "./textChatModelConfig";
import { appendCareerOpportunityMentionMetadata } from "./opportunityMentionText";
import { formatTalentMessageContentForLlmPrompt } from "./opportunityFeedbackNote";
import { createPriorityReviewTestSandbox } from "./priorityReviewTestSandbox";
import type {
  PriorityReviewTestCase,
  PriorityReviewTestResult,
  PriorityReviewTestRole,
} from "./priorityReviewTestContract";

const ROLE_SELECT = `role_id, name, description, description_summary, source_type,
  status, is_expired, expires_at, information, external_jd_url, location_text,
  work_mode, type, seniority_level, salary_range, posted_at,
  company_workspace:company_workspace(company_name, published_name,
    company_db:company_db(name, short_description, description, location,
      founded_year, employee_count_range))`;

function roleIsUsable(role: Record<string, any>) {
  const info = role.information;
  return (
    role.source_type === "internal" &&
    role.status === "active" &&
    role.is_expired !== true &&
    (!role.expires_at || Date.parse(role.expires_at) > Date.now()) &&
    info?.testOnly !== true &&
    String(info?.testOnly).toLowerCase() !== "true" &&
    Boolean(role.company_workspace?.published_name)
  );
}

export function priorityReviewTestRoleLabel(
  role: Record<string, any>
): PriorityReviewTestRole {
  return {
    roleId: role.role_id,
    companyName: role.company_workspace.published_name,
    roleTitle: role.name,
  };
}

export async function loadPriorityReviewTestRole(
  admin: TalentAdminClient,
  roleId?: string
) {
  const query = (admin.from("company_roles") as any).select(ROLE_SELECT);
  const { data, error } = roleId
    ? await query.eq("role_id", roleId).limit(1)
    : await query
        .eq("source_type", "internal")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(100);
  if (error) throw new Error(error.message);
  const role = (data ?? []).find(roleIsUsable);
  if (!role)
    throw new Error(
      "응답 테스트에 사용할 공개된 활성 포지션을 찾지 못했습니다."
    );
  // Public company facts only; never fetch the private Hiring Brief.
  role.company_workspace.company_name = role.company_workspace.published_name;
  return role as Record<string, any>;
}

export async function capturePriorityReviewTestInput(args: {
  admin: TalentAdminClient;
  userId: string;
  roleId?: string;
}) {
  const [profile, role] = await Promise.all([
    fetchTalentUserProfile(args),
    loadPriorityReviewTestRole(args.admin, args.roleId),
  ]);
  if (!profile) throw new Error("talent_users 계정을 찾지 못했습니다.");
  const structuredProfile = await fetchTalentStructuredProfile({
    ...args,
    talentUser: profile,
  });
  return {
    userId: args.userId,
    role,
    profile: { current_location: profile.current_location ?? profile.location },
    structuredProfileText: buildTalentProfileContext({
      profile,
      structuredProfile,
      includeRowIds: false,
    }),
  };
}

export type PriorityReviewTestInput = Awaited<
  ReturnType<typeof capturePriorityReviewTestInput>
>;

export async function runPriorityReviewResponseTest(args: {
  fixture: PriorityReviewTestInput;
  caseId: PriorityReviewTestCase;
  message: string;
  model?: unknown;
}): Promise<PriorityReviewTestResult> {
  const startedAt = Date.now();
  const { admin, tables } = createPriorityReviewTestSandbox({
    ...args.fixture,
    caseId: args.caseId,
  });
  const role = priorityReviewTestRoleLabel(args.fixture.role);
  const toolNames = [
    TALENT_TOOL_NAMES.INTERNAL_ROLE_PRIORITY_REVIEW,
    TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
    TALENT_TOOL_NAMES.GET_ROLE_CONTEXT,
  ];
  const selection = resolveCareerChatTools({
    channel: "chat",
    isOnboardingDone: true,
    responseLocale: "ko",
    allowedToolNames: toolNames,
  });
  const plan = buildCareerConversationPromptPlan({
    channel: "chat",
    conversationMode: "default",
    isOnboardingDone: true,
    currentPreferences: { preferredLocale: "ko" },
    profile: args.fixture.profile,
    structuredProfileText: args.fixture.structuredProfileText,
    talentContextSection: "",
    recentRecommendedOpportunitiesText: "",
    timeZone: "Asia/Seoul",
    toolNames: selection.toolNames,
  });
  const message = formatTalentMessageContentForLlmPrompt(
    {
      content: appendCareerOpportunityMentionMetadata(args.message, [
        {
          roleId: role.roleId,
          label: `${role.companyName} · ${role.roleTitle}`,
        },
      ]),
      createdAt: new Date().toISOString(),
      messageType: "chat",
    },
    { includeCreatedAt: true, preferredLocale: "ko", timeZone: "Asia/Seoul" }
  );
  const model = resolveCareerTextChatModel(args.model);
  const trace: PriorityReviewTestResult["trace"] = [];
  const response = await runCareerChatAssistant({
    primaryModel: model.model,
    ...model,
    messages: [{ role: "user", content: message }],
    systemBlocks: plan.promptBlocks,
    tools: selection.tools,
    stopAfterToolNames: selection.stopAfterToolNames,
    responseLocale: "ko",
    usageLabel: "career/dev-priority-review-test",
    async executeTool(call) {
      if (!toolNames.includes(call.name as (typeof toolNames)[number]))
        throw new Error("테스트에 허용되지 않은 도구입니다.");
      // Test authorization boundary: no acceptance, switching or outbound actions.
      if (
        call.name ===
          TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK &&
        (call.input.feedback !== "review" || call.input.replacesRoleId)
      ) {
        throw new Error("이 테스트에서는 추천 카드 검토만 실행할 수 있습니다.");
      }
      if (
        call.name === TALENT_TOOL_NAMES.INTERNAL_ROLE_PRIORITY_REVIEW &&
        call.input.action !== "register"
      ) {
        throw new Error("이 테스트는 우선 검토 등록 응답을 비교합니다.");
      }
      const result = await executeTalentTool({
        ...call,
        channel: "chat",
        logging: false,
        context: { admin, userId: args.fixture.userId, responseLocale: "ko" },
      });
      trace.push({ ...call, result });
      return result;
    },
  });
  return {
    caseId: args.caseId,
    response,
    role,
    model: model.model,
    elapsedMs: Date.now() - startedAt,
    requestCount: tables.talent_progress.filter(
      (row) => row.kind === "candidate_requested_connection"
    ).length,
    recommendationCount: tables.talent_opportunity_recommendation.length,
    trace,
    promptFingerprint: createHash("sha256")
      .update(
        JSON.stringify({
          blocks: plan.promptBlocks,
          message,
          tools: selection.tools,
        })
      )
      .digest("hex"),
  };
}
