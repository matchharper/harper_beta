import {
  fetchTalentInsights,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { normalizeTalentInsightContent } from "@/lib/talentOnboarding/server";
import type { Database } from "@/types/database.types";

type TalentUserRow = Database["public"]["Tables"]["talent_users"]["Row"];
type TalentConversationRow =
  Database["public"]["Tables"]["talent_conversations"]["Row"];

export type CareerTalentSummary = {
  userId: string;
  name: string | null;
  email: string | null;
  profilePicture: string | null;
  headline: string | null;
  conversationStage: string | null;
  insightCoverage: number;
  lastConversationAt: string | null;
  createdAt: string | null;
};

export type CareerTalentListResponse = {
  talents: CareerTalentSummary[];
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
};

export type CareerTalentDetailResponse = {
  userId: string;
  name: string | null;
  email: string | null;
  profilePicture: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  conversationStage: string | null;
  lastConversationAt: string | null;
  createdAt: string | null;
  insights: Record<string, string> | null;
  structuredProfile: {
    experiences: unknown[];
    educations: unknown[];
    extras: unknown[];
  } | null;
  preferences: {
    engagementTypes: string[];
    preferredLocations: string[];
    careerMoveIntent: string | null;
    profileVisibility: string | null;
  } | null;
  messages: Array<{
    id: number;
    role: string;
    content: string;
    messageType: string | null;
    createdAt: string;
  }>;
};

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

export function parseCareerListLimit(value: string | null) {
  const n = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

export function parseCareerListOffset(value: string | null) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export async function fetchCareerTalentList(args: {
  limit?: number;
  offset?: number;
}): Promise<CareerTalentListResponse> {
  const limit = Math.max(1, Math.min(MAX_LIMIT, args.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, args.offset ?? 0);
  const admin = getTalentSupabaseAdmin();

  // Fetch talent_users who have conversations (career onboarded)
  const { data: talentUsers, error: talentError, count } = await admin
    .from("talent_users")
    .select("user_id, name, email, profile_picture, headline, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (talentError) {
    throw new Error(talentError.message ?? "Failed to load talent users");
  }

  const rows = (talentUsers ?? []) as Pick<
    TalentUserRow,
    "user_id" | "name" | "email" | "profile_picture" | "headline" | "created_at"
  >[];
  const totalCount = count ?? 0;

  if (rows.length === 0) {
    return { talents: [], totalCount, limit, offset, hasMore: false, nextOffset: null };
  }

  const userIds = rows.map((r) => r.user_id);

  // Fetch latest conversation per user
  const { data: conversations } = await admin
    .from("talent_conversations")
    .select("user_id, stage, updated_at")
    .in("user_id", userIds)
    .order("updated_at", { ascending: false });

  const conversationMap = new Map<
    string,
    Pick<TalentConversationRow, "stage" | "updated_at">
  >();
  for (const conv of conversations ?? []) {
    if (!conversationMap.has(conv.user_id)) {
      conversationMap.set(conv.user_id, conv);
    }
  }

  // Fetch insights per user
  const { data: insightsRows } = await admin
    .from("talent_insights")
    .select("talent_id, content")
    .in("talent_id", userIds);

  const insightsMap = new Map<string, Record<string, string>>();
  for (const row of insightsRows ?? []) {
    const normalized = normalizeTalentInsightContent(row.content);
    if (normalized && row.talent_id) {
      insightsMap.set(row.talent_id, normalized);
    }
  }

  const talents: CareerTalentSummary[] = rows.map((row) => {
    const conv = conversationMap.get(row.user_id);
    const insights = insightsMap.get(row.user_id);
    const insightCount = insights ? Object.keys(insights).length : 0;

    return {
      userId: row.user_id,
      name: row.name,
      email: row.email,
      profilePicture: row.profile_picture,
      headline: row.headline,
      conversationStage: conv?.stage ?? null,
      insightCoverage: insightCount,
      lastConversationAt: conv?.updated_at ?? null,
      createdAt: row.created_at,
    };
  });

  const nextOffset =
    offset + talents.length < totalCount ? offset + talents.length : null;

  return {
    talents,
    totalCount,
    limit,
    offset,
    hasMore: nextOffset !== null,
    nextOffset,
  };
}

export async function fetchCareerTalentDetail(
  userId: string
): Promise<CareerTalentDetailResponse> {
  const admin = getTalentSupabaseAdmin();

  const [profile, insights, structuredProfile] = await Promise.all([
    fetchTalentUserProfile({ admin, userId }),
    fetchTalentInsights({ admin, userId }),
    fetchTalentStructuredProfile({ admin, userId, talentUser: null }),
  ]);

  // Fetch latest conversation
  const { data: conversations } = await admin
    .from("talent_conversations")
    .select("id, stage, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  const latestConv = conversations?.[0] ?? null;

  // Fetch messages from latest conversation
  let messages: CareerTalentDetailResponse["messages"] = [];
  if (latestConv) {
    const { data: messageRows } = await admin
      .from("talent_messages")
      .select("id, role, content, message_type, created_at")
      .eq("conversation_id", latestConv.id)
      .order("created_at", { ascending: true })
      .limit(100);

    messages = (messageRows ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      messageType: m.message_type,
      createdAt: m.created_at,
    }));
  }

  // Fetch preferences
  const { data: setting } = await admin
    .from("talent_setting")
    .select(
      "engagement_types, preferred_locations, career_move_intent, profile_visibility"
    )
    .eq("user_id", userId)
    .maybeSingle();

  const normalizedInsights = normalizeTalentInsightContent(insights?.content);

  return {
    userId,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    profilePicture: profile?.profile_picture ?? null,
    headline: profile?.headline ?? null,
    bio: profile?.bio ?? null,
    location: profile?.location ?? null,
    conversationStage: latestConv?.stage ?? null,
    lastConversationAt: latestConv?.updated_at ?? null,
    createdAt: profile?.created_at ?? null,
    insights: normalizedInsights,
    structuredProfile: structuredProfile
      ? {
          experiences: structuredProfile.talentExperiences ?? [],
          educations: structuredProfile.talentEducations ?? [],
          extras: structuredProfile.talentExtras ?? [],
        }
      : null,
    preferences: setting
      ? {
          engagementTypes: (setting.engagement_types as string[]) ?? [],
          preferredLocations: (setting.preferred_locations as string[]) ?? [],
          careerMoveIntent: (setting.career_move_intent as string) ?? null,
          profileVisibility: (setting.profile_visibility as string) ?? null,
        }
      : null,
    messages,
  };
}
