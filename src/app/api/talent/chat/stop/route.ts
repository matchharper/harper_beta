import { after, NextRequest, NextResponse } from "next/server";

import { getRequestUser } from "@/lib/supabaseServer";
import {
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import {
  splitRecommendJobPostingStatusLogs,
  upsertRecommendJobPostingStatusLog,
} from "@/lib/talentOnboarding/recommendJobPostingStatus";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";
import { stripPostgresUnsafeChars } from "@/lib/textSanitization";
import { cancelCareerTurnWork } from "@/lib/career/turnCancellation.server";

type Body = {
  clientRequestId?: unknown;
  clientRequestIds?: unknown;
  stopAll?: boolean;
  assistantMessage?: {
    content?: unknown;
    recommendationStatusAfterCharCount?: unknown;
    thinkingLogs?: unknown;
  };
  conversationId?: unknown;
  userMessageId?: unknown;
};

const parseMessageId = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const conversationId = String(body.conversationId ?? "").trim();
    let userMessageId = parseMessageId(body.userMessageId);
    const assistantContent =
      typeof body.assistantMessage?.content === "string"
        ? stripPostgresUnsafeChars(body.assistantMessage.content)
        : "";
    const recommendationStatusAfterCharCount =
      typeof body.assistantMessage?.recommendationStatusAfterCharCount ===
        "number" &&
      Number.isFinite(
        body.assistantMessage.recommendationStatusAfterCharCount
      ) &&
      body.assistantMessage.recommendationStatusAfterCharCount > 0 &&
      body.assistantMessage.recommendationStatusAfterCharCount <=
        assistantContent.length
        ? Math.floor(body.assistantMessage.recommendationStatusAfterCharCount)
        : null;
    const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId : "";
    if (!conversationId || (!body.stopAll && !userMessageId && !/^[0-9a-f-]{36}$/i.test(clientRequestId))) {
      return NextResponse.json(
        { error: "conversationId and userMessageId are required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    let stoppedUserMessages: TalentMessageRow[] = [];
    if (body.stopAll) {
      const owned = await admin.from("talent_conversations").select("id")
        .eq("id", conversationId).eq("user_id", user.id).maybeSingle();
      if (owned.error) throw owned.error;
      if (!owned.data) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      const requestIds = [...new Set([clientRequestId, ...(Array.isArray(body.clientRequestIds) ? body.clientRequestIds : [])]
        .filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))];
      const { data, error } = await (admin.rpc as any)("stop_career_conversation", {
        p_user_id: user.id, p_conversation_id: conversationId,
        p_client_request_ids: requestIds, p_source_message_id: userMessageId,
      });
      if (error) throw error;
      stoppedUserMessages = data.userMessages;
      after(async () => {
        const { publishCareerInvocations } = await import("@/lib/career/work/invocations");
        await publishCareerInvocations({ admin, userId: user.id, conversationId });
      });
      // The streaming path below also preserves any text already shown to the user.
      if (!userMessageId || !assistantContent.trim()) return NextResponse.json({ ok: true,
        userMessages: stoppedUserMessages.map(toTalentMessageResponse), userMessage: null, assistantMessage: null });
    }
    if (!userMessageId) {
      const conversation = await admin.from("talent_conversations").select("id")
        .eq("id", conversationId).eq("user_id", user.id).maybeSingle();
      if (conversation.error) throw conversation.error;
      if (!conversation.data) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      // A Stop can arrive before the first SSE event. Save that real user
      // action before looking for its source; the inserting route checks it too.
      const receipt = await admin.from("talent_messages").insert({
        user_id: user.id, conversation_id: conversationId, role: "user",
        message_type: "career_turn_stop", content: "",
        payload: { hidden: true, clientRequestId },
      });
      if (receipt.error) throw receipt.error;
      const source = await admin.from("talent_messages").select("id")
        .eq("user_id", user.id).eq("conversation_id", conversationId).eq("role", "user")
        .neq("message_type", "career_turn_stop").eq("payload->>clientRequestId", clientRequestId)
        .order("id", { ascending: false }).limit(1).maybeSingle();
      if (source.error) throw source.error;
      if (!source.data) return NextResponse.json({ ok: true, userMessage: null, assistantMessage: null });
      userMessageId = source.data.id;
    }
    const { data: sourceMessage, error: sourceError } = await admin
      .from("talent_messages")
      .select("*")
      .eq("id", userMessageId)
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .eq("role", "user")
      .maybeSingle();

    if (sourceError) {
      throw new Error(sourceError.message ?? "Failed to load chat turn");
    }
    if (!sourceMessage) {
      return NextResponse.json(
        { error: "Chat turn not found" },
        { status: 404 }
      );
    }

    const stoppedStatus = { state: "stopped" } as const;
    let current = sourceMessage;
    let stoppedMessage: TalentMessageRow | null = null;
    // The runtime also writes capability metadata to this payload. Preserve it
    // with the same compare-and-swap contract used by that writer.
    for (let attempt = 0; attempt < 3; attempt++) {
      const currentLogs = Array.isArray(current.thinking_logs)
        ? current.thinking_logs.filter((log): log is string => typeof log === "string") : [];
      const thinkingLogs = splitRecommendJobPostingStatusLogs(currentLogs).latestStatus
        ? upsertRecommendJobPostingStatusLog(current.thinking_logs, stoppedStatus)
        : current.thinking_logs;
      const payload = current.payload && typeof current.payload === "object" && !Array.isArray(current.payload)
        ? current.payload : {};
      let query = admin.from("talent_messages")
        .update({ payload: { ...payload, careerTurnStopped: true }, thinking_logs: thinkingLogs })
        .eq("id", userMessageId).eq("conversation_id", conversationId)
        .eq("user_id", user.id).eq("role", "user");
      query = current.payload === null ? query.is("payload", null)
        : query.filter("payload", "eq", JSON.stringify(current.payload));
      const saved = await query.select("*").maybeSingle();
      if (saved.error) throw saved.error;
      if (saved.data) { stoppedMessage = saved.data as TalentMessageRow; break; }
      const fresh = await admin.from("talent_messages").select("*")
        .eq("id", userMessageId).eq("conversation_id", conversationId)
        .eq("user_id", user.id).eq("role", "user").single();
      if (fresh.error) throw fresh.error;
      current = fresh.data;
    }
    if (!stoppedMessage) throw new Error("Chat turn changed while stopping; retry Stop");
    await cancelCareerTurnWork({ admin, userId: user.id, conversationId, sourceMessageId: userMessageId });

    let stoppedAssistant: TalentMessageRow | null = null;
    if (assistantContent.trim()) {
      const sourceLogs = Array.isArray(body.assistantMessage?.thinkingLogs)
        ? body.assistantMessage.thinkingLogs.filter(
            (log): log is string => typeof log === "string"
          )
        : [];
      const assistantThinkingLogs = splitRecommendJobPostingStatusLogs(sourceLogs).latestStatus
        ? upsertRecommendJobPostingStatusLog(sourceLogs, {
          ...splitRecommendJobPostingStatusLogs(sourceLogs).latestStatus,
          ...stoppedStatus,
        }) : sourceLogs;
      const { data: existingStoppedAssistant, error: existingAssistantError } =
        await admin
          .from("talent_messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id)
          .eq("role", "assistant")
          .eq("content", assistantContent)
          .eq("payload->>careerTurnSourceMessageId", String(userMessageId))
          .gt("id", userMessageId)
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();

      if (existingAssistantError) {
        throw new Error(
          existingAssistantError.message ??
            "Failed to load stopped assistant message"
        );
      }

      if (existingStoppedAssistant) {
        const { data: updatedStoppedAssistant, error: assistantError } =
          await admin
            .from("talent_messages")
            .update({ thinking_logs: assistantThinkingLogs,
              payload: { ...(existingStoppedAssistant.payload && typeof existingStoppedAssistant.payload === "object" && !Array.isArray(existingStoppedAssistant.payload) ? existingStoppedAssistant.payload : {}), careerTurnStopped: true } })
            .eq("id", existingStoppedAssistant.id)
            .eq("conversation_id", conversationId)
            .eq("user_id", user.id)
            .eq("role", "assistant")
            .select("*")
            .single();

        if (assistantError || !updatedStoppedAssistant) {
          throw new Error(
            assistantError?.message ??
              "Failed to update stopped assistant message"
          );
        }
        stoppedAssistant = updatedStoppedAssistant as TalentMessageRow;
      } else {
        const { data: insertedStoppedAssistant, error: assistantError } =
          await admin
            .from("talent_messages")
            .insert(
              withIsMobile(
                {
                  conversation_id: conversationId,
                  user_id: user.id,
                  role: "assistant",
                  content: assistantContent,
                  message_type: "chat",
                  thinking_logs: assistantThinkingLogs,
                  payload: { careerTurnStopped: true, careerTurnSourceMessageId: userMessageId },
                },
                isMobileRequest(req)
              )
            )
            .select("*")
            .single();

        if (assistantError || !insertedStoppedAssistant) {
          throw new Error(
            assistantError?.message ??
              "Failed to save stopped assistant message"
          );
        }
        stoppedAssistant = insertedStoppedAssistant as TalentMessageRow;
      }
    }

    const stoppedAssistantResponse = stoppedAssistant
      ? {
          ...toTalentMessageResponse(stoppedAssistant),
          ...(recommendationStatusAfterCharCount === null
            ? {}
            : { recommendationStatusAfterCharCount }),
        }
      : null;

    return NextResponse.json({
      ok: true,
      userMessages: stoppedUserMessages.map(toTalentMessageResponse),
      userMessage: toTalentMessageResponse(
        stoppedMessage as unknown as TalentMessageRow
      ),
      assistantMessage: stoppedAssistantResponse,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to stop chat turn";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
