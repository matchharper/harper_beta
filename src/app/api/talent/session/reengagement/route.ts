import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  fetchTalentSetting,
  getTalentSupabaseAdmin,
  type TalentConversationRow,
} from "@/lib/talentOnboarding/server";
import { TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP } from "@/lib/talentOnboarding/onboarding";
import {
  runCareerChatTurn,
  type CareerChatTurnResult,
} from "@/lib/career/chatTurn";
import {
  buildCareerSessionStartTurnInstruction,
  CAREER_SESSION_START_NO_MESSAGE_MARKER,
} from "@/lib/career/prompts";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";

const REENGAGEMENT_IDLE_MS = 8 * 60 * 60 * 1000; // 8시간
const USER_INITIATED_REENGAGEMENT_IDLE_MS = 60 * 60 * 1000; // 1시간

const parseTimestampMs = (value: string | null | undefined) => {
  if (typeof value !== "string") return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
};

const wantsSseStream = (req: NextRequest) =>
  (req.headers.get("accept") ?? "").includes("text/event-stream");

const createSseMessage = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const createSseHeaders = () => ({
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream; charset=utf-8",
  "X-Accel-Buffering": "no",
});

type ReengagementBody = {
  conversationId?: string | null;
  devDeleteLatestMessage?: boolean;
  devForce?: boolean;
  userInitiated?: boolean;
};

type DeletedTalentMessage = {
  id: number;
  message_type: string | null;
  role: string;
};

async function finalizeSessionReengagement(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversation: TalentConversationRow;
  deletedMessage: DeletedTalentMessage | null;
  isReengagementAnchorCurrent: () => Promise<boolean>;
  isMobile?: boolean | null;
  now: string;
  result: CareerChatTurnResult;
  userId: string;
}) {
  const {
    admin,
    conversation,
    deletedMessage,
    isReengagementAnchorCurrent,
    isMobile,
    now,
    result,
    userId,
  } = args;

  if (conversation.stage === "completed") {
    await admin
      .from("talent_conversations")
      .update({ stage: "completed" })
      .eq("id", conversation.id)
      .eq("user_id", userId);
  }

  if (
    (result.noMessage || result.assistantMessages.length === 0) &&
    (await isReengagementAnchorCurrent())
  ) {
    const { error: insertReengagementError } = await admin
      .from("talent_messages")
      .insert(
        withIsMobile(
          {
            conversation_id: conversation.id,
            user_id: userId,
            role: "assistant",
            content: CAREER_SESSION_START_NO_MESSAGE_MARKER,
            message_type: TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP,
            created_at: now,
          },
          isMobile
        )
      );

    if (insertReengagementError) {
      throw new Error(
        insertReengagementError.message ?? "Failed to insert re-engagement skip"
      );
    }
  }

  return {
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
  };
}

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
    const userInitiated = body?.userInitiated === true;
    const isDevTestRequest = devDeleteLatestMessage || devForce;
    if (
      isDevTestRequest &&
      !canRunDevSessionReengagementTest(user.email ?? null)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getTalentSupabaseAdmin();
    const isMobile = isMobileRequest(req);

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

    const [latestChatResult, latestReengagementSkipResult, talentSetting] =
      await Promise.all([
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
        fetchTalentSetting({ admin, userId: user.id }).catch((error) => {
          console.warn("[TalentSessionReengagement] setting load failed", {
            error: error instanceof Error ? error.message : "Unknown error",
            userId: user.id,
          });
          return null;
        }),
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
    const userInitiatedForce =
      userInitiated &&
      (latestReengagementAnchorAt <= 0 ||
        idleMs >= USER_INITIATED_REENGAGEMENT_IDLE_MS);
    const effectiveIdleMs = devForce
      ? Math.max(idleMs, REENGAGEMENT_IDLE_MS)
      : userInitiatedForce
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
    const proactiveContext = buildCareerSessionStartTurnInstruction({
      currentAccessAt: now,
      idleMs: effectiveIdleMs,
      isOnboardingDone: Boolean(talentSetting?.is_onboarding_done),
      preferredLocale: talentSetting?.preferred_locale ?? null,
      previousChatAt: latestChatMessage?.created_at ?? null,
    });

    if (wantsSseStream(req)) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(createSseMessage(event, data)));
          };

          try {
            const result = await runCareerChatTurn({
              allowedToolNames: [],
              admin,
              conversationId: conversation.id,
              isMobile,
              noMessageMarker: CAREER_SESSION_START_NO_MESSAGE_MARKER,
              onRecommendationStatus: (status) => {
                send("recommendation_search_status", status);
              },
              onThinkingLog: (message) => {
                send("tool_status", { message });
              },
              proactiveContext,
              shouldInsertAssistantMessage: isReengagementAnchorCurrent,
              usageLabel: "career/chat:session_reengagement",
              userId: user.id,
            });
            const payload = await finalizeSessionReengagement({
              admin,
              conversation,
              deletedMessage,
              isReengagementAnchorCurrent,
              isMobile,
              now,
              result,
              userId: user.id,
            });
            send("reengagement_result", payload);
            send("done", { ok: true });
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Failed to run session re-engagement";
            send("error", { error: message });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: createSseHeaders(),
      });
    }

    const result = await runCareerChatTurn({
      allowedToolNames: [],
      admin,
      conversationId: conversation.id,
      isMobile,
      noMessageMarker: CAREER_SESSION_START_NO_MESSAGE_MARKER,
      proactiveContext,
      shouldInsertAssistantMessage: isReengagementAnchorCurrent,
      usageLabel: "career/chat:session_reengagement",
      userId: user.id,
    });
    const payload = await finalizeSessionReengagement({
      admin,
      conversation,
      deletedMessage,
      isReengagementAnchorCurrent,
      isMobile,
      now,
      result,
      userId: user.id,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run session re-engagement";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
