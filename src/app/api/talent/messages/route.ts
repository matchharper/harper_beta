import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchVisibleMessagesPage,
  getTalentSupabaseAdmin,
  toTalentMessageResponse,
  type TalentConversationRow,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/server";
import {
  fetchTalentOpportunityHistoryByIds,
  fetchTalentPostingCardsByRoleIds,
} from "@/lib/talentOpportunity";
import { extractPostingRoleIdsFromText } from "@/lib/career/postingLinks";
import { hydrateOpportunityRunsForMessages } from "@/lib/opportunityDiscovery/store";
import { canUseCareerDevControls } from "@/lib/internalAccess";

const parsePositiveIntegerParam = (
  value: string | null,
  fallback: number,
  max: number
) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
};

const parseBeforeMessageIdParam = (value: string | null) =>
  value && /^\d+$/.test(value) ? Number(value) : null;

const parsePositiveMessageId = (value: unknown) => {
  const messageId = Number(value);
  return Number.isSafeInteger(messageId) && messageId > 0 ? messageId : null;
};

async function fetchConversation(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string | null;
  userId: string;
}) {
  let query = args.admin
    .from("talent_conversations")
    .select("*")
    .eq("user_id", args.userId);

  if (args.conversationId) {
    query = query.eq("id", args.conversationId);
  }

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read talent_conversations");
  }

  return (data ?? null) as TalentConversationRow | null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const conversationId =
      req.nextUrl.searchParams.get("conversationId")?.trim() || null;
    const messageLimit = parsePositiveIntegerParam(
      req.nextUrl.searchParams.get("messageLimit"),
      20,
      100
    );
    const beforeMessageId = parseBeforeMessageIdParam(
      req.nextUrl.searchParams.get("beforeMessageId")
    );
    const locale =
      req.nextUrl.searchParams.get("locale") ??
      req.cookies.get("NEXT_LOCALE")?.value ??
      null;
    const conversation = await fetchConversation({
      admin,
      conversationId,
      userId: user.id,
    });

    if (!conversation) {
      return NextResponse.json({
        ok: true,
        conversation: null,
        messages: [],
        nextBeforeMessageId: null,
      });
    }

    const { messages, nextBeforeMessageId } = await fetchVisibleMessagesPage({
      admin,
      beforeMessageId,
      conversationId: conversation.id,
      limit: messageLimit,
    });
    const visibleMessages = messages.filter(
      (message) => !(message.message_type ?? "").startsWith("mock_interview")
    );
    const messageIds = visibleMessages
      .map((message) => message.id)
      .filter((id): id is number => typeof id === "number");
    const previewByMessageId = new Map<
      number,
      Awaited<ReturnType<typeof fetchTalentOpportunityHistoryByIds>>
    >();
    const postingRoleIdsByMessageId = new Map<number, string[]>();

    if (messageIds.length > 0) {
      const { data: previewRows, error: previewError } = await ((
        admin.from("talent_opportunity_chat_preview" as any) as any
      )
        .select("assistant_message_id, recommendation_id, rank")
        .in("assistant_message_id", messageIds)
        .order("rank", { ascending: true }) as any);

      if (!previewError && Array.isArray(previewRows)) {
        const opportunityById = new Map<
          string,
          Awaited<ReturnType<typeof fetchTalentOpportunityHistoryByIds>>[number]
        >();
        const missingRecommendationIds = previewRows
          .map((row) => String(row.recommendation_id ?? "").trim())
          .filter(Boolean);

        if (missingRecommendationIds.length > 0) {
          const previewOpportunities = await fetchTalentOpportunityHistoryByIds(
            {
              admin,
              ids: missingRecommendationIds,
              locale,
              userId: user.id,
            }
          );

          for (const item of previewOpportunities) {
            opportunityById.set(item.id, item);
          }
        }

        for (const row of previewRows) {
          const messageId = Number(row.assistant_message_id);
          const item = opportunityById.get(String(row.recommendation_id));
          if (!Number.isFinite(messageId) || !item) continue;
          const current = previewByMessageId.get(messageId) ?? [];
          current.push(item);
          previewByMessageId.set(messageId, current);
        }
      }
    }

    for (const message of visibleMessages) {
      const messageId = Number(message.id);
      if (!Number.isFinite(messageId)) continue;
      const postingRoleIds = extractPostingRoleIdsFromText(
        String(message.content ?? "")
      );
      if (postingRoleIds.length > 0) {
        postingRoleIdsByMessageId.set(messageId, postingRoleIds);
      }
    }

    const postingRoleIds = Array.from(
      new Set(
        Array.from(postingRoleIdsByMessageId.values()).flatMap((ids) => ids)
      )
    );
    if (postingRoleIds.length > 0) {
      const postingCards = await fetchTalentPostingCardsByRoleIds({
        admin,
        locale,
        roleIds: postingRoleIds,
        userId: user.id,
      });
      const postingCardByRoleId = new Map(
        postingCards.map((item) => [item.roleId, item])
      );

      for (const [messageId, roleIds] of Array.from(
        postingRoleIdsByMessageId.entries()
      )) {
        const current = previewByMessageId.get(messageId) ?? [];
        const seenRoleIds = new Set(current.map((item) => item.roleId));
        const next = [...current];

        for (const roleId of roleIds) {
          const item = postingCardByRoleId.get(roleId);
          if (!item || seenRoleIds.has(item.roleId)) continue;
          seenRoleIds.add(item.roleId);
          next.push(item);
        }

        if (next.length > 0) {
          previewByMessageId.set(messageId, next);
        }
      }
    }

    const serializedMessages = visibleMessages.map((message) => ({
      ...toTalentMessageResponse(message as TalentMessageRow),
      opportunityPreview: previewByMessageId.get(message.id) ?? [],
    }));
    let hydratedMessages = serializedMessages;
    try {
      hydratedMessages = await hydrateOpportunityRunsForMessages({
        admin,
        messages: serializedMessages,
        userId: user.id,
      });
    } catch (error) {
      console.warn(
        "[career] Failed to hydrate recommendation search status for messages",
        error
      );
    }

    return NextResponse.json({
      ok: true,
      conversation: {
        id: conversation.id,
        stage: conversation.stage,
      },
      messages: hydratedMessages,
      nextBeforeMessageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load messages";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canUseCareerDevControls(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      conversationId?: unknown;
      messageId?: unknown;
    };
    const conversationId = String(body.conversationId ?? "").trim();
    const messageId = parsePositiveMessageId(body.messageId);
    if (!conversationId || messageId === null) {
      return NextResponse.json(
        { error: "conversationId and messageId are required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const { data: message, error: messageError } = await admin
      .from("talent_messages")
      .select("id")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (messageError) {
      throw new Error(messageError.message ?? "Failed to read talent message");
    }
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const cleanupResults = await Promise.all([
      (admin.from("talent_opportunity_chat_preview" as any) as any)
        .delete()
        .eq("assistant_message_id", messageId),
      admin
        .from("talent_activity_events")
        .delete()
        .eq("talent_id", user.id)
        .eq("message_id", messageId),
      (admin.from("talent_conversation_summaries" as any) as any)
        .delete()
        .eq("talent_id", user.id)
        .eq("conversation_id", conversationId)
        .or(`from_message_id.eq.${messageId},to_message_id.eq.${messageId}`),
      admin
        .from("career_email_messages")
        .update({ talent_message_id: null })
        .eq("talent_id", user.id)
        .eq("talent_message_id", messageId),
      admin
        .from("company_talent_requests")
        .update({ talent_source_message_id: null })
        .eq("talent_id", user.id)
        .eq("talent_source_message_id", messageId),
    ]);
    const cleanupError = cleanupResults.find((result) => result.error)?.error;
    if (cleanupError) {
      throw new Error(cleanupError.message ?? "Failed to clean up talent message");
    }

    const { error: deleteError } = await admin
      .from("talent_messages")
      .delete()
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id);
    if (deleteError) {
      throw new Error(deleteError.message ?? "Failed to delete talent message");
    }

    return NextResponse.json({ ok: true, deletedMessageId: messageId });
  } catch (error) {
    console.error("[career] Failed to delete dev message", error);
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 }
    );
  }
}
