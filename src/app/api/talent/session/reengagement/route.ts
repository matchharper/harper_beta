import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
  type TalentConversationRow,
} from "@/lib/talentOnboarding/server";
import { TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP } from "@/lib/talentOnboarding/onboarding";
import { runCareerChatTurn } from "@/lib/career/chatTurn";

const REENGAGEMENT_IDLE_MS = 6 * 60 * 60 * 1000;
const SESSION_GREETING_NO_MESSAGE_MARKER = "__NO_SESSION_GREETING__";
const SESSION_GREETING_CALL_ACTION_MARKER = "[[CALL]]";

const parseTimestampMs = (value: string | null | undefined) => {
  if (typeof value !== "string") return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
};

function buildSessionStartInstruction(args: {
  currentAccessAt: string;
  idleMs: number;
  previousChatAt: string | null;
}) {
  const anchorIdleHours = Math.max(
    0,
    Math.floor(args.idleMs / (60 * 60 * 1000))
  );
  const currentAccessMs = parseTimestampMs(args.currentAccessAt);
  const previousChatMs = parseTimestampMs(args.previousChatAt);
  const previousChatIdleHours =
    currentAccessMs > 0 && previousChatMs > 0
      ? Math.max(
          0,
          Math.floor((currentAccessMs - previousChatMs) / (60 * 60 * 1000))
        )
      : null;

  return [
    "## Session-start assistant turn",
    "사용자가 방금 Career 화면에 다시 접속했다. 사용자가 아직 새 메시지를 보내지 않았지만, Harper가 먼저 짧게 말을 건넬 수 있는 차례다.",
    `- currentAccessAt: ${args.currentAccessAt}`,
    `- previousChatAt: ${args.previousChatAt ?? "(없음)"}`,
    `- hoursSincePreviousChat: ${previousChatIdleHours ?? "(계산 불가)"}`,
    `- hoursSinceReengagementAnchor: ${anchorIdleHours}`,
    "대화 맥락상 지금 아무 말도 하지 않는 편이 더 자연스럽거나 도움이 되지 않는다고 판단되면 아무 것도 출력하지 않아도 된다.",
    `아무 말도 하지 않기로 결정하면 응답 본문을 비우거나 ${SESSION_GREETING_NO_MESSAGE_MARKER} 만 출력해라. 이 경우 다른 설명을 붙이지 마라.`,
    "이전 대화 맥락을 이어서 말하고, 처음 온 사람처럼 Harper를 길게 소개하지 마라.",
    "최근 Career 활동이나 프로필 변경 혹은 이전 추천 등이 필요하면 기존 career/chat에서 쓰는 tool 정책에 따라 적절한 tool을 사용해라.",
    "정확한 시각, 내부 이벤트명, 시스템 동작 방식은 사용자에게 말하지 마라.",
    "메시지를 보낼 때는 1-3문장으로 끝내라.",
    "첫 인사의 기본 구조는 이전 대화, 최근 Career 활동, 프로필 변경, 이전 추천/피드백 중 가장 중요한 맥락을 1문장으로 짧게 wrap-up한 뒤, 그 맥락에서 바로 이어갈 수 있는 질문 1개로 끝내는 것이다.",
    "질문은 사용자가 바로 쉽게 답할 수 있어야 하며, 여러 질문을 묶지 마라.",
    "참고할 만한 이전 대화나 활동 맥락이 약하면 최근 우선순위나 찾고 싶은 방향이 달라졌는지 묻는 일반 질문으로 끝내라.",
    "이미 명확한 다음 액션이 진행 중이라 사용자의 답이 필요 없거나, 질문이 오히려 어색하면 질문 없이 짧은 상태 공유로 닫아도 된다.",
    `hoursSincePreviousChat이 168 이상이고, 최근 활동/추천/프로필 변경에서 바로 이어갈 만한 명확한 업데이트가 없다면 "오랜만이라 최근 업데이트나 재밌게 하는 일이 있는지 통화로 한번 듣고 싶다"는 취지로 자연스럽게 말한 뒤 응답 맨 끝에 ${SESSION_GREETING_CALL_ACTION_MARKER} 를 붙여라.`,
    `${SESSION_GREETING_CALL_ACTION_MARKER} 는 UI가 전화하기 버튼을 표시하는 데 쓰는 마커다. 이 마커를 설명하거나 따옴표로 감싸지 마라.`,
    "텍스트 채팅에 표시되므로 필요하면 회사명, 역할명, 방향성 같은 핵심 단어에 가벼운 inline markdown 강조(**...**)를 사용해라. 긴 heading이나 bullet list는 쓰지 마라.",
  ].join("\n");
}

