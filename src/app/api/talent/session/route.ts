import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  fetchTalentDocuments,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchVisibleMessagesPage,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getCareerOnboardingChecklistCoverage,
  getOnboardingChecklistCoverageStats,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
  markTalentUserLoggedIn,
  normalizeTalentEngagementTypes,
  normalizeTalentInsightContent,
  pickLatestResumeDocument,
  serializeTalentDocuments,
  serializeOnboardingChecklistProgress,
  type TalentConversationRow,
  type TalentMessageRow,
  type TalentStructuredProfile,
  type TalentUserProfileRow,
  toTalentMessageResponse,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { autoStartClaimedTalentConversation } from "@/lib/talentOnboarding/kickoff";
import { TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP } from "@/lib/talentOnboarding/onboarding";
import {
  fetchTalentOpportunityHistoryByIds,
  fetchTalentOpportunityHistoryPage,
  fetchTalentPostingCardsByRoleIds,
  type TalentOpportunityHistoryPage,
} from "@/lib/talentOpportunity";
import { extractPostingRoleIdsFromText } from "@/lib/career/postingLinks";
import {
  fetchActiveOpportunityRunsForConversation,
  fetchLatestOpportunityRun,
  hydrateOpportunityRunsForMessages,
  serializeOpportunityRun,
} from "@/lib/opportunityDiscovery/store";
import { runCareerChatTurn } from "@/lib/career/chatTurn";
import {
  buildCareerSessionStartTurnInstruction,
  CAREER_SESSION_START_NO_MESSAGE_MARKER,
} from "@/lib/career/prompts";
import { resolveCareerReengagementActionKeys } from "@/lib/career/reengagementActions";
import { fetchPendingInternalOpportunityCallRequests } from "@/lib/talentOnboarding/internalOpportunityCallRequest";
import { isMobileRequest, withIsMobile } from "@/lib/requestDevice";
import { syncVerifiedTalentAccountEmail } from "@/lib/talentOnboarding/accountEmail";

// const REENGAGEMENT_IDLE_MS = 60 * 1000;
const REENGAGEMENT_IDLE_MS = 12 * 60 * 60 * 1000; // 12시간 지나서 접속시 인사
const DEFAULT_OPPORTUNITY_LIMIT = 10;
const ACTIVE_COMPANY_ROLE_COUNT_BASE = 202_598;
const ACTIVE_COMPANY_ROLE_COUNT_DAILY_VARIATION = 200;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

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

const parseNonNegativeIntegerParam = (
  value: string | null,
  fallback: number,
  max: number
) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(Math.floor(parsed), max));
};

const parseOffsetParam = (value: string | null) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const normalizeProfileSignalText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const hasProfileResumeLink = (value: unknown) =>
  Array.isArray(value) &&
  value.some((entry) => normalizeProfileSignalText(entry).length > 0);

const hasTalentFirstSubmission = (
  profile: {
    resume_file_name?: unknown;
    resume_links?: unknown;
    resume_storage_path?: unknown;
    resume_text?: unknown;
  } | null
) =>
  Boolean(
    normalizeProfileSignalText(profile?.resume_file_name) ||
    normalizeProfileSignalText(profile?.resume_storage_path) ||
    normalizeProfileSignalText(profile?.resume_text) ||
    hasProfileResumeLink(profile?.resume_links)
  );

const createEmptyHistoryCounts = () => ({
  archived: 0,
  new: 0,
  newInternal: 0,
  saved: 0,
  savedStages: {
    saved: 0,
    applied: 0,
    connected: 0,
    closed: 0,
    hidden: 0,
  },
  total: 0,
});

const createEmptyHistoryPage = (
  limit: number,
  offset: number
): TalentOpportunityHistoryPage => ({
  counts: createEmptyHistoryCounts(),
  items: [],
  limit,
  nextOffset: null,
  offset,
});

