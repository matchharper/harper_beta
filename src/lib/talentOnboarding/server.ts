import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export const TALENT_FIRST_VISIT_TEXT = [
  `안녕하세요. 하퍼에 처음 방문해주셔서 감사합니다.

<<하퍼는 숨겨진 글로벌/딥테크 기회를 먼저 찾아 제안하고,
후보자 관점에서 커리어 기회와 조건 협상까지 함께 돕는 AI 헤드헌터입니다.>>

대화를 시작하기 전에 기본 정보를 간단히 알려주세요.

제출 후에는 약 5~10분 정도의 대화가 진행됩니다.
대화는 언제든지 중지할 수 있고, 다음에 다시 이어서 진행할 수 있습니다.`,
].join("\n");

export type TalentConversationRow = {
  id: string;
  user_id: string;
  stage: "profile" | "chat" | "completed";
  title: string | null;
  resume_file_name: string | null;
  resume_text: string | null;
  resume_links: string[] | null;
  relief_nudge_sent: boolean | null;
  created_at: string;
  updated_at: string;
};

export type TalentUserProfileRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  profile_picture: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  resume_file_name: string | null;
  resume_storage_path: string | null;
  resume_text: string | null;
  resume_links: string[] | null;
  created_at: string;
  updated_at: string;
};

export type TalentExperienceRow =
  Database["public"]["Tables"]["talent_experiences"]["Row"];
export type TalentEducationRow =
  Database["public"]["Tables"]["talent_educations"]["Row"];
export type TalentExtraRow =
  Database["public"]["Tables"]["talent_extras"]["Row"];

export type TalentExtraItem = {
  title: string | null;
  description: string | null;
  date: string | null;
  memo: string | null;
};

export type TalentStructuredProfile = {
  talentUser: Pick<
    TalentUserProfileRow,
    "user_id" | "name" | "profile_picture" | "headline" | "bio" | "location"
  > | null;
  talentExperiences: TalentExperienceRow[];
  talentEducations: TalentEducationRow[];
  talentExtras: TalentExtraItem[];
};

export type TalentMessageRow = {
  id: number;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  message_type: string | null;
  created_at: string;
};

export type TalentProfileVisibility =
  | "open_to_matches"
  | "exceptional_only"
  | "dont_share";

export const DEFAULT_TALENT_PROFILE_VISIBILITY: TalentProfileVisibility =
  "exceptional_only";

export type TalentSettingRow = {
  user_id: string;
  profile_visibility: TalentProfileVisibility;
  blocked_companies: string[];
  created_at: string;
  updated_at: string;
};

export const TALENT_RESUME_BUCKET = "talent-resumes";
export const TALENT_PENDING_QUESTION_PREFIX = "__PENDING_Q__::";
const TALENT_ALLOWED_PROFILE_VISIBILITY = new Set<TalentProfileVisibility>([
  "open_to_matches",
  "exceptional_only",
  "dont_share",
]);

export function normalizeTalentBlockedCompanies(companies: unknown): string[] {
  if (!Array.isArray(companies)) return [];

  const unique = new Map<string, string>();
  for (const raw of companies) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (unique.has(lower)) continue;
    unique.set(lower, name.slice(0, 120));
  }
  return Array.from(unique.values());
}

export function sanitizeTalentProfileVisibility(
  value: unknown
): TalentProfileVisibility {
  const normalized = String(value ?? "").trim() as TalentProfileVisibility;
  if (TALENT_ALLOWED_PROFILE_VISIBILITY.has(normalized)) {
    return normalized;
  }
  return DEFAULT_TALENT_PROFILE_VISIBILITY;
}

export function isPendingQuestionContent(content: string | null | undefined) {
  if (!content) return false;
  return content.startsWith(TALENT_PENDING_QUESTION_PREFIX);
}

export function stripPendingQuestionPrefix(content: string) {
  if (!isPendingQuestionContent(content)) return content;
  return content.slice(TALENT_PENDING_QUESTION_PREFIX.length).trim();
}

function readEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getTalentSupabaseAdmin() {
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  }

  return createClient<Database>(supabaseUrl, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function toTalentDisplayName(user: User) {
  return (
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    (typeof user.email === "string" ? user.email.split("@")[0] : null) ??
    "Candidate"
  );
}

export async function ensureTalentUserRecord(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  user: User;
}) {
  const { admin, user } = args;
  const payload = {
    user_id: user.id,
    email: user.email ?? null,
    name: toTalentDisplayName(user),
    profile_picture: user.user_metadata?.avatar_url ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("talent_users")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message ?? "Failed to upsert talent_users");
  }
}

export async function fetchMessages(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
}) {
  const { admin, conversationId } = args;
  const { data, error } = await admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, created_at"
    )
    .eq("conversation_id", conversationId)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_messages");
  }

  return (data ?? []) as TalentMessageRow[];
}

export async function fetchRecentMessages(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
  limit?: number;
}) {
  const { admin, conversationId, limit = 24 } = args;
  const { data, error } = await admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, created_at"
    )
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message ?? "Failed to load recent talent_messages");
  }

  return ((data ?? []) as TalentMessageRow[]).reverse();
}

export async function fetchVisibleMessagesPage(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
  limit?: number;
  beforeMessageId?: number | null;
}) {
  const { admin, conversationId, limit = 20, beforeMessageId } = args;
  const pageSize = Math.max(1, Math.min(limit, 100));

  let query = admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, created_at"
    )
    .eq("conversation_id", conversationId)
    .not("content", "like", `${TALENT_PENDING_QUESTION_PREFIX}%`)
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (beforeMessageId) {
    query = query.lt("id", beforeMessageId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message ?? "Failed to load visible talent_messages");
  }

  const rows = (data ?? []) as TalentMessageRow[];
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const oldestRow = pageRows[pageRows.length - 1] ?? null;

  return {
    messages: pageRows.reverse(),
    nextBeforeMessageId: hasMore && oldestRow ? oldestRow.id : null,
  };
}

export async function countUserChatTurns(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  conversationId: string;
}) {
  const { admin, conversationId } = args;
  const { count, error } = await admin
    .from("talent_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .eq("message_type", "chat");

  if (error) {
    throw new Error(error.message ?? "Failed to count user chat turns");
  }

  return count ?? 0;
}

export async function fetchTalentUserProfile(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
}) {
  const { admin, userId } = args;
  const { data, error } = await admin
    .from("talent_users")
    .select(
      "user_id, email, name, profile_picture, headline, bio, location, resume_file_name, resume_storage_path, resume_text, resume_links, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_users profile");
  }

  return (data ?? null) as TalentUserProfileRow | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown, maxLength = 4000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function asDateText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, 32);
}

function toTalentExtraItem(value: unknown): TalentExtraItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const title =
    asText(record.title, 300) ??
    asText(record.name, 300) ??
    asText(record.role, 300);
  const description =
    asText(record.description, 8000) ??
    asText(record.content, 8000) ??
    asText(record.summary, 8000);
  const date =
    asDateText(record.date) ??
    asDateText(record.issued_at) ??
    asDateText(record.published_at) ??
    asDateText(record.start_date);
  const memo = asText(record.memo, 2000);

  if (!title && !description && !date && !memo) return null;
  return { title, description, date, memo };
}

function parseTalentExtrasContent(content: unknown): TalentExtraItem[] {
  const fromArray = (value: unknown) =>
    (Array.isArray(value) ? value : [])
      .map((item) => toTalentExtraItem(item))
      .filter((item): item is TalentExtraItem => Boolean(item));

  if (Array.isArray(content)) {
    return fromArray(content);
  }

  const record = asRecord(content);
  if (!record) return [];

  const candidateArrays = [
    record.talent_extras,
    record.extras,
    record.items,
    record.publications,
  ];
  for (const candidate of candidateArrays) {
    const parsed = fromArray(candidate);
    if (parsed.length > 0) return parsed;
  }

  return [];
}

