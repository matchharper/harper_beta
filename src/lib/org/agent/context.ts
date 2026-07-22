import type { User } from "@supabase/supabase-js";
import { getLlmErrorMessage } from "@/lib/llm/llm";
import { fetchOrgBoard, OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import type { OrgAgentConversationRow } from "@/lib/org/agent/store";
import {
  fetchRecentOrgAgentPromptMessages,
  fetchRecentOrgAgentSummaries,
  fetchRoleForOrgAgent,
  fetchWorkspaceForOrgAgent,
} from "@/lib/org/agent/store";
import type {
  OrgAgentMention,
  OrgAgentMentionCandidate,
} from "@/lib/org/agent/types";

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdmin>;

type RecommendationPromptRow = {
  created_at: string;
  feedback: string | null;
  feedback_at: string | null;
  feedback_reason: string | null;
  fit_reasons: unknown;
  fit_summary: string | null;
  id: string;
  processed_stage: string | null;
  rank: number | null;
  recommended_at: string;
  role_id: string;
  saved_stage: string | null;
  talent_id: string;
  updated_at: string;
};

type TalentPromptRow = {
  email: string | null;
  headline: string | null;
  name: string | null;
  profile_picture?: string | null;
  user_id: string;
};

type TalentExperiencePromptRow = {
  company_name: string | null;
  end_date: string | null;
  role: string | null;
  start_date: string | null;
  talent_id: string;
};

type TalentEducationPromptRow = {
  degree: string | null;
  field: string | null;
  school: string | null;
  talent_id: string;
};

type TalentProgressPromptRow = {
  created_at: string;
  kind: string;
  metadata: unknown;
  recommendation_id: string | null;
  talent_id: string | null;
  text: string | null;
};

export type OrgAgentRoleFeedEventType =
  | "accepted"
  | "note"
  | "recommended"
  | "rejected"
  | "stage_changed";

export type OrgAgentPromptContext = {
  candidateContextText: string;
  conversationText: string;
  feedText: string;
  role: Awaited<ReturnType<typeof fetchRoleForOrgAgent>>;
  summariesText: string;
  workspace: Awaited<ReturnType<typeof fetchWorkspaceForOrgAgent>>;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function clip(value: unknown, maxLength: number) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function uniqueTexts(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => normalizeText(value)).filter(Boolean))
  );
}

function coerceStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 8);
  }
  if (typeof value === "string") {
    try {
      return coerceStringList(JSON.parse(value));
    } catch {
      return [value].map((item) => clip(item, 300)).filter(Boolean);
    }
  }
  return [];
}

function compactDate(value: unknown) {
  const text = normalizeText(value);
  return text ? text.slice(0, 10) : "";
}

function stripSerializedMentionIds(value: string) {
  return value.replace(/@\[([^\]]+)\]\(talent:[^)]+\)/g, "@$1");
}

function getTalentName(talent: TalentPromptRow | undefined, fallbackId: string) {
  return clip(talent?.name || talent?.email || fallbackId, 80);
}

function formatStage(row: RecommendationPromptRow) {
  return row.processed_stage || row.saved_stage || "recommended";
}

async function optionalContext<T>(args: {
  fallback: T;
  label: string;
  task: () => Promise<T>;
}) {
  try {
    return await args.task();
  } catch (error) {
    console.warn("[org/agent/context]", {
      error: getLlmErrorMessage(error) || String(error),
      label: args.label,
    });
    return args.fallback;
  }
}

async function fetchTalents(args: {
  admin: SupabaseAdminClient;
  talentIds: string[];
}) {
  if (args.talentIds.length === 0) return new Map<string, TalentPromptRow>();
  const { data, error } = await (args.admin.from("talent_users" as any) as any)
    .select("user_id, email, name, profile_picture, headline")
    .in("user_id", args.talentIds);

  if (error) throw error;
  return new Map(
    ((data ?? []) as TalentPromptRow[]).map((row) => [row.user_id, row])
  );
}

async function fetchRecentExperienceLabels(args: {
  admin: SupabaseAdminClient;
  talentIds: string[];
}) {
  const map = new Map<string, TalentExperiencePromptRow[]>();
  if (args.talentIds.length === 0) return map;

  const { data, error } = await (
    args.admin.from("talent_experiences" as any) as any
  )
    .select("talent_id, company_name, role, start_date, end_date")
    .in("talent_id", args.talentIds)
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(Math.max(80, args.talentIds.length * 8));

  if (error) throw error;
  for (const row of (data ?? []) as TalentExperiencePromptRow[]) {
    const rows = map.get(row.talent_id) ?? [];
    if (rows.length < 4) rows.push(row);
    map.set(row.talent_id, rows);
  }
  return map;
}