const createFallbackTalentProfile = (
  profile: TalentUserProfileRow | null
): TalentStructuredProfile => ({
  talentUser: profile
    ? {
        user_id: profile.user_id,
        email: profile.email,
        phone_number: profile.phone_number,
        name: profile.name,
        profile_picture: profile.profile_picture,
        headline: profile.headline,
        bio: profile.bio,
        location: profile.location,
        current_location: profile.current_location,
      }
    : null,
  talentExperiences: [],
  talentEducations: [],
  talentExtras: [],
});

async function withSessionFallback<T>(args: {
  fallback: T;
  label: string;
  promise: Promise<T>;
  userId: string;
}): Promise<T> {
  try {
    return await args.promise;
  } catch (error) {
    console.warn(`[TalentSession] optional load failed: ${args.label}`, {
      error: error instanceof Error ? error.message : "Unknown error",
      userId: args.userId,
    });
    return args.fallback;
  }
}

function getKstDateKey(date = new Date()) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function getDeterministicDailyOffset(dateKey: string) {
  let hash = 2166136261;
  for (let index = 0; index < dateKey.length; index += 1) {
    hash ^= dateKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const range = ACTIVE_COMPANY_ROLE_COUNT_DAILY_VARIATION * 2 + 1;
  return ((hash >>> 0) % range) - ACTIVE_COMPANY_ROLE_COUNT_DAILY_VARIATION;
}

async function fetchActiveCompanyRoleCount() {
  return Math.max(
    0,
    ACTIVE_COMPANY_ROLE_COUNT_BASE +
      getDeterministicDailyOffset(getKstDateKey())
  );
}

async function generateSessionStartGreeting(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
  currentAccessAt: string;
  idleMs: number;
  isOnboardingDone: boolean;
  isMobile?: boolean | null;
  preferredLocale?: string | null;
  previousChatAt: string | null;
  userId: string;
}) {
  const {
    admin,
    conversationId,
    currentAccessAt,
    idleMs,
    previousChatAt,
    userId,
  } = args;

  const result = await runCareerChatTurn({
    allowedToolNames: [],
    admin,
    conversationId,
    isMobile: args.isMobile,
    noMessageMarker: CAREER_SESSION_START_NO_MESSAGE_MARKER,
    proactiveContext: buildCareerSessionStartTurnInstruction({
      currentAccessAt,
      idleMs,
      isOnboardingDone: args.isOnboardingDone,
      preferredLocale: args.preferredLocale,
      previousChatAt,
    }),
    transformAssistantTextBeforeInsert: (content) =>
      resolveCareerReengagementActionKeys({
        content,
        resolvePendingActionRef: () => null,
      }),
    usageLabel: "career/chat:session_start_greeting",
    userId,
  });

  return result.assistantMessage?.content ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const isMobile = isMobileRequest(req);
    await ensureTalentUserRecord({ admin, user });
    await syncVerifiedTalentAccountEmail({ admin, user }).catch((error) => {
      console.warn("[TalentSession] verified email sync skipped", {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: user.id,
      });
    });
    await markTalentUserLoggedIn({ admin, userId: user.id });
    const initialTalentSetting = await withSessionFallback({
      fallback: null,
      label: "initial talent setting",
      promise: fetchTalentSetting({
        admin,
        userId: user.id,
      }),
      userId: user.id,
    });
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
    }

    let profile = await fetchTalentUserProfile({ admin, userId: user.id });
    if (conversation.stage === "profile") {
      const seeded = await autoStartClaimedTalentConversation({
        admin,
        conversation,
        isMobile,
        profile,
        user,
      });
      if (seeded?.conversation) {
        conversation = seeded.conversation;
        profile = await fetchTalentUserProfile({ admin, userId: user.id });
      }
    }

    const talentDocuments = await withSessionFallback({
      fallback: [],
      label: "talent documents",
      promise: fetchTalentDocuments({ admin, userId: user.id }),
      userId: user.id,
    });
    const latestResumeDocument = pickLatestResumeDocument(talentDocuments);

    if (req.nextUrl.searchParams.get("statusOnly") === "1") {
      const hasFirstSubmission =
        Boolean(latestResumeDocument) || hasTalentFirstSubmission(profile);
      const isOnboardingDone = Boolean(
        initialTalentSetting?.is_onboarding_done
      );
      const profileIngestionStatus =
        conversation.profile_ingestion_status?.trim() || null;
      const isProfileIngestionIncomplete =
        profileIngestionStatus === "processing" ||
        profileIngestionStatus === "failed";
      const needsOnboarding =
        isProfileIngestionIncomplete ||
        (!hasFirstSubmission && !isOnboardingDone);

      return NextResponse.json({
        ok: true,
        hasFirstSubmission,
        needsOnboarding,
        conversation: {
          id: conversation.id,
          stage: conversation.stage,
          resumeFileName:
            latestResumeDocument?.file_name ??
            profile?.resume_file_name ??
            null,
          resumeStoragePath:
            latestResumeDocument?.storage_path ??
            profile?.resume_storage_path ??
            null,
          resumeDownloadUrl: null,
          resumeLinks: profile?.resume_links ?? [],
          reliefNudgeSent: Boolean(conversation.relief_nudge_sent),
          profileIngestionError: conversation.profile_ingestion_error ?? null,
          profileIngestionStatus,
          profileIngestionUpdatedAt:
            conversation.profile_ingestion_updated_at ?? null,
        },
        messages: [],
        nextBeforeMessageId: null,
      });
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
    const opportunityLimit = parseNonNegativeIntegerParam(
      req.nextUrl.searchParams.get("opportunityLimit"),
      DEFAULT_OPPORTUNITY_LIMIT,
      100
    );
    const opportunityOffset = parseOffsetParam(
      req.nextUrl.searchParams.get("opportunityOffset")
    );
    const historyOpportunitiesIncluded = opportunityLimit > 0;
    const shouldLoadOpportunityPage =
      historyOpportunitiesIncluded || beforeMessageId === null;
    const historyFetchLimit = historyOpportunitiesIncluded
      ? opportunityLimit
      : 0;
    const historyFetchOffset = historyOpportunitiesIncluded
      ? opportunityOffset
      : 0;
    const allowReengagement =
      !beforeMessageId &&
      req.nextUrl.searchParams.get("allowReengagement") === "1";

    if (allowReengagement && conversation.stage !== "profile") {
      try {
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
            withSessionFallback({
              fallback: null,
              label: "talent setting",
              promise: fetchTalentSetting({
                admin,
                userId: user.id,
              }),
              userId: user.id,
            }),
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
            isOnboardingDone: Boolean(talentSetting?.is_onboarding_done),
            isMobile,
            preferredLocale: talentSetting?.preferred_locale ?? null,
            previousChatAt: latestChatMessage?.created_at ?? null,
            userId: user.id,
          });

          if (!assistantContent) {
            const { error: insertReengagementError } = await admin
              .from("talent_messages")
              .insert(
                withIsMobile(
                  {
                    conversation_id: conversation.id,
                    user_id: user.id,
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
                insertReengagementError.message ??
                  "Failed to insert re-engagement skip"
              );
            }
          }

          const conversationUpdatePayload: {
            stage?: TalentConversationRow["stage"];
            updated_at: string;
          } = { updated_at: now };
          if (conversation.stage === "completed") {
            conversationUpdatePayload.stage = "completed";
          }

          const { data: updatedConversation, error: updateConversationError } =
            await admin
              .from("talent_conversations")
              .update(conversationUpdatePayload)
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

    const [
      messagePage,
      talentProfile,
      resumeDownloadUrl,
      talentSetting,
      talentInsights,
      historyOpportunitiesPage,
      latestOpportunityRun,
      activeCompanyRoleCount,
      pendingInternalOpportunityCallRequests,
    ] = await Promise.all([
      withSessionFallback({
        fallback: { messages: [], nextBeforeMessageId: null },
        label: "visible messages",
        promise: fetchVisibleMessagesPage({
          admin,
          conversationId: conversation.id,
          limit: messageLimit,
          beforeMessageId,
        }),
        userId: user.id,
      }),
      withSessionFallback({
        fallback: createFallbackTalentProfile(profile),
        label: "structured profile",
        promise: fetchTalentStructuredProfile({
          admin,
          userId: user.id,
          talentUser: profile,
        }),
        userId: user.id,
      }),
      withSessionFallback({
        fallback: null,
        label: "resume signed URL",
        promise: getTalentResumeSignedUrl({
          admin,
          storagePath:
            latestResumeDocument?.storage_path ?? profile?.resume_storage_path,
        }),
        userId: user.id,
      }),
      withSessionFallback({
        fallback: null,
        label: "talent setting",
        promise: fetchTalentSetting({
          admin,
          userId: user.id,
        }),
        userId: user.id,
      }),
      withSessionFallback({
        fallback: null,
        label: "talent insights",
        promise: fetchTalentInsights({
          admin,
          userId: user.id,
        }),
        userId: user.id,
      }),
      withSessionFallback({
        fallback: createEmptyHistoryPage(historyFetchLimit, historyFetchOffset),
        label: historyOpportunitiesIncluded
          ? "opportunity history"
          : "opportunity counts",
        promise: shouldLoadOpportunityPage
          ? fetchTalentOpportunityHistoryPage({
              admin,
              limit: historyFetchLimit,
              locale:
                req.nextUrl.searchParams.get("locale") ??
                initialTalentSetting?.preferred_locale,
              offset: historyFetchOffset,
              userId: user.id,
            })
          : Promise.resolve(
              createEmptyHistoryPage(historyFetchLimit, historyFetchOffset)
            ),
        userId: user.id,
      }),
      withSessionFallback({
        fallback: null,
        label: "latest opportunity run",
        promise: fetchLatestOpportunityRun({
          admin,
          userId: user.id,
        }),
        userId: user.id,
      }),
      withSessionFallback({
        fallback: 0,
        label: "active company role count",
        promise: fetchActiveCompanyRoleCount(),
        userId: user.id,
      }),
      withSessionFallback({
        fallback: [],
        label: "pending internal opportunity call requests",
        promise: fetchPendingInternalOpportunityCallRequests({
          admin,
          userId: user.id,
        }),
        userId: user.id,
      }),
    ]);
    const pendingInternalOpportunityCallRequest =
      pendingInternalOpportunityCallRequests[0] ?? null;
    const serializedDocuments = await withSessionFallback({
      fallback: [],
      label: "talent document URLs",
      promise: serializeTalentDocuments({ admin, documents: talentDocuments }),
      userId: user.id,
    });
    const latestResume = serializedDocuments.find(
      (document) => document.kind === "resume"
    );
    const { messages, nextBeforeMessageId } = messagePage;
    const visibleMessages = messages.filter(
      (message) => !(message.message_type ?? "").startsWith("mock_interview")
    );
    const normalizedInsights = normalizeTalentInsightContent(
      talentInsights?.content
    );
    const onboardingChecklistProgress = !Boolean(
      talentSetting?.is_onboarding_done
    )
      ? await withSessionFallback({
          fallback: null,
          label: "onboarding checklist progress",
          promise: (async () => {
            const coverage = await getCareerOnboardingChecklistCoverage({
              admin,
              conversationId: conversation.id,
              currentInsightContent: normalizedInsights,
              userId: user.id,
            });
            return serializeOnboardingChecklistProgress(
              getOnboardingChecklistCoverageStats(coverage, profile)
            );
          })(),
          userId: user.id,
        })
      : null;
    const historyPageOpportunities = historyOpportunitiesPage.items;
    const historyOpportunities = historyOpportunitiesIncluded
      ? historyPageOpportunities
      : [];
    const talentSettingsUpdatedAt = talentSetting?.updated_at ?? null;
    const talentPreferencesUpdatedAt = talentSetting?.updated_at ?? null;
    const talentInsightsUpdatedAt = talentInsights?.last_updated_at ?? null;
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
              locale:
                req.nextUrl.searchParams.get("locale") ??
                initialTalentSetting?.preferred_locale,
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
        locale:
          req.nextUrl.searchParams.get("locale") ??
          initialTalentSetting?.preferred_locale,
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
    const hydratedMessages: Awaited<
      ReturnType<typeof hydrateOpportunityRunsForMessages>
    > = await withSessionFallback({
      fallback: serializedMessages as Awaited<
        ReturnType<typeof hydrateOpportunityRunsForMessages>
      >,
      label: "message-linked opportunity runs",
      promise: hydrateOpportunityRunsForMessages({
        admin,
        messages: serializedMessages,
        userId: user.id,
      }),
      userId: user.id,
    });
    const linkedOpportunityRunIds = new Set(
      hydratedMessages
        .map((message) => message.recommendationSearchRun?.id)
        .filter((runId): runId is string => Boolean(runId))
        .map((runId) => runId.toLowerCase())
    );
    const activeConversationRuns = await withSessionFallback({
      fallback: [],
      label: "active conversation opportunity runs",
      promise: fetchActiveOpportunityRunsForConversation({
        admin,
        conversationId: conversation.id,
        userId: user.id,
      }),
      userId: user.id,
    });
    const unlinkedOpportunityRuns = activeConversationRuns
      .filter((run) => !linkedOpportunityRunIds.has(run.id.toLowerCase()))
      .map((run) => serializeOpportunityRun(run))
      .filter((run) => run !== null);

    return NextResponse.json({
      ok: true,
      activeCompanyRoleCount,
      conversation: {
        id: conversation.id,
        stage: conversation.stage,
        resumeFileName:
          latestResume?.fileName ?? profile?.resume_file_name ?? null,
        resumeStoragePath:
          latestResume?.storagePath ?? profile?.resume_storage_path ?? null,
        resumeDownloadUrl: latestResume?.downloadUrl ?? resumeDownloadUrl,
        resumeLinks: profile?.resume_links ?? [],
        documents: serializedDocuments,
        reliefNudgeSent: Boolean(conversation.relief_nudge_sent),
        profileIngestionError: conversation.profile_ingestion_error ?? null,
        profileIngestionStatus:
          conversation.profile_ingestion_status?.trim() || null,
        profileIngestionUpdatedAt:
          conversation.profile_ingestion_updated_at ?? null,
      },
      historyItems: [],
      historyOpportunitiesIncluded,
      historyOpportunityCounts: historyOpportunitiesPage.counts,
      historyOpportunities,
      nextOpportunityOffset: historyOpportunitiesIncluded
        ? historyOpportunitiesPage.nextOffset
        : null,
      talentPreferences: {
        engagementTypes: normalizeTalentEngagementTypes(
          talentSetting?.engagement_types ?? []
        ),
        getExternalRecommendation:
          talentSetting?.get_external_recommendation ?? true,
        getInternalRecommendation: true,
        isOnboardingDone: Boolean(talentSetting?.is_onboarding_done),
        periodicIntervalDays: normalizeTalentPeriodicIntervalDays(
          talentSetting?.periodic_interval_days
        ),
        recommendationBatchSize: normalizeTalentRecommendationBatchSize(
          talentSetting?.recommendation_batch_size
        ),
      },
      talentInsights: normalizedInsights,
      onboardingChecklistProgress,
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
      unlinkedOpportunityRuns,
      pendingInternalOpportunityCallRequest,
      pendingInternalOpportunityCallRequests,
      messages: hydratedMessages,
      nextBeforeMessageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load talent session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
