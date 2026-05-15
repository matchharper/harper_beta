import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
  type TalentConversationRow,
} from "@/lib/talentOnboarding/server";
import { TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP } from "@/lib/talentOnboarding/onboarding";
import { runCareerChatTurn } from "@/lib/career/chatTurn";
import {
  buildCareerSessionStartTurnInstruction,
  CAREER_SESSION_START_NO_MESSAGE_MARKER,
} from "@/lib/career/prompts";

const REENGAGEMENT_IDLE_MS = 6 * 60 * 60 * 1000;

const parseTimestampMs = (value: string | null | undefined) => {
  if (typeof value !== "string") return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
};

type ReengagementBody = {
  conversationId?: string | null;
  devDeleteLatestMessage?: boolean;
  devForce?: boolean;
};

type DeletedTalentMessage = {
  id: number;
  message_type: string | null;
  role: string;
};

const DEV_SESSION_REENGAGEMENT_TEST_EMAILS = new Set([
  "hyunbin.bk@gmail.com",
  "khj605123@gmail.com",
]);

const canRunDevSessionReengagementTest = (email: string | null | undefined) => {
  if (process.env.NODE_ENV !== "production") return true;
  const normalizedEmail = String(email ?? "")
    .trim()
    .toLowerCase();
  return (
    normalizedEmail.endsWith("@matchharper.com") ||
    DEV_SESSION_REENGAGEMENT_TEST_EMAILS.has(normalizedEmail)
  );
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as ReengagementBody;
    const conversationId = String(body?.conversationId ?? "").trim();
    const devDeleteLatestMessage = body?.devDeleteLatestMessage === true;
    const devForce = body?.devForce === true;
    const isDevTestRequest = devDeleteLatestMessage || devForce;
    if (
      isDevTestRequest &&
      !canRunDevSessionReengagementTest(user.email ?? null)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

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

    const conversation = (conversationData ??
      null) as TalentConversationRow | null;
    if (!conversation || conversation.stage === "profile") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    let deletedMessage: DeletedTalentMessage | null = null;
    if (devDeleteLatestMessage) {
      const { data: latestMessage, error: latestMessageError } = await admin
        .from("talent_messages")
        .select("id, role, message_type")
        .eq("conversation_id", conversation.id)
        .eq("user_id", user.id)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestMessageError) {
        throw new Error(
          latestMessageError.message ?? "Failed to read latest talent_message"
        );
      }

      if (latestMessage) {
        const { error: deleteMessageError } = await admin
          .from("talent_messages")
          .delete()
          .eq("id", latestMessage.id)
          .eq("conversation_id", conversation.id)
          .eq("user_id", user.id);

        if (deleteMessageError) {
          throw new Error(
            deleteMessageError.message ??
              "Failed to delete latest talent_message"
          );
        }

        deletedMessage = {
          id: latestMessage.id,
          message_type: latestMessage.message_type ?? null,
          role: latestMessage.role,
        };
      }
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
    const { data: latestReengagementSkip, error: latestReengagementSkipError } =
      latestReengagementSkipResult;

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
    const effectiveIdleMs = devForce
      ? Math.max(idleMs, REENGAGEMENT_IDLE_MS)
      : idleMs;

    if (effectiveIdleMs < REENGAGEMENT_IDLE_MS) {
      return NextResponse.json({
        ok: true,
        deletedMessage,
        skipped: true,
      });
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
      noMessageMarker: CAREER_SESSION_START_NO_MESSAGE_MARKER,
      proactiveContext: buildCareerSessionStartTurnInstruction({
        currentAccessAt: now,
        idleMs: effectiveIdleMs,
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
          content: CAREER_SESSION_START_NO_MESSAGE_MARKER,
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
      deletedMessage,
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
