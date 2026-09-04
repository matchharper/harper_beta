import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  buildCareerInsightExtractionPrompt,
  buildCareerOnboardingDeferCloseSystemPrompt,
  getCareerOnboardingDeferFallbackCloseText,
  getCareerOnboardingDeferPromptText,
} from "@/lib/career/prompts";
import { getTranslatedCareerMessage } from "@/lib/career/translatedCareerMessage";
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
  fetchTalentSetting,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistProgress,
  getTalentSupabaseAdmin,
  normalizeTalentInsightContent,
} from "@/lib/talentOnboarding/server";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";

type Body = {
  conversationId?: string;
  action?: "prompt" | "submit";
  locale?: string | null;
  selectedOptions?: TalentOnboardingInterestOptionId[];
};

const INTEREST_OPTIONS_BY_ID = new Map(
  TALENT_ONBOARDING_INTEREST_OPTIONS.map((option) => [option.id, option])
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
    const talentSetting = await fetchTalentSetting({
      admin,
      userId: user.id,
    });
    const responseLocale =
      talentSetting?.preferred_locale ??
      body.locale ??
      req.cookies.get("NEXT_LOCALE")?.value;

    if (action === "prompt") {
      const deferPromptText = getCareerOnboardingDeferPromptText({
        preferredLocale: responseLocale,
      });
      const { data: insertedAssistantMessage, error: insertError } = await admin
        .from("talent_messages")
        .insert(
          withIsMobile(
            {
              conversation_id: conversationId,
              user_id: user.id,
              role: "assistant",
              content: deferPromptText,
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
    const [currentInsights, profile] = await Promise.all([
      fetchTalentInsights({
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

    const selectedLabels = selectedOptions.map((optionId) => {
      const option = INTEREST_OPTIONS_BY_ID.get(optionId);
      if (!option) return optionId;

      return getTranslatedCareerMessage({
        fallback: option.label,
        key: option.labelKey,
        locale: responseLocale,
      });
    });
    const selectedPrefix = getTranslatedCareerMessage({
      fallback: "현재 찾고 있는 기회:",
      key: "career.onboarding.interest.selected_prefix",
      locale: responseLocale,
    });
    const userContent = [
      selectedPrefix,
      ...selectedLabels.map((label) => `- ${label}`),
    ].join("\n");

    let assistantContent = "";
    try {
      assistantContent = await runCareerOnboardingDeferClose({
        messages: [
          {
            role: "system",
            content: buildCareerOnboardingDeferCloseSystemPrompt({
              preferredLocale: responseLocale,
            }),
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
      assistantContent.trim() ||
      getCareerOnboardingDeferFallbackCloseText({
        preferredLocale: responseLocale,
      });

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
          onboardingChecklistContext: promptArgs.onboardingChecklistContext,
          preferredLocale: responseLocale,
        }),
      conversationId,
      currentInsightContent,
      logPrefix: "TalentOnboardingDefer",
      onboardingChecklistContext: profile,
      sourceChannel: "text_chat",
      userId: user.id,
    });

    const latestInsights = await fetchTalentInsights({
      admin,
      userId: user.id,
    });
    const normalizedLatestInsights = normalizeTalentInsightContent(
      latestInsights?.content ?? null
    );
    const onboardingChecklistProgress = !Boolean(
      talentSetting?.is_onboarding_done
    )
      ? await getCareerOnboardingChecklistProgress({
          admin,
          context: profile,
          conversationId,
          currentInsightContent: normalizedLatestInsights,
          userId: user.id,
        })
      : null;

    return NextResponse.json({
      ok: true,
      conversation: {
        id: (conversation as TalentConversationRow).id,
        stage: "chat",
      },
      insightUpdatedAt: latestInsights?.last_updated_at ?? null,
      onboardingChecklistProgress,
      talentInsights: normalizedLatestInsights,
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
