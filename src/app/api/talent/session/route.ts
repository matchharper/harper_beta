import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { warmCache } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  getTalentFirstVisitText,
  TalentConversationRow,
  TalentMessageRow,
  ensureTalentUserRecord,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchVisibleMessagesPage,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  normalizeTalentPreferredLocations,
  sanitizeTalentCareerMoveIntent,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { autoStartClaimedTalentConversation } from "@/lib/talentOnboarding/kickoff";
import { generateTalentReengagementMessage } from "@/lib/talentOnboarding/reengagement";
import {
  getTalentCareerMoveIntentLabel,
  normalizeTalentNetworkApplication,
} from "@/lib/talentNetworkApplication";
import {
  fetchTalentOpportunityHistoryByIds,
  fetchTalentOpportunityHistoryPage,
} from "@/lib/talentOpportunity";
import {
  fetchLatestOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import {
  COMPANY_SNAPSHOT_SETUP_MESSAGE_TYPE,
  toCompanySnapshotResponseMessage,
} from "@/lib/career/companySnapshot";

const REENGAGEMENT_IDLE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OPPORTUNITY_LIMIT = 20;

const getLatestUpdatedAt = (...values: Array<string | null | undefined>) => {
  const timestamps = values
    .map((value) => {
      if (typeof value !== "string") return null;
      const time = Date.parse(value);
      if (Number.isNaN(time)) return null;
      return { time, value };
    })
    .filter(
      (entry): entry is { time: number; value: string } => entry !== null
    );

  if (timestamps.length === 0) return null;

  timestamps.sort((left, right) => right.time - left.time);
  return timestamps[0]?.value ?? null;
};

const parsePositiveIntegerParam = (
  value: string | null,
  fallback: number,
  max: number
) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
};

