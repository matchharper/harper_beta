import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
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
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

type Body = {
  conversationId?: string;
  action?: "prompt" | "submit";
  selectedOptions?: TalentOnboardingInterestOptionId[];
};

const INTEREST_OPTION_LABELS = new Map(
  TALENT_ONBOARDING_INTEREST_OPTIONS.map((option) => [option.id, option.label])
);

const DEFER_PROMPT_TEXT = [
  "알겠습니다. 지금은 우선 등록만 마쳐둘게요. 나중에 다시 들어와 주세요.",
  "",
  "대신 기본적인 상황만 먼저 알려주시면, 필요할 때 더 빠르게 이어갈 수 있습니다.",
  "",
  "현재 어떤 기회를 찾고 있는지 선택해 주세요. 여러 개 선택하셔도 됩니다.",
].join("\n");

const FALLBACK_CLOSE_TEXT = [
  "알겠습니다. 지금 말씀해주신 상황으로 우선 등록을 마쳐둘게요.",
  "나중에 다시 들어오시면 이어서 더 자세히 도와드리겠습니다.",
  "원하시면 아래 버튼으로 지금 바로 계속 대화하셔도 됩니다.",
].join(" ");

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
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: DEFER_PROMPT_TEXT,
          message_type: TALENT_MESSAGE_TYPE_ONBOARDING_INTEREST_PROMPT,
        })
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

    const selectedLabels = selectedOptions.map(
      (optionId) => INTEREST_OPTION_LABELS.get(optionId) ?? optionId
    );
    const userContent = [
      "현재 찾고 있는 기회:",
      ...selectedLabels.map((label) => `- ${label}`),
    ].join("\n");

    let assistantContent = "";
    try {
      assistantContent = await runTalentAssistantCompletion({
        messages: [
          {
            role: "system",
            content: [
              "You are Harper, an AI talent agent for career onboarding.",
              "Always answer in Korean.",
              "The user chose to postpone the main conversation and only shared their current opportunity preferences.",
              "Write a short closing message in 2-3 sentences.",
              "Rules:",
              "- Acknowledge the selected preferences.",
              "- Say that Harper will save the registration for now.",
              "- Say the user can come back later or continue now.",
              "- Do not ask a follow-up question.",
              "- Do not use bullet points.",
            ].join("\n"),
          },
          {
            role: "user",
            content: selectedLabels.join("\n"),
          },
        ],
        temperature: 0.3,
      });
    } catch {
      assistantContent = "";
    }

    const safeAssistantContent = assistantContent.trim() || FALLBACK_CLOSE_TEXT;

    const { data: insertedMessages, error: insertError } = await admin
      .from("talent_messages")
      .insert([
        {
          conversation_id: conversationId,
          user_id: user.id,
          role: "user",
          content: userContent,
          message_type: TALENT_MESSAGE_TYPE_ONBOARDING_STATUS,
        },
        {
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: safeAssistantContent,
          message_type: TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE,
        },
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

    return NextResponse.json({
      ok: true,
      conversation: {
        id: (conversation as TalentConversationRow).id,
        stage: "chat",
      },
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
