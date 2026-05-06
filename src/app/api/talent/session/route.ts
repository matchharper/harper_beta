import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { warmCache } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  buildTalentProfileContext,
  countAdditionalOnboardingQuestionSelections,
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
  toTalentMessageResponse,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { autoStartClaimedTalentConversation } from "@/lib/talentOnboarding/kickoff";
import { TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP } from "@/lib/talentOnboarding/onboarding";
import { getTalentCareerMoveIntentLabel } from "@/lib/talentNetworkOptions";
import { fetchRecentMessagesWithSummary } from "@/lib/talentOnboarding/conversationSummary";
import {
  fetchTalentOpportunityHistoryByIds,
  fetchTalentOpportunityHistoryPage,
  fetchTalentPostingCardsByRoleIds,
} from "@/lib/talentOpportunity";
import { extractPostingRoleIdsFromText } from "@/lib/career/postingLinks";
import {
  fetchLatestOpportunityRun,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import { buildCareerTextChatPromptBlocks } from "@/lib/career/prompts";
import { runCareerChatAssistant } from "@/lib/career/llm";
import {
  executeTalentTool,
  getOpenAIChatTools,
  getStopAfterTalentToolNames,
  TALENT_TOOL_NAMES,
} from "@/lib/talentOnboarding/tools";
import { fetchRecentTalentActivitySummaries } from "@/lib/talentOnboarding/activityEvents";

// const REENGAGEMENT_IDLE_MS = 60 * 1000;
const REENGAGEMENT_IDLE_MS = 1 * 60 * 60 * 1000; // 24시간 지나서 접속시 인사
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

const parseTimestampMs = (value: string | null | undefined) => {
  if (typeof value !== "string") return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
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

const SESSION_GREETING_NO_MESSAGE_MARKER = "__NO_SESSION_GREETING__";

const SESSION_GREETING_TOOL_NAMES = new Set<string>([
  TALENT_TOOL_NAMES.READ_TALENT_ACTIVITY_EVENTS,
  TALENT_TOOL_NAMES.READ_RECOMMENDED_OPPORTUNITIES,
]);

function buildSessionStartInstruction(args: {
  currentAccessAt: string;
  idleMs: number;
  previousChatAt: string | null;
}) {
  const idleHours = Math.max(0, Math.floor(args.idleMs / (60 * 60 * 1000)));

  return [
    "## Session-start assistant turn",
    "사용자가 방금 Career 화면에 다시 접속했다. 사용자가 아직 새 메시지를 보내지 않았지만, Harper가 먼저 짧게 말을 건넬 수 있는 차례다.",
    `- currentAccessAt: ${args.currentAccessAt}`,
    `- previousChatAt: ${args.previousChatAt ?? "(없음)"}`,
    `- hoursSincePreviousChat: ${idleHours}`,
    "대화 맥락상 지금 아무 말도 하지 않는 편이 더 자연스럽거나 도움이 되지 않는다고 판단되면 아무 것도 출력하지 않아도 된다.",
    `아무 말도 하지 않기로 결정하면 응답 본문을 비우거나 ${SESSION_GREETING_NO_MESSAGE_MARKER} 만 출력해라. 이 경우 다른 설명을 붙이지 마라.`,
    "이전 대화 맥락을 이어서 말하고, 처음 온 사람처럼 Harper를 길게 소개하지 마라.",
    "최근 Career 활동이나 프로필 변경 혹은 이전 추천 등이 필요하면 적절한 tool을 사용해라. (read_talent_activity_events, read_recommended_opportunities 등)",
    // "이미 추천된 기회나 사용자의 피드백을 짧게 짚는 것이 자연스러우면 `read_recommended_opportunities`를 호출해라.",
    "정확한 시각, 내부 이벤트명, 시스템 동작 방식은 사용자에게 말하지 마라.",
    "메시지를 보낼 때는 1-3문장으로 끝내라. 질문은 선택 사항이다. 사용자가 답하지 않아도 되는 단순 상태 업데이트나 피드백 반영 상황이면 질문 없이 닫아라.",
    "질문이 꼭 필요할 때만 사용자가 바로 쉽게 답할 수 있는 질문을 하나만 던져라.",
    "텍스트 채팅에 표시되므로 필요하면 회사명, 역할명, 방향성 같은 핵심 단어에 가벼운 inline markdown 강조(**...**)를 사용해라. 긴 heading이나 bullet list는 쓰지 마라.",
  ].join("\n");
}

function normalizeSessionStartGreeting(content: string) {
  const normalized = content
    .replace(/^[`"'“”]+|[`"'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;
  const markerCandidate = normalized
    .replace(/^[`"'“”]+|[`"'“”.。]+$/g, "")
    .trim();
  if (markerCandidate === SESSION_GREETING_NO_MESSAGE_MARKER) return null;
  return normalized;
}

async function generateSessionStartGreeting(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
  currentAccessAt: string;
  idleMs: number;
  previousChatAt: string | null;
  profile: Awaited<ReturnType<typeof fetchTalentUserProfile>>;
  userId: string;
}) {
  const {
    admin,
    conversationId,
    currentAccessAt,
    idleMs,
    previousChatAt,
    profile,
    userId,
  } = args;

  const [
    currentInsights,
    talentSetting,
    additionalQuestionSelectionCount,
    structuredProfile,
    recentMessages,
    recentActivitySummaries,
  ] = await Promise.all([
    fetchTalentInsights({ admin, userId }),
    fetchTalentSetting({ admin, userId }),
    countAdditionalOnboardingQuestionSelections({
      admin,
      conversationId,
    }),
    fetchTalentStructuredProfile({
      admin,
      userId,
      talentUser: profile,
    }),
    fetchRecentMessagesWithSummary({
      admin,
      conversationId,
      recentLimit: 12,
      userId,
    }),
    fetchRecentTalentActivitySummaries({
      admin,
      limit: 5,
      userId,
    }),
  ]);

  const structuredProfileText = buildTalentProfileContext({
    profile,
    structuredProfile,
    setting: talentSetting,
    maxResumeChars: 3000,
  });
  const currentInsightContent = (currentInsights?.content ?? null) as Record<
    string,
    string
  > | null;
  const currentPreferences = {
    engagementTypes: talentSetting?.engagement_types ?? [],
    preferredLocations: talentSetting?.preferred_locations ?? [],
    careerMoveIntent: talentSetting?.career_move_intent ?? null,
    careerMoveIntentLabel: getTalentCareerMoveIntentLabel(
      talentSetting?.career_move_intent ?? null
    ),
    periodicIntervalDays: talentSetting?.periodic_interval_days ?? null,
    recommendationBatchSize: talentSetting?.recommendation_batch_size ?? null,
  };
  const toolDefinitions = getOpenAIChatTools("chat").filter((tool) =>
    SESSION_GREETING_TOOL_NAMES.has(tool.function.name)
  );
  const { promptBlocks } = buildCareerTextChatPromptBlocks({
    additionalQuestionSelectionCount,
    currentInsightContent,
    currentPreferences,
    isOnboardingDone: talentSetting?.is_onboarding_done,
    profile,
    recentActivitySummaries,
    sessionStartInstruction: buildSessionStartInstruction({
      currentAccessAt,
      idleMs,
      previousChatAt,
    }),
    structuredProfileText,
    toolNames: toolDefinitions.map((tool) => tool.function.name),
  });
  const llmMessages = recentMessages
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: item.content,
    }))
    .filter((item) => item.content.trim().length > 0);

  llmMessages.push({
    role: "user",
    content:
      `[Career session event] 사용자가 방금 Career 화면에 다시 접속했습니다. 새 메시지는 아직 보내지 않았습니다. 위 Session-start assistant turn 지시에 따라 필요하면 먼저 짧게 말하고, 아무 말도 하지 않는 게 맞으면 ${SESSION_GREETING_NO_MESSAGE_MARKER} 만 출력하세요.`,
  });

  const assistantText = await runCareerChatAssistant({
    executeTool: ({ name, input }) =>
      executeTalentTool({
        context: {
          admin,
          conversationId,
          userId,
        },
        input,
        logging: false,
        name,
      }),
    messages: llmMessages,
    stopAfterToolNames: getStopAfterTalentToolNames("chat").filter((name) =>
      SESSION_GREETING_TOOL_NAMES.has(name)
    ),
    systemBlocks: promptBlocks,
    tools: toolDefinitions,
  });

  return normalizeSessionStartGreeting(assistantText);
}

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
        const [latestChatResult, latestReengagementSkipResult] =
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
              .eq(
                "message_type",
                TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP
              )
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

        if (idleMs >= REENGAGEMENT_IDLE_MS) {
          const now = new Date().toISOString();
          const assistantContent = await generateSessionStartGreeting({
            admin,
            conversationId: conversation.id,
            currentAccessAt: now,
            idleMs,
            previousChatAt: latestChatMessage?.created_at ?? null,
            profile,
            userId: user.id,
          });

          const { error: insertReengagementError } = await admin
            .from("talent_messages")
            .insert({
              conversation_id: conversation.id,
              user_id: user.id,
              role: "assistant",
              content: assistantContent ?? SESSION_GREETING_NO_MESSAGE_MARKER,
              message_type: assistantContent
                ? "chat"
                : TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP,
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
    const postingRoleIdsByMessageId = new Map<number, string[]>();

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

    for (const message of visibleMessages) {
      const messageId = Number(message.id);
      if (!Number.isFinite(messageId)) continue;
      const postingRoleIds = extractPostingRoleIdsFromText(
        String(message.content ?? "")
      ).slice(0, 1);
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
        talentPreferencesUpdatedAt,
        talentInsightsUpdatedAt,
        talentSettingsUpdatedAt,
        latestUpdatedAt: getLatestUpdatedAt(
          talentPreferencesUpdatedAt,
          talentInsightsUpdatedAt,
          talentSettingsUpdatedAt
        ),
      },
      talentProfile,
      opportunityRun: serializeOpportunityRun(latestOpportunityRun),
      messages: visibleMessages.map((message) => ({
        ...toTalentMessageResponse(message as TalentMessageRow),
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
