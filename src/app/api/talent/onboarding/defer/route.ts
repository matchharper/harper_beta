import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildCareerInsightExtractionPrompt,
  buildCareerOnboardingDeferCloseSystemPrompt,
  CAREER_ONBOARDING_DEFER_FALLBACK_CLOSE_TEXT,
  CAREER_ONBOARDING_DEFER_PROMPT_TEXT,
} from "@/lib/career/prompts";
import { runCareerOnboardingDeferClose } from "@/lib/career/llm";
import { extractAndPersistChatInsights } from "@/lib/talentOnboarding/chatInsights";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_INTEREST_PROMPT,
  TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE,
  TALENT_MESSAGE_TYPE_ONBOARDING_STATUS,
  TALENT_ONBOARDING_INTEREST_OPTIONS,
  type TalentOnboardingInterestOptionId,
} from "@/lib/talentOnboarding/onboarding";
import {
  TalentConversationRow,
  TalentMessageRow,
  fetchTalentInsights,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";

type Body = {
  conversationId?: string;
  action?: "prompt" | "submit";
  selectedOptions?: TalentOnboardingInterestOptionId[];
};

const INTEREST_OPTION_LABELS = new Map(
  TALENT_ONBOARDING_INTEREST_OPTIONS.map((option) => [option.id, option.label])
);

const normalizeSelectedOptions = (raw: unknown) => {
  if (!Array.isArray(raw)) return [];

  const validIds = new Set(
    TALENT_ONBOARDING_INTEREST_OPTIONS.map((option) => option.id)
  );
  const ordered: TalentOnboardingInterestOptionId[] = [];

  for (const value of raw) {
    const normalized = String(
      value ?? ""
    ).trim() as TalentOnboardingInterestOptionId;
    if (!validIds.has(normalized)) continue;
    if (ordered.includes(normalized)) continue;
    ordered.push(normalized);
  }

  return ordered;
};

const toResponseMessage = (message: TalentMessageRow) => ({
  id: message.id,
  role: message.role,
  content: message.content,
  messageType: message.message_type ?? "chat",
  createdAt: message.created_at,
});

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const isMobile = isMobileRequest(req);
    const conversationId = body.conversationId?.trim();
    const action = body.action;

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (action !== "prompt" && action !== "submit") {
      return NextResponse.json(
        { error: "action must be prompt or submit" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: conversation, error: conversationError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (conversationError) {
      return NextResponse.json(
        { error: conversationError.message ?? "Failed to read conversation" },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    if (action === "prompt") {
      const { data: insertedAssistantMessage, error: insertError } = await admin
        .from("talent_messages")
        .insert(
          withIsMobile(
            {
              conversation_id: conversationId,
              user_id: user.id,
              role: "assistant",
              content: CAREER_ONBOARDING_DEFER_PROMPT_TEXT,
              message_type: TALENT_MESSAGE_TYPE_ONBOARDING_INTEREST_PROMPT,
            },
            isMobile
          )
        )
        .select("*")
        .single();

      if (insertError) {
        return NextResponse.json(
          {
            error:
              insertError.message ?? "Failed to create onboarding defer prompt",
          },
          { status: 500 }
        );
      }

      const { error: updateError } = await admin
        .from("talent_conversations")
        .update({
          stage: "chat",
          updated_at: now,
        })
        .eq("id", conversationId)
        .eq("user_id", user.id);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message ?? "Failed to update conversation" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        conversation: {
          id: (conversation as TalentConversationRow).id,
          stage: "chat",
        },
        assistantMessage: toResponseMessage(
          insertedAssistantMessage as TalentMessageRow
        ),
      });
    }

    const selectedOptions = normalizeSelectedOptions(body.selectedOptions);
    if (selectedOptions.length === 0) {
      return NextResponse.json(
        { error: "At least one option must be selected" },
        { status: 400 }
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

    const selectedLabels = selectedOptions.map(
      (optionId) => INTEREST_OPTION_LABELS.get(optionId) ?? optionId
    );
    const userContent = [
      "현재 찾고 있는 기회:",
      ...selectedLabels.map((label) => `- ${label}`),
    ].join("\n");

    let assistantContent = "";
    try {
      assistantContent = await runCareerOnboardingDeferClose({
        messages: [
          {
            role: "system",
            content: buildCareerOnboardingDeferCloseSystemPrompt(),
          },
          {
            role: "user",
            content: selectedLabels.join("\n"),
          },
        ],
      });
    } catch {
      assistantContent = "";
    }

    const safeAssistantContent =
      assistantContent.trim() || CAREER_ONBOARDING_DEFER_FALLBACK_CLOSE_TEXT;

    const { data: insertedMessages, error: insertError } = await admin
      .from("talent_messages")
      .insert([
        withIsMobile(
          {
            conversation_id: conversationId,
            user_id: user.id,
            role: "user",
            content: userContent,
            message_type: TALENT_MESSAGE_TYPE_ONBOARDING_STATUS,
          },
          isMobile
        ),
        withIsMobile(
          {
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: safeAssistantContent,
            message_type: TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE,
          },
          isMobile
        ),
      ])
      .select("*");

    if (insertError) {
      return NextResponse.json(
        {
          error:
            insertError.message ?? "Failed to store onboarding status answers",
        },
        { status: 500 }
      );
    }

    const { error: updateError } = await admin
      .from("talent_conversations")
      .update({
        stage: "chat",
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message ?? "Failed to update conversation" },
        { status: 500 }
      );
    }

    const insertedRows = (insertedMessages ?? []) as TalentMessageRow[];
    const userMessage = insertedRows.find((message) => message.role === "user");
    const assistantMessage = insertedRows.find(
      (message) => message.role === "assistant"
    );

    if (!userMessage || !assistantMessage) {
      return NextResponse.json(
        { error: "Failed to create defer conversation messages" },
        { status: 500 }
      );
    }

    await extractAndPersistChatInsights({
      admin,
      assistantContent: safeAssistantContent,
      buildPrompt: (promptArgs) =>
        buildCareerInsightExtractionPrompt({
          currentChecklistCoverage: promptArgs.currentChecklistCoverage,
          currentInsightContent: promptArgs.currentInsightContent,
        }),
      conversationId,
      currentInsightContent,
      logPrefix: "TalentOnboardingDefer",
      sourceChannel: "text_chat",
      userId: user.id,
    });

    const latestInsights = await fetchTalentInsights({
      admin,
      userId: user.id,
    });

    return NextResponse.json({
      ok: true,
      conversation: {
        id: (conversation as TalentConversationRow).id,
        stage: "chat",
      },
      insightUpdatedAt: latestInsights?.last_updated_at ?? null,
      talentInsights: latestInsights?.content ?? null,
      userMessage: toResponseMessage(userMessage),
      assistantMessage: toResponseMessage(assistantMessage),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to defer talent onboarding";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