type ReengagementBody = {
  conversationId?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as ReengagementBody;
    const conversationId = String(body?.conversationId ?? "").trim();
    const admin = getTalentSupabaseAdmin();

    await ensureTalentUserRecord({ admin, user });

    const conversationQuery = admin
      .from("talent_conversations")
      .select("*")
      .eq("user_id", user.id);
    const { data: conversationData, error: conversationError } = conversationId
      ? await conversationQuery.eq("id", conversationId).maybeSingle()
      : await conversationQuery
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    if (conversationError) {
      return NextResponse.json(
        {
          error:
            conversationError.message ?? "Failed to read talent_conversations",
        },
        { status: 500 }
      );
    }

    const conversation = (conversationData ?? null) as
      | TalentConversationRow
      | null;
    if (!conversation || conversation.stage === "profile") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const [latestChatResult, latestReengagementSkipResult] = await Promise.all([
      admin
        .from("talent_messages")
        .select(
          "id, conversation_id, user_id, role, content, message_type, thinking_logs, created_at"
        )
        .eq("conversation_id", conversation.id)
        .eq("message_type", "chat")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("talent_messages")
        .select("id, created_at")
        .eq("conversation_id", conversation.id)
        .eq("message_type", TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const { data: latestChatMessage, error: latestChatError } =
      latestChatResult;
    const {
      data: latestReengagementSkip,
      error: latestReengagementSkipError,
    } = latestReengagementSkipResult;

    if (latestChatError) {
      throw new Error(
        latestChatError.message ?? "Failed to read latest chat message"
      );
    }
    if (latestReengagementSkipError) {
      throw new Error(
        latestReengagementSkipError.message ??
          "Failed to read latest re-engagement skip"
      );
    }

    const latestChatAt = parseTimestampMs(latestChatMessage?.created_at);
    const latestReengagementSkipAt = parseTimestampMs(
      latestReengagementSkip?.created_at
    );
    const latestReengagementAnchorAt = Math.max(
      latestChatAt,
      latestReengagementSkipAt
    );
    const idleMs =
      latestReengagementAnchorAt <= 0
        ? 0
        : Date.now() - latestReengagementAnchorAt;

    if (idleMs < REENGAGEMENT_IDLE_MS) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const isReengagementAnchorCurrent = async () => {
      const [latestChatAfterResult, latestSkipAfterResult] = await Promise.all([
        admin
          .from("talent_messages")
          .select("id, created_at")
          .eq("conversation_id", conversation.id)
          .eq("message_type", "chat")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("talent_messages")
          .select("id, created_at")
          .eq("conversation_id", conversation.id)
          .eq("message_type", TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (latestChatAfterResult.error || latestSkipAfterResult.error) {
        return false;
      }

      const latestChatAfterAt = parseTimestampMs(
        latestChatAfterResult.data?.created_at
      );
      const latestSkipAfterAt = parseTimestampMs(
        latestSkipAfterResult.data?.created_at
      );

      return (
        Math.max(latestChatAfterAt, latestSkipAfterAt) <=
        latestReengagementAnchorAt
      );
    };

    const now = new Date().toISOString();
    const result = await runCareerChatTurn({
      admin,
      conversationId: conversation.id,
      noMessageMarker: SESSION_GREETING_NO_MESSAGE_MARKER,
      proactiveContext: buildSessionStartInstruction({
        currentAccessAt: now,
        idleMs,
        previousChatAt: latestChatMessage?.created_at ?? null,
      }),
      shouldInsertAssistantMessage: isReengagementAnchorCurrent,
      userId: user.id,
    });

    if (conversation.stage === "completed") {
      await admin
        .from("talent_conversations")
        .update({ stage: "completed" })
        .eq("id", conversation.id)
        .eq("user_id", user.id);
    }

    if (
      (result.noMessage || result.assistantMessages.length === 0) &&
      (await isReengagementAnchorCurrent())
    ) {
      const { error: insertReengagementError } = await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversation.id,
          user_id: user.id,
          role: "assistant",
          content: SESSION_GREETING_NO_MESSAGE_MARKER,
          message_type: TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP,
          created_at: now,
        });

      if (insertReengagementError) {
        throw new Error(
          insertReengagementError.message ??
            "Failed to insert re-engagement skip"
        );
      }
    }

    return NextResponse.json({
      ok: true,
      assistantMessage: result.assistantMessage,
      assistantMessages: result.assistantMessages,
      noMessage: result.noMessage,
      opportunityDiscoveryQueued: result.opportunityDiscoveryQueued,
      opportunityRun: result.opportunityRun,
      insightUpdatedAt: result.insightUpdatedAt,
      preferencesUpdatedAt: result.preferencesUpdatedAt,
      skipped: false,
      talentInsights: result.talentInsights,
      talentPreferences: result.talentPreferences,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run session re-engagement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
