import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  countUserChatTurns,
  fetchTalentInsights,
  getTalentSupabaseAdmin,
  type TalentConversationRow,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import { TALENT_INTERVIEW_FINAL_STEP } from "@/lib/talentOnboarding/progress";
import {
  warmCache,
  getTestFlagSlugs,
  getContentForUser,
} from "@/lib/talentOnboarding/prompts/promptCache";
import {
  getUncoveredChecklistItems,
  INSIGHT_CHECKLIST,
} from "@/lib/talentOnboarding/insightChecklist";
import { buildCareerInsightExtractionOnlyPrompt } from "@/lib/career/prompts";
import {
  completeOnboardingAndQueueInitialOpportunityRun,
  getActiveOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import {
  fetchActiveMockInterviewSession,
  serializeMockInterviewSession,
} from "@/lib/mockInterview/server";
import { extractAndPersistChatInsights } from "@/lib/talentOnboarding/chatInsights";
import {
  hasTalentOnboardingCompletionMarker,
  resolveTalentOnboardingCompletion,
  stripTalentOnboardingCompletionMarker,
} from "@/lib/talentOnboarding/completion";

type Body = {
  assistantEndedOnboarding?: boolean;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  isCallMode?: boolean;
};

const toResponseMessage = (item: TalentMessageRow) => ({
  id: item.id,
  role: item.role,
  content: item.content,
  messageType: item.message_type ?? "chat",
  createdAt: item.created_at,
});

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
    await warmCache();
    const testSlugs = await getTestFlagSlugs(user.id);

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const userMessageText = body.userMessage?.trim();
    const assistantMessageTextWithMarkers = body.assistantMessage?.trim();
    const assistantMessageText = stripTalentOnboardingCompletionMarker(
      assistantMessageTextWithMarkers
    );
    const isCallMode = Boolean(body.isCallMode);
    const assistantEndedOnboarding =
      Boolean(body.assistantEndedOnboarding) ||
      hasTalentOnboardingCompletionMarker(assistantMessageTextWithMarkers);
    const messageType = isCallMode ? "call_transcript" : "chat";

    if (!conversationId || !userMessageText || !assistantMessageText) {
      return NextResponse.json(
        {
          error:
            "conversationId, userMessage, and assistantMessage are required",
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

    const currentInsights = await fetchTalentInsights({
      admin,
      userId: user.id,
    });
    const currentInsightContent = (currentInsights?.content ?? null) as Record<
      string,
      string
    > | null;
    const uncoveredItems = getUncoveredChecklistItems(currentInsightContent);
    const coveredCount = INSIGHT_CHECKLIST.length - uncoveredItems.length;
    const extractTurnInsights = () =>
      extractAndPersistChatInsights({
        admin,
        assistantContent: assistantMessageText,
        buildPrompt: (promptArgs) => {
          const draftInsightMd =
            getContentForUser("insight-extraction", testSlugs) ?? undefined;
          return buildCareerInsightExtractionOnlyPrompt({
            coveredCount: promptArgs.coveredCount,
            currentInsightContent: promptArgs.currentInsightContent,
            insightMdOverride: draftInsightMd,
            totalCount: promptArgs.totalCount,
            uncoveredItems: promptArgs.uncoveredItems,
          });
        },
        conversationId,
        coveredCount,
        currentInsightContent,
        logPrefix: "ChatSave",
        totalCount: INSIGHT_CHECKLIST.length,
        uncoveredItems,
        userId: user.id,
      });

    const activeMockInterview = await fetchActiveMockInterviewSession({
      admin,
      conversationId,
      statuses: ["in_progress"],
      userId: user.id,
    });
    if (activeMockInterview) {
      const { data: insertedUserMessage, error: userMsgError } = await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "user",
          content: userMessageText,
          message_type: messageType,
        })
        .select("*")
        .single();

      if (userMsgError) {
        return NextResponse.json(
          { error: userMsgError.message ?? "Failed to insert user message" },
          { status: 500 }
        );
      }

      const { data: insertedAssistantMessage, error: assistantMsgError } =
        await admin
          .from("talent_messages")
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: assistantMessageText,
            message_type: messageType,
          })
          .select("*")
          .single();

      if (assistantMsgError) {
        return NextResponse.json(
          {
            error:
              assistantMsgError.message ?? "Failed to insert assistant message",
          },
          { status: 500 }
        );
      }

      const newKeysCount = await extractTurnInsights();

      return NextResponse.json({
        ok: true,
        assistantMessage: toResponseMessage(
          insertedAssistantMessage as TalentMessageRow
        ),
        mockInterviewSession:
          serializeMockInterviewSession(activeMockInterview),
        progress: {
          answeredCount: 0,
          completed: false,
          currentStep: coveredCount + newKeysCount,
          targetCount: TALENT_INTERVIEW_FINAL_STEP,
        },
        userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      });
    }

    const activeRun = await getActiveOpportunityRun({
      admin,
      conversationId,
      userId: user.id,
    });
    if (activeRun) {
      return NextResponse.json(
        {
          error:
            "기회를 찾는 중입니다. 검색이 끝나면 바로 이어서 대화할 수 있습니다.",
          opportunityRun: serializeOpportunityRun(activeRun),
        },
        { status: 423 }
      );
    }

    // Insert user message
    const { data: insertedUserMessage, error: userMsgError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: userMessageText,
        message_type: messageType,
      })
      .select("*")
      .single();

    if (userMsgError) {
      return NextResponse.json(
        { error: userMsgError.message ?? "Failed to insert user message" },
        { status: 500 }
      );
    }

    // Insert assistant message
    const { data: insertedAssistantMessage, error: assistantMsgError } =
      await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: assistantMessageText,
          message_type: messageType,
        })
        .select("*")
        .single();

    if (assistantMsgError) {
      return NextResponse.json(
        {
          error:
            assistantMsgError.message ?? "Failed to insert assistant message",
        },
        { status: 500 }
      );
    }

    let opportunityRun: Awaited<
      ReturnType<typeof completeOnboardingAndQueueInitialOpportunityRun>
    > | null = null;

    const newKeysCount = await extractTurnInsights();

    // Completion check: explicit LLM onboarding-done marker only.
    const userTurnCount = await countUserChatTurns({ admin, conversationId });
    const insightsCoveredAfter = coveredCount + newKeysCount;
    const completion = resolveTalentOnboardingCompletion({
      assistantContent: assistantMessageTextWithMarkers ?? "",
      assistantEndedOnboarding,
    });
    const isCompleted = completion.completed;

    const now = new Date().toISOString();
    await admin
      .from("talent_conversations")
      .update({
        stage: isCompleted ? "completed" : "chat",
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    if (!opportunityRun && isCompleted && completion.reason) {
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

    return NextResponse.json({
      ok: true,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage: toResponseMessage(
        insertedAssistantMessage as TalentMessageRow
      ),
      opportunityRun: serializeOpportunityRun(opportunityRun),
      searchStatusMessage: null,
      shouldEndCall: false,
      progress: {
        answeredCount: userTurnCount,
        targetCount: TALENT_INTERVIEW_FINAL_STEP,
        completed: isCompleted,
        currentStep: insightsCoveredAfter,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save chat messages";
    console.error("[ChatSave] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
