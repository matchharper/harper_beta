import { after, NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  countUserChatTurns,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistCoverage,
  getOnboardingChecklistCoverageStats,
  getTalentSupabaseAdmin,
  normalizeTalentInsightContent,
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import { buildCareerInsightExtractionOnlyPrompt } from "@/lib/career/prompts";
import {
  completeOnboardingAndQueueInitialOpportunityRun,
  getActiveOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import { extractAndPersistChatInsights } from "@/lib/talentOnboarding/chatInsights";
import { maybeSummarizeTalentConversation } from "@/lib/talentOnboarding/conversationSummary";
import { createOnboardingCompletionMessages } from "@/lib/talentOnboarding/onboardingCompletionWrapup";
import {
  hasTalentOnboardingCompletionMarker,
  resolveTalentOnboardingCompletion,
  stripTalentOnboardingCompletionMarker,
} from "@/lib/talentOnboarding/completion";
import { getCareerConversationStarter } from "@/lib/career/prompts/conversationStarters";
import { getCareerRealtimeToolCandidates } from "@/lib/career/llmTools";
import { buildCareerRealtimeSessionInstructions } from "@/lib/career/realtimeInstructions";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";
import { careerT } from "@/lib/career/translatedCareerMessage";
import {
  sanitizeSingleLineDbText,
  stripPostgresUnsafeChars,
} from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";

type Body = {
  assistantEndedOnboarding?: boolean;
  conversationStarterId?: string | null;
  conversationId: string;
  internalCallRequestId?: string | null;
  locale?: string | null;
  userMessage?: string;
  assistantMessage?: string;
  isCallMode?: boolean;
};

const toResponseMessage = toTalentMessageResponse;

function startOpportunityDiscoveryInBackground(runId: string) {
  console.info("[opportunity-discovery] queued for harper_worker", {
    runId,
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const isMobile = isMobileRequest(req);
    const conversationId = sanitizeSingleLineDbText(body.conversationId, 80);
    const conversationStarterId =
      typeof body.conversationStarterId === "string"
        ? (sanitizeSingleLineDbText(body.conversationStarterId, 120) ?? "")
        : "";
    const internalCallRequestId =
      typeof body.internalCallRequestId === "string"
        ? (sanitizeSingleLineDbText(body.internalCallRequestId, 120) ?? "")
        : "";
    const userMessageText =
      typeof body.userMessage === "string"
        ? stripPostgresUnsafeChars(body.userMessage).trim()
        : "";
    const assistantMessageTextWithMarkers =
      typeof body.assistantMessage === "string"
        ? stripPostgresUnsafeChars(body.assistantMessage).trim()
        : "";
    const assistantMessageText = stripTalentOnboardingCompletionMarker(
      assistantMessageTextWithMarkers
    ).trim();
    const isCallMode = Boolean(body.isCallMode);
    const assistantEndedOnboarding =
      Boolean(assistantMessageText) &&
      (Boolean(body.assistantEndedOnboarding) ||
        hasTalentOnboardingCompletionMarker(assistantMessageTextWithMarkers));
    const messageType = isCallMode ? "call_transcript" : "chat";

    if (!conversationId || (!userMessageText && !assistantMessageText)) {
      return NextResponse.json(
        {
          error: "conversationId and at least one message are required",
        },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();

    // Verify conversation ownership
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const [currentInsights, talentSetting, profile] = await Promise.all([
      fetchTalentInsights({
        admin,
        userId: user.id,
      }),
      fetchTalentSetting({
        admin,
        userId: user.id,
      }),
      fetchTalentUserProfile({
        admin,
        userId: user.id,
      }),
    ]);
    const currentInsightContent = (currentInsights?.content ?? null) as Record<
      string,
      string
    > | null;
    const shouldAutoExtractInsights =
      !Boolean(talentSetting?.is_onboarding_done) &&
      Boolean(userMessageText) &&
      Boolean(assistantMessageText);
    let responseTalentInsights = normalizeTalentInsightContent(
      currentInsights?.content ?? null
    );
    let responseInsightUpdatedAt = currentInsights?.last_updated_at ?? null;
    const responseLocale =
      talentSetting?.preferred_locale ??
      body.locale ??
      req.cookies.get("NEXT_LOCALE")?.value;
    const conversationStarter = conversationStarterId
      ? getCareerConversationStarter(conversationStarterId, responseLocale)
      : null;
    const skipConversationWrites = Boolean(conversationStarter);
    if (conversationStarterId && !conversationStarter) {
      return NextResponse.json(
        { error: "Invalid conversationStarterId" },
        { status: 400 }
      );
    }

    const runInsightExtraction = async () => {
      if (!shouldAutoExtractInsights) return 0;

      const changedCount = await extractAndPersistChatInsights({
        admin,
        assistantContent: assistantMessageText,
        buildPrompt: (promptArgs) =>
          buildCareerInsightExtractionOnlyPrompt({
            currentChecklistCoverage: promptArgs.currentChecklistCoverage,
            currentInsightContent: promptArgs.currentInsightContent,
            onboardingChecklistContext: promptArgs.onboardingChecklistContext,
            preferredLocale: responseLocale,
          }),
        conversationId,
        currentInsightContent,
        logPrefix: "ChatSave",
        onboardingChecklistContext: profile,
        sourceChannel: isCallMode ? "voice_call" : "text_chat",
        userId: user.id,
      });
      if (changedCount > 0) {
        const latestInsights = await fetchTalentInsights({
          admin,
          userId: user.id,
        });
        responseTalentInsights = normalizeTalentInsightContent(
          latestInsights?.content ?? null
        );
        responseInsightUpdatedAt = latestInsights?.last_updated_at ?? null;
      }

      return changedCount;
    };

    const scheduleInsightExtraction = () => {
      if (!shouldAutoExtractInsights) return;

      const runBackgroundInsightExtraction = async () => {
        try {
          await runInsightExtraction();
        } catch (error) {
          console.error("[ChatSave] Failed to extract insights", {
            conversationId,
            error: error instanceof Error ? error.message : String(error),
            userId: user.id,
          });
        }
      };

      try {
        after(runBackgroundInsightExtraction);
      } catch {
        void runBackgroundInsightExtraction();
      }
    };

    const activeRun = await getActiveOpportunityRun({
      admin,
      conversationId,
      userId: user.id,
    });
    if (activeRun) {
      return NextResponse.json(
        {
          error: careerT(
            responseLocale,
            "career.api.chat.active_opportunity_search",
            "기회를 찾는 중입니다. 검색이 끝나면 바로 이어서 대화할 수 있습니다."
          ),
          opportunityRun: serializeOpportunityRun(activeRun),
        },
        { status: 423 }
      );
    }

    let insertedUserMessage: TalentMessageRow | null = null;
    if (userMessageText) {
      const { data, error } = await admin
        .from("talent_messages")
        .insert(
          withIsMobile(
            {
              conversation_id: conversationId,
              user_id: user.id,
              role: "user",
              content: userMessageText,
              message_type: messageType,
            },
            isMobile
          )
        )
        .select("*")
        .single();

      if (error) {
        await notifyUnsupportedUnicodeEscapeError({
          conversationId,
          error,
          metadata: {
            isCallMode,
            messageType,
            userMessageLength: userMessageText.length,
          },
          route: "/api/talent/chat/save",
          stage: "talent_messages.insert:user_message",
          userId: user.id,
        });
        return NextResponse.json(
          { error: error.message ?? "Failed to insert user message" },
          { status: 500 }
        );
      }
      insertedUserMessage = data as TalentMessageRow;
    }

    let insertedAssistantMessage: TalentMessageRow | null = null;
    if (assistantMessageText) {
      const { data, error } = await admin
        .from("talent_messages")
        .insert(
          withIsMobile(
            {
              conversation_id: conversationId,
              user_id: user.id,
              role: "assistant",
              content: assistantMessageText,
              message_type: messageType,
            },
            isMobile
          )
        )
        .select("*")
        .single();

      if (error) {
        await notifyUnsupportedUnicodeEscapeError({
          conversationId,
          error,
          metadata: {
            assistantMessageLength: assistantMessageText.length,
            isCallMode,
            messageType,
          },
          route: "/api/talent/chat/save",
          stage: "talent_messages.insert:assistant_message",
          userId: user.id,
        });
        return NextResponse.json(
          {
            error: error.message ?? "Failed to insert assistant message",
          },
          { status: 500 }
        );
      }
      insertedAssistantMessage = data as TalentMessageRow;
    }

    let opportunityRun: Awaited<
      ReturnType<typeof completeOnboardingAndQueueInitialOpportunityRun>
    > | null = null;

    if (isCallMode) {
      try {
        await runInsightExtraction();
      } catch (error) {
        console.error("[ChatSave] Failed to extract call insights", {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
        });
      }
    } else {
      scheduleInsightExtraction();
    }
    void maybeSummarizeTalentConversation({
      admin,
      conversationId,
      userId: user.id,
    }).catch((error) => {
      console.error("[ChatSave] Failed to summarize conversation", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
      });
    });

    // Completion check: LLM marker or checklist coverage.
    const userTurnCount = await countUserChatTurns({ admin, conversationId });
    const currentProgressStep = Math.min(
      userTurnCount,
      TALENT_INTERVIEW_FINAL_STEP
    );
    const markerCompletion = resolveTalentOnboardingCompletion({
      assistantContent: assistantMessageTextWithMarkers ?? "",
      assistantEndedOnboarding,
    });
    const latestChecklistCoverage = !Boolean(talentSetting?.is_onboarding_done)
      ? await getCareerOnboardingChecklistCoverage({
          admin,
          conversationId,
          currentInsightContent: responseTalentInsights,
          userId: user.id,
        })
      : null;
    const checklistCompletion =
      latestChecklistCoverage &&
      getOnboardingChecklistCoverageStats(latestChecklistCoverage, profile)
        .isComplete;
    const completion = markerCompletion.completed
      ? markerCompletion
      : checklistCompletion
        ? {
            completed: true,
            reason: "question_checklist_covered" as const,
          }
        : markerCompletion;
    const isCompleted =
      Boolean(insertedAssistantMessage) && completion.completed;
    const shouldApplyCompletion = isCompleted && !skipConversationWrites;

    if (!skipConversationWrites) {
      const now = new Date().toISOString();
      await admin
        .from("talent_conversations")
        .update({
          stage: isCompleted ? "completed" : "chat",
          updated_at: now,
        })
        .eq("id", conversationId)
        .eq("user_id", user.id);
    }

    if (!opportunityRun && shouldApplyCompletion && completion.reason) {
      opportunityRun = await completeOnboardingAndQueueInitialOpportunityRun({
        admin,
        completionReason: completion.reason,
        conversationId,
        source: isCallMode ? "career_call_completion" : "career_chat_save",
        userId: user.id,
      });
      if (opportunityRun) {
        startOpportunityDiscoveryInBackground(opportunityRun.id);
      }
    }
    const completionMessages =
      shouldApplyCompletion && insertedUserMessage
        ? await createOnboardingCompletionMessages({
            admin,
            conversationId,
            isMobile,
            latestUserMessageId: insertedUserMessage.id,
            userId: user.id,
          })
        : null;
    const insertedCompletionWrapupMessage =
      completionMessages?.wrapupMessage ?? null;
    const insertedCompletionNextStepsMessage =
      completionMessages?.nextStepsMessage ?? null;
    const assistantResponseMessage = insertedAssistantMessage
      ? toResponseMessage(insertedAssistantMessage)
      : null;
    const assistantResponseMessages = [
      assistantResponseMessage,
      insertedCompletionWrapupMessage
        ? toResponseMessage(insertedCompletionWrapupMessage)
        : null,
      insertedCompletionNextStepsMessage
        ? toResponseMessage(insertedCompletionNextStepsMessage)
        : null,
    ].filter(
      (message): message is ReturnType<typeof toResponseMessage> =>
        message !== null
    );
    let nextStepInstructions: string | null = null;
    if (isCallMode && !shouldApplyCompletion) {
      try {
        nextStepInstructions = (
          await buildCareerRealtimeSessionInstructions({
            conversationId,
            conversationStarterId,
            internalCallRequestId,
            preferredLocale: responseLocale,
            toolNames: getCareerRealtimeToolCandidates(responseLocale).map(
              (tool) => tool.name
            ),
            userId: user.id,
          })
        ).instructions;
      } catch (error) {
        console.error("[ChatSave] Failed to rebuild realtime instructions", {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
          userId: user.id,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      userMessage: insertedUserMessage
        ? toResponseMessage(insertedUserMessage)
        : null,
      assistantMessage: assistantResponseMessage,
      assistantMessages: assistantResponseMessages,
      opportunityDiscoveryQueued: Boolean(opportunityRun),
      opportunityRun: serializeOpportunityRun(opportunityRun),
      searchStatusMessage: null,
      shouldEndCall: false,
      insightUpdatedAt: responseInsightUpdatedAt,
      nextStepInstructions,
      talentInsights: responseTalentInsights,
      progress: {
        answeredCount: userTurnCount,
        targetCount: TALENT_INTERVIEW_FINAL_STEP,
        completed: shouldApplyCompletion,
        currentStep: currentProgressStep,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save chat messages";
    console.error("[ChatSave] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