export async function fetchTalentStructuredProfile(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
  talentUser?: TalentUserProfileRow | null;
}) {
  const { admin, userId, talentUser } = args;

  const [experienceRes, educationRes, extrasRes, fallbackUser] =
    await Promise.all([
      admin
        .from("talent_experiences")
        .select(
          "id, talent_id, role, description, start_date, end_date, months, company_id, company_link, company_name, company_location, company_logo, memo, created_at"
        )
        .eq("talent_id", userId)
        .order("start_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false }),
      admin
        .from("talent_educations")
        .select(
          "id, talent_id, school, degree, description, field, start_date, end_date, url, memo, created_at"
        )
        .eq("talent_id", userId)
        .order("start_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false }),
      admin
        .from("talent_extras")
        .select("talent_id, content")
        .eq("talent_id", userId)
        .maybeSingle(),
      talentUser
        ? Promise.resolve({ data: talentUser, error: null })
        : admin
            .from("talent_users")
            .select("user_id, name, profile_picture, headline, bio, location")
            .eq("user_id", userId)
            .maybeSingle(),
    ]);

  if (experienceRes.error) {
    throw new Error(
      experienceRes.error.message ?? "Failed to load talent_experiences"
    );
  }
  if (educationRes.error) {
    throw new Error(
      educationRes.error.message ?? "Failed to load talent_educations"
    );
  }
  if (extrasRes.error) {
    throw new Error(extrasRes.error.message ?? "Failed to load talent_extras");
  }
  if (fallbackUser.error) {
    throw new Error(
      fallbackUser.error.message ?? "Failed to load talent_users"
    );
  }

  const userRow = (fallbackUser.data ?? null) as Pick<
    TalentUserProfileRow,
    "user_id" | "name" | "profile_picture" | "headline" | "bio" | "location"
  > | null;

  return {
    talentUser: userRow,
    talentExperiences: (experienceRes.data ?? []) as TalentExperienceRow[],
    talentEducations: (educationRes.data ?? []) as TalentEducationRow[],
    talentExtras: parseTalentExtrasContent(
      (extrasRes.data as TalentExtraRow | null)?.content
    ),
  } satisfies TalentStructuredProfile;
}

function clampPromptText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function formatDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
) {
  const start = String(startDate ?? "").trim();
  const end = String(endDate ?? "").trim();
  if (!start && !end) return "";
  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start} ~ Present`;
  return end;
}

export function buildTalentProfileContext(args: {
  profile: TalentUserProfileRow | null;
  structuredProfile?: TalentStructuredProfile | null;
  maxResumeChars?: number;
}) {
  const { profile, structuredProfile, maxResumeChars = 3000 } = args;
  const lines: string[] = [];
  const talentUser = structuredProfile?.talentUser ?? profile;
  const resumeLinks = (profile?.resume_links ?? []).filter(
    (link): link is string => typeof link === "string" && link.trim().length > 0
  );
  const experiences = structuredProfile?.talentExperiences ?? [];
  const educations = structuredProfile?.talentEducations ?? [];
  const extras = structuredProfile?.talentExtras ?? [];

  lines.push("[Structured Talent Profile]");

  if (talentUser) {
    lines.push("Basic");
    if (talentUser.name) lines.push(`- Name: ${talentUser.name}`);
    if (talentUser.headline) lines.push(`- Headline: ${talentUser.headline}`);
    if (talentUser.location) lines.push(`- Location: ${talentUser.location}`);
    const bio = clampPromptText(talentUser.bio, 1200);
    if (bio) lines.push(`- Bio: ${bio}`);
  }

  if (profile?.resume_file_name) {
    lines.push(`- Resume File: ${profile.resume_file_name}`);
  }

  if (resumeLinks.length > 0) {
    lines.push("Resume Links");
    resumeLinks.slice(0, 12).forEach((link, index) => {
      lines.push(`${index + 1}. ${link}`);
    });
  }

  if (experiences.length > 0) {
    lines.push("Experiences");
    experiences.slice(0, 12).forEach((experience, index) => {
      const parts = [
        `Role: ${experience.role ?? "(unknown)"}`,
        `Company: ${experience.company_name ?? "(unknown)"}`,
      ];
      const dateRange = formatDateRange(
        experience.start_date,
        experience.end_date
      );
      if (dateRange) parts.push(`Dates: ${dateRange}`);
      if (experience.months && experience.months > 0) {
        parts.push(`Months: ${experience.months}`);
      }
      if (experience.company_location) {
        parts.push(`Location: ${experience.company_location}`);
      }

      let itemText = `${index + 1}. ${parts.join(", ")}`;
      const description = clampPromptText(experience.description, 700);
      if (description) itemText += `\n   Description: ${description}`;
      const memo = clampPromptText(experience.memo, 280);
      if (memo) itemText += `\n   Memo: ${memo}`;
      lines.push(itemText);
    });
  }

  if (educations.length > 0) {
    lines.push("Educations");
    educations.slice(0, 8).forEach((education, index) => {
      const parts = [
        `School: ${education.school ?? "(unknown)"}`,
        `Degree: ${education.degree ?? "(unknown)"}`,
      ];
      if (education.field) parts.push(`Field: ${education.field}`);
      const dateRange = formatDateRange(
        education.start_date,
        education.end_date
      );
      if (dateRange) parts.push(`Dates: ${dateRange}`);

      let itemText = `${index + 1}. ${parts.join(", ")}`;
      const memo = clampPromptText(education.memo, 280);
      if (memo) itemText += `\n   Memo: ${memo}`;
      lines.push(itemText);
    });
  }

  if (extras.length > 0) {
    lines.push("Extras");
    extras.slice(0, 10).forEach((extra, index) => {
      const parts = [`Title: ${extra.title ?? "(unknown)"}`];
      if (extra.date) parts.push(`Date: ${extra.date}`);

      let itemText = `${index + 1}. ${parts.join(", ")}`;
      const description = clampPromptText(extra.description, 500);
      if (description) itemText += `\n   Description: ${description}`;
      const memo = clampPromptText(extra.memo, 280);
      if (memo) itemText += `\n   Memo: ${memo}`;
      lines.push(itemText);
    });
  }

  const resumeSnippet = clampPromptText(profile?.resume_text, maxResumeChars);
  if (resumeSnippet) {
    lines.push("Resume Text Snippet");
    lines.push(resumeSnippet);
  }

  return lines.join("\n");
}

export async function fetchTalentSetting(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
}) {
  const { admin, userId } = args;
  const { data, error } = await admin
    .from("talent_setting")
    .select(
      "user_id, profile_visibility, blocked_companies, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_setting");
  }

  return (data ?? null) as TalentSettingRow | null;
}

export async function upsertTalentSetting(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  userId: string;
  profileVisibility: TalentProfileVisibility;
  blockedCompanies: string[];
}) {
  const { admin, userId, profileVisibility, blockedCompanies } = args;
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("talent_setting")
    .upsert(
      {
        user_id: userId,
        profile_visibility: profileVisibility,
        blocked_companies: blockedCompanies,
        updated_at: now,
      },
      { onConflict: "user_id" }
    )
    .select(
      "user_id, profile_visibility, blocked_companies, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save talent_setting");
  }

  return data as TalentSettingRow;
}

export async function getTalentResumeSignedUrl(args: {
  admin: ReturnType<typeof getTalentSupabaseAdmin>;
  storagePath: string | null | undefined;
  expiresIn?: number;
}) {
  const { admin, storagePath, expiresIn = 3600 } = args;
  if (!storagePath) return null;

  const { data, error } = await admin.storage
    .from(TALENT_RESUME_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    return null;
  }
  return data?.signedUrl ?? null;
}
