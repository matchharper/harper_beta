import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { buildCareerConversationPromptPlan } from "@/lib/career/prompts";
import * as messageProjection from "@/lib/career/opportunityFeedbackNote";
import * as textChatModel from "@/lib/career/textChatModelConfig";
import * as textSanitization from "@/lib/textSanitization";
import * as settings from "@/lib/talentOnboarding/recommendationSettings";
import { CareerCapabilityRuntime } from "@/lib/career/capabilities/runtime";
import {
  formatCareerReengagementOpportunities,
  REENGAGEMENT_OPPORTUNITY_PRELOAD,
  type ReengagementOpportunitySnapshot,
} from "@/lib/career/reengagementOpportunities";
import type { runCareerChatAssistant } from "@/lib/career/llm";

/** Execute the actual chatTurn input assembly with synthetic reads. Stop before
 * the model boundary: no database, selector, tools, persistence or delivery runs.
 */
export async function captureReengagementTurnInput(fixture: {
  recentMessages: any[];
  structuredProfileText: string;
  currentPreferences: any;
  proactiveContext: string;
  recentRecommendedOpportunitiesText?: string;
  talentContextSection?: string;
  timeZone?: string;
  opportunitySnapshot?: ReengagementOpportunitySnapshot;
  assistantModel?: string;
  isOnboardingDone?: boolean;
  onTextDelta?: (delta: string) => void;
}) {
  const toolPolicy = fixture.opportunitySnapshot
    ? await import("@/lib/career/llmTools")
    : null;
  const stop = new Error("Captured the model boundary");
  let captured: Parameters<typeof runCareerChatAssistant>[0] | undefined;
  const conversation = {
    id: "synthetic-conversation",
    user_id: "synthetic-user",
    stage: "completed",
  };
  const query: any = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: conversation, error: null }),
  };
  const known: Record<string, any> = {
    ...messageProjection,
    ...textChatModel,
    ...textSanitization,
    ...settings,
    buildCareerConversationPromptPlan,
    REENGAGEMENT_OPPORTUNITY_PRELOAD,
    readCareerReengagementOpportunities: async () =>
      fixture.opportunitySnapshot
        ? formatCareerReengagementOpportunities(fixture.opportunitySnapshot)
        : "",
    readCareerCapabilityCoaching: async () => null,
    prepareCareerAgentTurn: async (args: any) => ({
      runtime: new CareerCapabilityRuntime({
        mode: args.mode,
        eligibleTools: args.eligibleTools,
        promptArgs: () => args.promptArgs,
        selection: args.selectionSnapshot,
        continuation: args.continuation,
      }),
      release: async () => {},
    }),
    runCareerChatAssistant: async (args: typeof captured) => {
      captured = args;
      throw stop;
    },
    runCareerChatAssistantStream: async (args: typeof captured & { onTextDelta: (delta: string) => void }) => {
      captured = args;
      args.onTextDelta("stream boundary");
      throw stop;
    },
    throwIfToolControlError: (error: unknown) => {
      if (error === stop) throw error;
    },
    getActiveOpportunityRun: async () => null,
    fetchTalentUserProfile: async () => null,
    fetchRecentMessages: async () => fixture.recentMessages,
    buildTalentMemoryRetrievalQuery: () => "",
    fetchTalentContextPromptSnapshot: async () => ({ allBriefs: [] }),
    fetchTalentSetting: async () => ({
      is_onboarding_done: fixture.isOnboardingDone ?? true,
      preferred_locale: fixture.currentPreferences.preferredLocale,
      profile_visibility: fixture.currentPreferences.profileVisibility,
      get_external_recommendation:
        fixture.currentPreferences.getExternalRecommendation,
      periodic_interval_days: fixture.currentPreferences.periodicIntervalDays,
      recommendation_batch_size:
        fixture.currentPreferences.recommendationBatchSize,
      status: fixture.currentPreferences.talentSettingStatus,
    }),
    getCareerOnboardingChecklistCoverage: async () => null,
    fetchLatestTalentActivityEvent: async () => null,
    fetchCareerPostOnboardingContext: async () => null,
    fetchPendingOpportunityFeedbackPromptContext: async () => "",
    fetchRecentTalentActivitySummaries: async () => [],
    fetchRecentRecommendedOpportunitiesForPrompt: async () => [],
    fetchActiveTalentGmailIntegration: async () => null,
    hasActiveConversationCompletedOpportunityRun: async () => false,
    fetchTalentStructuredProfile: async () => ({}),
    buildTalentProfileContext: () => fixture.structuredProfileText,
    formatRecentRecommendedOpportunitiesForPrompt: () =>
      fixture.recentRecommendedOpportunitiesText ?? "",
    projectBriefsToLegacyInsights: () => "",
    renderTalentContextPrompt: () => fixture.talentContextSection ?? "",
    fetchTalentCompanyContactContext: async () => null,
    getCareerCapabilityMode: () => "progressive",
    isCareerCapabilityTurn: () => Boolean(fixture.opportunitySnapshot),
    countUserChatTurns: async () =>
      fixture.recentMessages.filter((message) => message.role === "user")
        .length,
    fetchRecentMessagesWithSummary: async () => fixture.recentMessages,
    resolveCareerChatTools: fixture.opportunitySnapshot
      ? toolPolicy!.resolveCareerChatTools
      : () => ({
          tools: [],
          toolNames: [],
          stopAfterToolNames: [],
        }),
    serializeOpportunityRun: () => null,
    createCareerFormPresenter: () => ({ hasPending: () => false }),
    TALENT_INTERVIEW_FINAL_STEP: 10,
    TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE:
      "onboarding_completion_notice",
    TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP:
      "onboarding_completion_wrapup",
  };
  const require = createRequire(import.meta.url);
  const filename = require.resolve("../../src/lib/career/chatTurn.ts");
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiledModule = { exports: {} as any };
  vm.runInNewContext(
    compiled,
    {
      module: compiledModule,
      exports: compiledModule.exports,
      console,
      Date,
      Map,
      Set,
      require: () =>
        new Proxy(
          {},
          {
            get: (_, name) => {
              if (name in known) return known[String(name)];
              return () => {
                throw new Error(
                  `Unexpected harness dependency: ${String(name)}`
                );
              };
            },
          }
        ),
    },
    { filename }
  );
  try {
    await compiledModule.exports.runCareerChatTurn({
      admin: { from: () => query },
      conversationId: conversation.id,
      userId: conversation.user_id,
      textChatModel: textChatModel.DEFAULT_CAREER_TEXT_CHAT_MODEL,
      ...(fixture.assistantModel
        ? { assistantModel: fixture.assistantModel }
        : {}),
      assistantMessagePayload: { kind: "session_reengagement" },
      assistantTemperature: 0.8,
      onTextDelta: fixture.onTextDelta,
      proactiveContext: fixture.proactiveContext,
      timeZone: fixture.timeZone ?? "Asia/Seoul",
      ...(fixture.opportunitySnapshot ? {} : { allowedToolNames: [] }),
      noMessageMarker: "__NO_SESSION_GREETING__",
      skipConversationWrites: true,
      scheduleAfter: () => {
        throw new Error("Unexpected background scheduling");
      },
      usageLabel: "career/chat:session_reengagement",
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  if (!captured) throw new Error("chatTurn did not reach the model boundary");
  return captured;
}