const parseOffsetParam = (value: string | null) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await warmCache();

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const { data: existing, error: existingError } = await admin
      .from("talent_conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error: existingError.message ?? "Failed to read talent_conversations",
        },
        { status: 500 }
      );
    }

    let conversation = (existing ?? null) as TalentConversationRow | null;

    if (!conversation) {
      const now = new Date().toISOString();
      const { data: inserted, error: insertError } = await admin
        .from("talent_conversations")
        .insert({
          user_id: user.id,
          stage: "profile",
          title: "Career Onboarding",
          relief_nudge_sent: false,
          created_at: now,
          updated_at: now,
        })
        .select("*")
        .single();

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message ?? "Failed to create conversation" },
          { status: 500 }
        );
      }
      conversation = inserted as TalentConversationRow;

      const { error: firstMessageError } = await admin
        .from("talent_messages")
        .insert({
          conversation_id: conversation.id,
          user_id: user.id,
          role: "assistant",
          content: getTalentFirstVisitText(),
          message_type: "system",
        });

      if (firstMessageError) {
        await admin
          .from("talent_conversations")
          .delete()
          .eq("id", conversation.id)
          .eq("user_id", user.id);

        return NextResponse.json(
          {
            error:
              firstMessageError.message ??
              "Failed to initialize first onboarding message",
          },
          { status: 500 }
        );
      }
    }

    let profile = await fetchTalentUserProfile({ admin, userId: user.id });
    if (conversation.stage === "profile") {
      const seeded = await autoStartClaimedTalentConversation({
        admin,
        conversation,
        profile,
        user,
      });
      if (seeded?.conversation) {
        conversation = seeded.conversation;
        profile = await fetchTalentUserProfile({ admin, userId: user.id });
      }
    }

    const rawLimit = Number(
      req.nextUrl.searchParams.get("messageLimit") ?? "20"
    );
    const messageLimit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(Math.floor(rawLimit), 100))
      : 20;
    const rawBeforeMessageId = req.nextUrl.searchParams.get("beforeMessageId");
    const beforeMessageId =
      rawBeforeMessageId && /^\d+$/.test(rawBeforeMessageId)
        ? Number(rawBeforeMessageId)
        : null;
    const opportunityLimit = parsePositiveIntegerParam(
      req.nextUrl.searchParams.get("opportunityLimit"),
      DEFAULT_OPPORTUNITY_LIMIT,
      100
    );
    const opportunityOffset = parseOffsetParam(
      req.nextUrl.searchParams.get("opportunityOffset")
    );
    const allowReengagement =
      !beforeMessageId &&
      req.nextUrl.searchParams.get("allowReengagement") === "1";

    if (allowReengagement && conversation.stage !== "profile") {
      try {
        const { data: latestChatMessage, error: latestChatError } = await admin
          .from("talent_messages")
          .select(
            "id, conversation_id, user_id, role, content, message_type, created_at"
          )
          .eq("conversation_id", conversation.id)
          .eq("message_type", "chat")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestChatError) {
          throw new Error(
            latestChatError.message ?? "Failed to read latest chat message"
          );
        }

        const latestChatAt = latestChatMessage?.created_at
          ? Date.parse(latestChatMessage.created_at)
          : Number.NaN;
        const idleMs =
          Number.isNaN(latestChatAt) || latestChatAt <= 0
            ? 0
            : Date.now() - latestChatAt;

        if (idleMs >= REENGAGEMENT_IDLE_MS) {
          const { messages: recentVisibleMessages } =
            await fetchVisibleMessagesPage({
              admin,
              conversationId: conversation.id,
              limit: 8,
            });

          const assistantContent = await generateTalentReengagementMessage({
            displayName:
              user.user_metadata?.full_name ??
              user.user_metadata?.name ??
              (typeof user.email === "string"
                ? user.email.split("@")[0]
                : "회원"),
            hoursSinceLastChat: Math.max(
              24,
              Math.floor(idleMs / (60 * 60 * 1000))
            ),
            profile,
            recentMessages: recentVisibleMessages as TalentMessageRow[],
          });

          const now = new Date().toISOString();
          const { error: insertReengagementError } = await admin
            .from("talent_messages")
            .insert({
              conversation_id: conversation.id,
              user_id: user.id,
              role: "assistant",
              content: assistantContent,
              message_type: "chat",
              created_at: now,
            });

          if (insertReengagementError) {
            throw new Error(
              insertReengagementError.message ??
                "Failed to insert re-engagement message"
            );
          }

          const { data: updatedConversation, error: updateConversationError } =
            await admin
              .from("talent_conversations")
              .update({ updated_at: now })
              .eq("id", conversation.id)
              .eq("user_id", user.id)
              .select("*")
              .single();

          if (updateConversationError) {
            throw new Error(
              updateConversationError.message ??
                "Failed to update conversation timestamp"
            );
          }

          conversation = updatedConversation as TalentConversationRow;
        }
      } catch (reengagementError) {
        console.error("[TalentSession] re-engagement skipped", {
          userId: user.id,
          conversationId: conversation.id,
          error:
            reengagementError instanceof Error
              ? reengagementError.message
              : "Unknown error",
        });
      }
    }

    const { messages, nextBeforeMessageId } = await fetchVisibleMessagesPage({
      admin,
      conversationId: conversation.id,
      limit: messageLimit,
      beforeMessageId,
    });
    const visibleMessages = messages.filter(
      (message) => !(message.message_type ?? "").startsWith("mock_interview")
    );
    const [
      talentProfile,
      resumeDownloadUrl,
      talentSetting,
      talentInsights,
      talentNotificationsResponse,
      historyOpportunitiesPage,
      latestOpportunityRun,
      activeCompanyRolesResponse,
    ] = await Promise.all([
      fetchTalentStructuredProfile({
        admin,
        userId: user.id,
        talentUser: profile,
      }),
      getTalentResumeSignedUrl({
        admin,
        storagePath: profile?.resume_storage_path,
      }),
      fetchTalentSetting({
        admin,
        userId: user.id,
      }),
      fetchTalentInsights({
        admin,
        userId: user.id,
      }),
      admin
        .from("talent_notification")
        .select("id, message, is_read, created_at")
        .eq("talent_id", user.id)
        .order("created_at", { ascending: false }),
      fetchTalentOpportunityHistoryPage({
        admin,
        limit: opportunityLimit,
        offset: opportunityOffset,
        userId: user.id,
      }),
      fetchLatestOpportunityRun({
        admin,
        userId: user.id,
      }),
      admin
        .from("company_roles")
        .select("role_id", { count: "exact", head: true })
        .eq("status", "active")
        .not("is_expired", "is", true)
        .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`),
    ]);
    const normalizedInsights = normalizeTalentInsightContent(
      talentInsights?.content
    );
    const notifications = talentNotificationsResponse.error
      ? []
      : (talentNotificationsResponse.data ?? []).map((notification) => ({
          id: notification.id,
          message: notification.message ?? null,
          isRead: Boolean(notification.is_read),
          createdAt: notification.created_at,
        }));
    const activeCompanyRoleCount = activeCompanyRolesResponse.error
      ? 0
      : (activeCompanyRolesResponse.count ?? 0);
    const historyOpportunities = historyOpportunitiesPage.items;
    const careerMoveIntent = sanitizeTalentCareerMoveIntent(
      talentSetting?.career_move_intent
    );
    const talentSettingsUpdatedAt = talentSetting?.updated_at ?? null;
    const talentPreferencesUpdatedAt = talentSetting?.updated_at ?? null;
    const talentInsightsUpdatedAt = talentInsights?.last_updated_at ?? null;
    const networkApplicationUpdatedAt = profile?.updated_at ?? null;
    const recentOpportunities = historyOpportunities
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        opportunityType: item.opportunityType,
        title: item.title,
        companyName: item.companyName,
        summary: item.description ?? item.companyDescription ?? null,
        location:
          [item.location, item.workMode].filter(Boolean).join(" / ") || null,
        engagementType:
          item.employmentTypes.length > 0
            ? item.employmentTypes.join(" / ")
            : null,
        matchedAt: item.recommendedAt,
        href: item.href,
      }));
    const messageIds = visibleMessages
      .map((message) => message.id)
      .filter((id): id is number => typeof id === "number");
    const previewByMessageId = new Map<number, typeof historyOpportunities>();

    if (messageIds.length > 0) {
      const { data: previewRows, error: previewError } = await ((
        admin.from("talent_opportunity_chat_preview" as any) as any
      )
        .select("assistant_message_id, recommendation_id, rank")
        .in("assistant_message_id", messageIds)
        .order("rank", { ascending: true }) as any);

      if (!previewError && Array.isArray(previewRows)) {
        const opportunityById = new Map(
          historyOpportunities.map((item) => [item.id, item])
        );
        const missingRecommendationIds = previewRows
          .map((row) => String(row.recommendation_id ?? "").trim())
          .filter((id) => id && !opportunityById.has(id));

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

    return NextResponse.json({
      ok: true,
      activeCompanyRoleCount,
      conversation: {
        id: conversation.id,
        stage: conversation.stage,
        title: conversation.title,
        resumeFileName: profile?.resume_file_name ?? null,
        resumeStoragePath: profile?.resume_storage_path ?? null,
        resumeDownloadUrl,
        resumeLinks: profile?.resume_links ?? [],
        reliefNudgeSent: Boolean(conversation.relief_nudge_sent),
      },
      historyItems: [],
      historyOpportunityCounts: historyOpportunitiesPage.counts,
      historyOpportunities,
      nextOpportunityOffset: historyOpportunitiesPage.nextOffset,
      notifications,
      networkApplication: normalizeTalentNetworkApplication(
        profile?.career_profile ?? profile?.network_application
      ),
      talentPreferences: {
        engagementTypes: normalizeTalentEngagementTypes(
          talentSetting?.engagement_types ?? []
        ),
        preferredLocations: normalizeTalentPreferredLocations(
          talentSetting?.preferred_locations ?? []
        ),
        careerMoveIntent,
        careerMoveIntentLabel: getTalentCareerMoveIntentLabel(careerMoveIntent),
        periodicIntervalDays: normalizeTalentPeriodicIntervalDays(
          talentSetting?.periodic_interval_days
        ),
        recommendationBatchSize: normalizeTalentRecommendationBatchSize(
          talentSetting?.recommendation_batch_size
        ),
      },
      talentInsights: normalizedInsights,
      recentOpportunities,
      profileSettingsMeta: {
        networkApplicationUpdatedAt,
        talentPreferencesUpdatedAt,
        talentInsightsUpdatedAt,
        talentSettingsUpdatedAt,
        latestUpdatedAt: getLatestUpdatedAt(
          networkApplicationUpdatedAt,
          talentPreferencesUpdatedAt,
          talentInsightsUpdatedAt,
          talentSettingsUpdatedAt
        ),
      },
      talentProfile,
      opportunityRun: serializeOpportunityRun(latestOpportunityRun),
      messages: visibleMessages.map((message) => ({
        ...(message.message_type === COMPANY_SNAPSHOT_SETUP_MESSAGE_TYPE
            ? toCompanySnapshotResponseMessage(message as TalentMessageRow)
            : {
                id: message.id,
                role: message.role,
                content: message.content,
                messageType: message.message_type ?? "chat",
                createdAt: message.created_at,
              }),
        opportunityPreview: previewByMessageId.get(message.id) ?? [],
      })),
      nextBeforeMessageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load talent session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
