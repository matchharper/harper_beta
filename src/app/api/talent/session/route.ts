import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { warmCache } from "@/lib/talentOnboarding/prompts/promptCache";
import {
  getTalentFirstVisitText,
  TalentConversationRow,
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
import { autoStartClaimedTalentConversation } from "@/lib/talentOnboarding/kickoff";
import {
  getTalentCareerMoveIntentLabel,
  normalizeTalentNetworkApplication,
} from "@/lib/talentNetworkApplication";
import { fetchTalentOpportunityHistory } from "@/lib/talentOpportunity";

const getLatestUpdatedAt = (...values: Array<string | null | undefined>) => {
  const timestamps = values
    .map((value) => {
      if (typeof value !== "string") return null;
      const time = Date.parse(value);
      if (Number.isNaN(time)) return null;
      return { time, value };
    })
    .filter((entry): entry is { time: number; value: string } => entry !== null);

  if (timestamps.length === 0) return null;

  timestamps.sort((left, right) => right.time - left.time);
  return timestamps[0]?.value ?? null;
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
        { error: existingError.message ?? "Failed to read talent_conversations" },
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

    const rawLimit = Number(req.nextUrl.searchParams.get("messageLimit") ?? "20");
    const messageLimit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(Math.floor(rawLimit), 100))
      : 20;
    const rawBeforeMessageId = req.nextUrl.searchParams.get("beforeMessageId");
    const beforeMessageId =
      rawBeforeMessageId && /^\d+$/.test(rawBeforeMessageId)
        ? Number(rawBeforeMessageId)
        : null;

    const { messages, nextBeforeMessageId } = await fetchVisibleMessagesPage({
      admin,
      conversationId: conversation.id,
      limit: messageLimit,
      beforeMessageId,
    });
    const [
      talentProfile,
      resumeDownloadUrl,
      talentSetting,
      talentInsights,
      talentNotificationsResponse,
      historyOpportunities,
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
        fetchTalentOpportunityHistory({
          admin,
          userId: user.id,
        }),
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
          [item.location, item.workMode]
            .filter(Boolean)
            .join(" / ") || null,
        engagementType:
          item.employmentTypes.length > 0
            ? item.employmentTypes.join(" / ")
            : null,
        matchedAt: item.recommendedAt,
        href: item.href,
      }));

    return NextResponse.json({
      ok: true,
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
      historyOpportunities,
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
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        messageType: message.message_type ?? "chat",
        createdAt: message.created_at,
      })),
      nextBeforeMessageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load talent session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
