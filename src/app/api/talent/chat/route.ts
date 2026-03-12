import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  buildTalentProfileContext,
  countUserChatTurns,
  fetchRecentMessages,
  fetchTalentStructuredProfile,
  TalentConversationRow,
  TalentMessageRow,
  TalentUserProfileRow,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { TALENT_ONBOARDING_COMPLETION_TARGET } from "@/lib/talentOnboarding/progress";

type Body = {
  conversationId?: string;
  message?: string;
  link?: string;
};

function buildSystemPrompt(args: {
  profile: TalentUserProfileRow | null;
  structuredProfileText: string;
  shouldSendReliefNudge: boolean;
  userTurnCount: number;
}) {
  const {
    profile,
    structuredProfileText,
    shouldSendReliefNudge,
    userTurnCount,
  } = args;
  const linkText = (profile?.resume_links ?? []).join(", ");

  const systemPrompt = `
Always answer in Korean.
Be concise, clear, and warm.
Given the conversation, do all of the following:
1) brief acknowledgement
2) short guidance or summary
3) one next question (if needed).
Avoid markdown tables and long bullet dumps. Becaues your output will be used as a voice script for TTS.

전체적인 대화는 이런 흐름이면 좋다.
---
원하는 정도의 대답이 아니면 follow-up 질문 해도 됨.

- 안녕하세요, 저는 하퍼입니다.
  짧게 몇 가지 질문만 드리고, 어떤 기회가 잘 맞을지 확인해보려고 합니다.
  보통 5분 정도 걸립니다.
  지금 잠깐 이야기 괜찮으실까요?

- 올려주신 정보를 잘 확인했어요. 통화하시는 지금 기준으로, 어떤 상황이신지 말해주실 수 있나요?
  지금은 이직을 적극적으로 생각 중이신가요,
  아니면 좋은 기회가 있으면 보는 정도일까요?
- 지금 이력서/링크드인 을 보니까 ~~~ 하고 계신데/~~한 상황이신 것 같은데 지금은 어떻게 하고 계신가요?
- 만약 이직을 하신다면 어떤 점이 가장 중요하신가요?
- 최근에는 어떻게 업무를 하고 계세요? AI 툴을 많이들 사용하는데, 어떻게 얼마나 활용하시고 계신지 궁금해요.
- 지금 회사에서 가장 만족하는 점은 뭐고
  아쉬운 점은 어떤 게 있을까요?
- 어떤 종류의 회사가 잘 맞을 것 같으세요?
  - (왜요?)
- 앞으로 어떤 역할을 더 하고 싶으세요?
- 이런 기회가 있으면 좋을 것 같다고 생각하시는게 있나요?
  - (왜요?)
- 하퍼에서는 다양한 기회가 제안될 수 있는데요, 혹시 해외에서 업무를 할 의사나 혹은 한국의 해외기반 기업에서도 일할 생각이 있으신가요?
  - (Yes) 해외 관련 경험 혹은 언어 숙련도가 어떻게 됨?
- 혹시 꼭 피하고 싶은 회사나 분야도 있으실까요?
- 회사의 조건도 선호가 있으세요? 연봉, 복지, 워라밸 등
- 감사합니다. 말씀해주신 내용을 기반으로
몇 가지 기회를 찾아보고
잘 맞는 게 있으면 다시 연락드릴게요.
우선 대화는 여기서 종료해도 될 것 같아요.

하지만 정보를 많이 알려주실 수록 저희에게는 도움이 되긴 하니, 대화를 할 시간이 있으시다면 언제든지 다시 대화를 걸어주세요!
[종료하기] [계속 대화하기]
---
`;
  return [
    "You are Harper, a Korean AI talent agent for candidate onboarding.",
    systemPrompt,
    "",
    `Current user turn count: ${userTurnCount}`,
    `Resume file: ${profile?.resume_file_name ?? "(none)"}`,
    `Resume links: ${linkText || "(none)"}`,
    structuredProfileText || "[Structured Talent Profile]\n(none)",
    "",
    shouldSendReliefNudge
      ? [
          "IMPORTANT: Include this exact nudge once in your response:",
          "지금은 여기까지 해도 됩니다.",
          "지금 정보만으로도 매칭을 시작할 수 있습니다.",
          "After that, optionally ask one lightweight follow-up question.",
        ].join("\n")
      : "Keep the flow moving with one high-signal follow-up question when useful.",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const conversationId = body.conversationId?.trim();
    const message = body.message?.trim();
    const link = body.link?.trim();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }
    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
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

    const profile = await fetchTalentUserProfile({ admin, userId: user.id });
    const structuredProfile = await fetchTalentStructuredProfile({
      admin,
      userId: user.id,
      talentUser: profile,
    });
    const structuredProfileText = buildTalentProfileContext({
      profile,
      structuredProfile,
      maxResumeChars: 3000,
    });

    const normalizedContent = link
      ? `${message}\n\n참고 링크: ${link}`
      : message;

    const { data: insertedUserMessage, error: userMessageError } = await admin
      .from("talent_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: normalizedContent,
        message_type: "chat",
      })
      .select("*")
      .single();

    if (userMessageError) {
      return NextResponse.json(
        { error: userMessageError.message ?? "Failed to insert user message" },
        { status: 500 }
      );
    }

    const userTurnCount = await countUserChatTurns({ admin, conversationId });
    const recentMessages = await fetchRecentMessages({
      admin,
      conversationId,
      limit: 24,
    });

    const shouldSendReliefNudge =
      userTurnCount >= 5 &&
      !Boolean((conversation as TalentConversationRow).relief_nudge_sent);

    const llmMessages = recentMessages
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: item.content,
      }))
      .filter((item) => item.content.trim().length > 0);

    const assistantText = await runTalentAssistantCompletion({
      messages: [
        {
          role: "system",
          content: buildSystemPrompt({
            profile,
            structuredProfileText,
            shouldSendReliefNudge,
            userTurnCount,
          }),
        },
        ...llmMessages,
      ],
      temperature: 0.55,
    });

    const safeAssistantText =
      assistantText.trim() ||
      "좋은 정보 감사합니다. 이어서 가장 우선순위인 조건을 하나만 더 알려주세요.";

    const { data: insertedAssistantMessage, error: assistantError } =
      await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: safeAssistantText,
          message_type: "chat",
        })
        .select("*")
        .single();

    if (assistantError) {
      return NextResponse.json(
        {
          error: assistantError.message ?? "Failed to insert assistant message",
        },
        { status: 500 }
      );
    }

    const isCompleted = userTurnCount >= TALENT_ONBOARDING_COMPLETION_TARGET;
    const now = new Date().toISOString();
    const { error: conversationUpdateError } = await admin
      .from("talent_conversations")
      .update({
        stage: isCompleted ? "completed" : "chat",
        relief_nudge_sent: shouldSendReliefNudge
          ? true
          : Boolean((conversation as TalentConversationRow).relief_nudge_sent),
        updated_at: now,
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    if (conversationUpdateError) {
      return NextResponse.json(
        {
          error:
            conversationUpdateError.message ??
            "Failed to update conversation progress",
        },
        { status: 500 }
      );
    }

    const toResponseMessage = (item: TalentMessageRow) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      messageType: item.message_type ?? "chat",
      createdAt: item.created_at,
    });

    return NextResponse.json({
      ok: true,
      userMessage: toResponseMessage(insertedUserMessage as TalentMessageRow),
      assistantMessage: toResponseMessage(
        insertedAssistantMessage as TalentMessageRow
      ),
      progress: {
        answeredCount: Math.min(
          userTurnCount,
          TALENT_ONBOARDING_COMPLETION_TARGET
        ),
        targetCount: TALENT_ONBOARDING_COMPLETION_TARGET,
        completed: isCompleted,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process talent chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
