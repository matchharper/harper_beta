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

    return NextResponse.json({
      ok: true,
      conversation: {
        id: conversation.id,
        stage: conversation.stage,
      },
      messages: visibleMessages.map((message) => ({
        ...toTalentMessageResponse(message as TalentMessageRow),
        opportunityPreview: previewByMessageId.get(message.id) ?? [],
      })),
      nextBeforeMessageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load messages";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