async function fetchEducationLabels(args: {
  admin: SupabaseAdminClient;
  talentIds: string[];
}) {
  const map = new Map<string, TalentEducationPromptRow[]>();
  if (args.talentIds.length === 0) return map;

  const { data, error } = await (
    args.admin.from("talent_educations" as any) as any
  )
    .select("talent_id, school, degree, field")
    .in("talent_id", args.talentIds)
    .limit(Math.max(80, args.talentIds.length * 5));

  if (error) throw error;
  for (const row of (data ?? []) as TalentEducationPromptRow[]) {
    const rows = map.get(row.talent_id) ?? [];
    if (rows.length < 3) rows.push(row);
    map.set(row.talent_id, rows);
  }
  return map;
}

function formatExperienceSummary(rows: TalentExperiencePromptRow[]) {
  return rows
    .slice(0, 3)
    .map((row) =>
      [clip(row.company_name, 50), clip(row.role, 70)]
        .filter(Boolean)
        .join("/")
    )
    .filter(Boolean)
    .join(", ");
}

function formatEducationSummary(rows: TalentEducationPromptRow[]) {
  return rows
    .slice(0, 2)
    .map((row) =>
      [clip(row.school, 50), clip(row.field || row.degree, 60)]
        .filter(Boolean)
        .join("/")
    )
    .filter(Boolean)
    .join(", ");
}

async function fetchRecentRoleRecommendations(args: {
  admin: SupabaseAdminClient;
  before?: string | null;
  roleId: string;
  limit?: number;
  talentIds?: string[];
}) {
  let query = (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      "id, talent_id, role_id, fit_summary, fit_reasons, feedback, feedback_at, feedback_reason, processed_stage, saved_stage, rank, recommended_at, created_at, updated_at"
    )
    .eq("role_id", args.roleId)
    .order("updated_at", { ascending: false });

  if (args.before) query = query.lt("updated_at", args.before);
  if (args.talentIds?.length) query = query.in("talent_id", args.talentIds);

  const { data, error } = await query.limit(args.limit ?? 20);

  if (error) throw error;
  return (data ?? []) as RecommendationPromptRow[];
}

async function fetchRecentRoleProgress(args: {
  admin: SupabaseAdminClient;
  before?: string | null;
  roleId: string;
  limit?: number;
  talentIds?: string[];
}) {
  let query = (args.admin.from("talent_progress" as any) as any)
    .select("created_at, kind, recommendation_id, talent_id, text, metadata")
    .eq("role_id", args.roleId)
    .in("kind", ["org_stage_change", "org_note"])
    .order("created_at", { ascending: false });

  if (args.before) query = query.lt("created_at", args.before);
  if (args.talentIds?.length) query = query.in("talent_id", args.talentIds);

  const { data, error } = await query.limit(args.limit ?? 20);

  if (error) throw error;
  return (data ?? []) as TalentProgressPromptRow[];
}

function readProgressStage(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }
  return normalizeText((metadata as Record<string, unknown>).stage);
}

function classifyProgressEvent(row: TalentProgressPromptRow) {
  if (row.kind === "org_note") return "note" as const;
  const stage = readProgressStage(row.metadata);
  if (stage === "process_stopped") return "rejected" as const;
  if (stage === "connected") return "accepted" as const;
  return "stage_changed" as const;
}

export async function readOrgAgentRoleFeed(args: {
  admin: SupabaseAdminClient;
  before?: string | null;
  eventTypes?: OrgAgentRoleFeedEventType[];
  limit?: number;
  roleId: string;
  talentIds?: string[];
}) {
  const limit = Math.min(Math.max(Math.trunc(args.limit ?? 20), 1), 50);
  const eventTypeSet = new Set(args.eventTypes ?? []);
  const includeRecommendations =
    eventTypeSet.size === 0 || eventTypeSet.has("recommended");
  const [recommendations, progressRows] = await Promise.all([
    includeRecommendations
      ? fetchRecentRoleRecommendations({
          admin: args.admin,
          before: args.before,
          limit,
          roleId: args.roleId,
          talentIds: args.talentIds,
        })
      : Promise.resolve([]),
    fetchRecentRoleProgress({
      admin: args.admin,
      before: args.before,
      limit,
      roleId: args.roleId,
      talentIds: args.talentIds,
    }),
  ]);

  const filteredProgressRows = progressRows.filter(
    (row) =>
      eventTypeSet.size === 0 || eventTypeSet.has(classifyProgressEvent(row))
  );
  const talentIds = uniqueTexts([
    ...recommendations.map((row) => row.talent_id),
    ...filteredProgressRows.map((row) => row.talent_id),
  ]);
  const [talents, experiences, educations] = await Promise.all([
    fetchTalents({ admin: args.admin, talentIds }),
    fetchRecentExperienceLabels({ admin: args.admin, talentIds }),
    fetchEducationLabels({ admin: args.admin, talentIds }),
  ]);

  const recommendationEvents = recommendations.map((row) => {
    const talent = talents.get(row.talent_id);
    const fitReasons = coerceStringList(row.fit_reasons).slice(0, 2);
    const pieces = [
      `${compactDate(row.recommended_at)} 추천`,
      `${getTalentName(talent, row.talent_id)} (talentId=${row.talent_id})`,
      clip(talent?.headline, 100),
      formatExperienceSummary(experiences.get(row.talent_id) ?? []),
      formatEducationSummary(educations.get(row.talent_id) ?? []),
      `stage=${formatStage(row)}`,
      row.feedback ? `feedback=${clip(row.feedback, 120)}` : "",
      row.feedback_reason ? `feedback_reason=${clip(row.feedback_reason, 80)}` : "",
      row.fit_summary ? `fit=${clip(row.fit_summary, 180)}` : "",
      fitReasons.length ? `reasons=${fitReasons.map((item) => clip(item, 100)).join(" / ")}` : "",
    ].filter(Boolean);
    return {
      line: `- ${pieces.join(" | ")}`,
      timestamp: row.updated_at || row.recommended_at,
    };
  });

  const progressEvents = filteredProgressRows
    .filter((row) => normalizeText(row.text))
    .map((row) => {
      const talent = row.talent_id ? talents.get(row.talent_id) : undefined;
      const talentLabel = row.talent_id
        ? `${getTalentName(talent, row.talent_id)} (talentId=${row.talent_id})`
        : "후보자 미상";
      return {
        line: `- ${compactDate(row.created_at)} ${classifyProgressEvent(row)} | ${talentLabel} | ${clip(row.text, 220)}`,
        timestamp: row.created_at,
      };
    });

  const events = [...recommendationEvents, ...progressEvents]
    .sort(
      (left, right) =>
        (Date.parse(right.timestamp) || 0) - (Date.parse(left.timestamp) || 0)
    )
    .slice(0, limit);
  const nextBefore = events.at(-1)?.timestamp ?? null;
  return {
    nextBefore,
    text: events.length
      ? events.map((event) => event.line).join("\n")
      : "- 해당 조건의 역할 피드가 없습니다.",
  };
}

async function buildMentionedCandidateText(args: {
  admin: SupabaseAdminClient;
  mentions: OrgAgentMention[];
  roleId: string;
}) {
  const talentIds = uniqueTexts(args.mentions.map((mention) => mention.talentId));
  if (talentIds.length === 0) return "- 이번 메시지에 후보자 멘션이 없습니다.";

  const { data: recommendations, error } = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      "id, talent_id, role_id, fit_summary, fit_reasons, feedback, feedback_at, feedback_reason, processed_stage, saved_stage, rank, recommended_at, created_at, updated_at"
    )
    .eq("role_id", args.roleId)
    .in("talent_id", talentIds);

  if (error) throw error;
  const visibleTalentIds = uniqueTexts(
    ((recommendations ?? []) as RecommendationPromptRow[]).map(
      (row) => row.talent_id
    )
  );
  const [talents, experiences, educations] = await Promise.all([
    fetchTalents({ admin: args.admin, talentIds: visibleTalentIds }),
    fetchRecentExperienceLabels({
      admin: args.admin,
      talentIds: visibleTalentIds,
    }),
    fetchEducationLabels({ admin: args.admin, talentIds: visibleTalentIds }),
  ]);
  const recommendationByTalentId = new Map(
    ((recommendations ?? []) as RecommendationPromptRow[]).map((row) => [
      row.talent_id,
      row,
    ])
  );

  const lines = talentIds.map((talentId) => {
    const talent = talents.get(talentId);
    const recommendation = recommendationByTalentId.get(talentId);
    const fitReasons = coerceStringList(recommendation?.fit_reasons).slice(0, 4);
    if (!recommendation) {
      return `- talentId=${talentId} | 현재 역할 pipeline에서 찾을 수 없음`;
    }
    const pieces = [
      `${getTalentName(talent, talentId)} (talentId=${talentId})`,
      clip(talent?.headline, 140),
      `experience=${formatExperienceSummary(experiences.get(talentId) ?? []) || "unknown"}`,
      `education=${formatEducationSummary(educations.get(talentId) ?? []) || "unknown"}`,
      recommendation ? `stage=${formatStage(recommendation)}` : "stage=not_found_in_role_recommendations",
      recommendation?.fit_summary
        ? `fit=${clip(recommendation.fit_summary, 260)}`
        : "",
      fitReasons.length
        ? `fit_reasons=${fitReasons.map((item) => clip(item, 160)).join(" / ")}`
        : "",
      recommendation?.feedback
        ? `existing_feedback=${clip(recommendation.feedback, 180)}`
        : "",
    ].filter(Boolean);
    return `- ${pieces.join(" | ")}`;
  });

  return lines.join("\n");
}

export async function readOrgAgentCandidateContext(args: {
  admin: SupabaseAdminClient;
  includeFeed?: boolean;
  roleId: string;
  talentIds: string[];
}) {
  const talentIds = uniqueTexts(args.talentIds).slice(0, 3);
  if (talentIds.length === 0) return "- 조회할 후보자가 없습니다.";

  const { data: recommendationData, error: recommendationError } = await (
    args.admin.from("talent_opportunity_recommendation" as any) as any
  )
    .select(
      "id, talent_id, role_id, fit_summary, fit_reasons, feedback, feedback_at, feedback_reason, processed_stage, saved_stage, rank, recommended_at, created_at, updated_at"
    )
    .eq("role_id", args.roleId)
    .in("talent_id", talentIds);
  if (recommendationError) throw recommendationError;

  const recommendations = (recommendationData ?? []) as RecommendationPromptRow[];
  const recommendationByTalentId = new Map(
    recommendations.map((row) => [row.talent_id, row])
  );
  const visibleTalentIds = uniqueTexts(
    recommendations.map((row) => row.talent_id)
  );
  if (visibleTalentIds.length === 0) {
    return talentIds
      .map(
        (talentId) =>
          `- talentId=${talentId} | 현재 역할 pipeline에서 찾을 수 없음`
      )
      .join("\n");
  }

  const [talentResult, experienceResult, educationResult, extrasResult] =
    await Promise.all([
      (args.admin.from("talent_users" as any) as any)
        .select(
          "user_id, name, headline, bio, current_location, location, resume_text"
        )
        .in("user_id", visibleTalentIds),
      (args.admin.from("talent_experiences" as any) as any)
        .select(
          "talent_id, company_name, role, employment_type, company_location, start_date, end_date, description, memo"
        )
        .in("talent_id", visibleTalentIds)
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(visibleTalentIds.length * 6),
      (args.admin.from("talent_educations" as any) as any)
        .select(
          "talent_id, school, degree, field, start_date, end_date, description, memo"
        )
        .in("talent_id", visibleTalentIds)
        .order("start_date", { ascending: false, nullsFirst: false })
        .limit(visibleTalentIds.length * 4),
      (args.admin.from("talent_extras" as any) as any)
        .select("talent_id, content")
        .in("talent_id", visibleTalentIds),
    ]);

  for (const result of [
    talentResult,
    experienceResult,
    educationResult,
    extrasResult,
  ]) {
    if (result.error) throw result.error;
  }

  const talentById = new Map<string, any>(
    (talentResult.data ?? []).map((row: any) => [row.user_id, row])
  );
  const experiencesByTalentId = new Map<string, any[]>();
  for (const row of experienceResult.data ?? []) {
    const rows = experiencesByTalentId.get(row.talent_id) ?? [];
    if (rows.length < 5) rows.push(row);
    experiencesByTalentId.set(row.talent_id, rows);
  }
  const educationsByTalentId = new Map<string, any[]>();
  for (const row of educationResult.data ?? []) {
    const rows = educationsByTalentId.get(row.talent_id) ?? [];
    if (rows.length < 3) rows.push(row);
    educationsByTalentId.set(row.talent_id, rows);
  }
  const extrasByTalentId = new Map<string, unknown>(
    (extrasResult.data ?? []).map((row: any) => [row.talent_id, row.content])
  );

  const candidateBlocks = talentIds.map((talentId) => {
    const recommendation = recommendationByTalentId.get(talentId);
    if (!recommendation) {
      return `Candidate talentId=${talentId}: 현재 역할 pipeline에서 찾을 수 없음`;
    }
    const talent = talentById.get(talentId);
    const fitReasons = coerceStringList(recommendation.fit_reasons).slice(0, 4);
    const experienceLines = (experiencesByTalentId.get(talentId) ?? []).map(
      (row) =>
        `  - ${[clip(row.company_name, 80), clip(row.role, 100), `${compactDate(row.start_date)}~${compactDate(row.end_date) || "현재"}`, clip(row.employment_type, 40), clip(row.company_location, 60)].filter(Boolean).join(" | ")}${normalizeText(row.description ?? row.memo) ? ` | detail=${clip(row.description ?? row.memo, 400)}` : ""}`
    );
    const educationLines = (educationsByTalentId.get(talentId) ?? []).map(
      (row) =>
        `  - ${[clip(row.school, 80), clip(row.degree, 80), clip(row.field, 100), `${compactDate(row.start_date)}~${compactDate(row.end_date)}`].filter(Boolean).join(" | ")}${normalizeText(row.description ?? row.memo) ? ` | detail=${clip(row.description ?? row.memo, 300)}` : ""}`
    );
    const extras = extrasByTalentId.get(talentId);
    const extrasText = extras
      ? clip(JSON.stringify(extras), 1_000)
      : "없음";
    return [
      `Candidate: ${clip(talent?.name, 100) || "이름 없음"}; talentId=${talentId}; stage=${formatStage(recommendation)}`,
      `Headline: ${clip(talent?.headline, 220) || "없음"}`,
      `Location: ${clip(talent?.current_location ?? talent?.location, 120) || "없음"}`,
      `Bio: ${clip(talent?.bio, 700) || "없음"}`,
      `Fit: ${clip(recommendation.fit_summary, 400) || "없음"}`,
      `Fit reasons: ${fitReasons.length ? fitReasons.map((item) => clip(item, 200)).join(" / ") : "없음"}`,
      `Existing company feedback: ${clip(recommendation.feedback, 250) || "없음"}${recommendation.feedback_reason ? ` | reason=${clip(recommendation.feedback_reason, 200)}` : ""}`,
      "Recent experiences:",
      experienceLines.length ? experienceLines.join("\n") : "  - 없음",
      "Recent education:",
      educationLines.length ? educationLines.join("\n") : "  - 없음",
      `Profile extras: ${extrasText}`,
      `Resume/profile excerpt: ${clip(talent?.resume_text, 1_200) || "없음"}`,
    ].join("\n");
  });

  if (!args.includeFeed) return candidateBlocks.join("\n\n");
  const feed = await readOrgAgentRoleFeed({
    admin: args.admin,
    limit: 15,
    roleId: args.roleId,
    talentIds: visibleTalentIds,
  });
  return `${candidateBlocks.join("\n\n")}\n\n후보자 관련 최근 피드:\n${feed.text}`;
}

function buildConversationText(args: {
  messages: Awaited<ReturnType<typeof fetchRecentOrgAgentPromptMessages>>;
}) {
  if (args.messages.length === 0) return "- 아직 이전 대화가 없습니다.";
  return args.messages
    .map((message) => {
      const mentions = message.mentions.length
        ? ` mentions=${message.mentions
            .map((mention) => `${mention.displayName}:${mention.talentId}`)
            .join(", ")}`
        : "";
      return `- ${message.role}${mentions}: ${clip(stripSerializedMentionIds(message.content), 1_000)}`;
    })
    .join("\n");
}

function buildSummariesText(args: {
  summaries: Awaited<ReturnType<typeof fetchRecentOrgAgentSummaries>>;
}) {
  if (args.summaries.length === 0) return "- 아직 요약된 이전 대화가 없습니다.";
  return args.summaries
    .map((summary) => `- ${clip(summary.content, 1_500)}`)
    .join("\n");
}

export async function buildOrgAgentPromptContext(args: {
  admin: SupabaseAdminClient;
  beforeMessageId?: number | null;
  conversation: OrgAgentConversationRow;
  mentions: OrgAgentMention[];
}) {
  const [workspace, role] = await Promise.all([
    fetchWorkspaceForOrgAgent({
      admin: args.admin,
      workspaceId: args.conversation.company_workspace_id,
    }),
    fetchRoleForOrgAgent({
      admin: args.admin,
      roleId: args.conversation.role_id,
      workspaceId: args.conversation.company_workspace_id,
    }),
  ]);

  const [summaries, messages, feedText, candidateContextText] =
    await Promise.all([
      optionalContext({
        fallback: [],
        label: "conversation_summaries",
        task: () =>
          fetchRecentOrgAgentSummaries({
            admin: args.admin,
            conversationId: args.conversation.id,
            limit: 3,
          }),
      }),
      optionalContext({
        fallback: [],
        label: "recent_conversation",
        task: () =>
          fetchRecentOrgAgentPromptMessages({
            admin: args.admin,
            beforeMessageId: args.beforeMessageId,
            conversationId: args.conversation.id,
            limit: 16,
          }),
      }),
      optionalContext({
        fallback: "- 최근 역할 피드를 읽지 못했습니다.",
        label: "recent_role_feed",
        task: () =>
          readOrgAgentRoleFeed({
            admin: args.admin,
            limit: 20,
            roleId: args.conversation.role_id,
          }).then((result) => result.text),
      }),
      optionalContext({
        fallback: "- 멘션된 후보자 상세 정보를 읽지 못했습니다.",
        label: "mentioned_candidate_context",
        task: () =>
          buildMentionedCandidateText({
            admin: args.admin,
            mentions: args.mentions,
            roleId: args.conversation.role_id,
          }),
      }),
    ]);

  return {
    candidateContextText,
    conversationText: buildConversationText({ messages }),
    feedText,
    role,
    summariesText: buildSummariesText({ summaries }),
    workspace,
  } satisfies OrgAgentPromptContext;
}

export async function searchOrgAgentMentionCandidates(args: {
  query?: string | null;
  roleId: string;
  user: User;
  workspaceId: string;
}): Promise<OrgAgentMentionCandidate[]> {
  const workspaceId = normalizeText(args.workspaceId);
  const roleId = normalizeText(args.roleId);
  if (!workspaceId || !roleId) {
    throw new OrgHttpError(400, "Missing required fields");
  }
  const board = await fetchOrgBoard({
    query: args.query ?? null,
    roleId,
    user: args.user,
    workspaceId,
  });

  return board.items
    .flatMap((item): OrgAgentMentionCandidate[] => {
      const label =
        normalizeText(item.talent.name) ||
        normalizeText(item.talent.email) ||
        item.talentId;
      const recentCompanies = item.talent.recentCompanies
        .map((company) => company.label)
        .filter(Boolean)
        .slice(0, 2)
        .join(", ");
      const recentSchools = item.talent.recentSchools
        .map((school) => school.label)
        .filter(Boolean)
        .slice(0, 2)
        .join(", ");
      return [
        {
          headline: item.talent.headline ?? null,
          label,
          recommendationId: item.recommendationId,
          roleId: item.roleId,
          stage: item.stage,
          subtitle:
            [recentCompanies, recentSchools].filter(Boolean).join(" · ") ||
            item.talent.email ||
            item.talentId,
          talentId: item.talentId,
        },
      ];
    })
    .slice(0, 12);
}

export async function filterOrgAgentMentionsForRole(args: {
  mentions: OrgAgentMention[];
  roleId: string;
  user: User;
  workspaceId: string;
}) {
  const talentIds = uniqueTexts(args.mentions.map((mention) => mention.talentId));
  if (talentIds.length === 0) return [];

  const board = await fetchOrgBoard({
    query: null,
    roleId: args.roleId,
    user: args.user,
    workspaceId: args.workspaceId,
  });
  const boardItemByTalentId = new Map(
    board.items.map((item) => [item.talentId, item])
  );

  return args.mentions
    .flatMap((mention): OrgAgentMention[] => {
      const item = boardItemByTalentId.get(mention.talentId);
      if (!item) return [];
      const displayName = normalizeText(mention.displayName);
      if (!displayName) return [];
      return [
        {
          displayName,
          recommendationId: mention.recommendationId || item.recommendationId,
          roleId: item.roleId,
          talentId: item.talentId,
        },
      ];
    })
    .slice(0, 20);
}
