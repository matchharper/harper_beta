import {
  getTalentCareerMoveIntentLabel,
  getTalentEngagementLabels,
  getTalentLocationLabels,
} from "@/lib/talentNetworkApplication";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type {
  TalentEducationRow,
  TalentExperienceRow,
  TalentExtraItem,
  TalentExtraRow,
  TalentSettingRow,
  TalentStructuredProfile,
  TalentUserProfileRow,
} from "@/lib/talentOnboarding/models";
import {
  getTalentProfileVisibilityLabel,
  normalizeTalentBlockedCompanies,
  normalizeTalentEngagementTypes,
  normalizeTalentPreferredLocations,
  sanitizeTalentCareerMoveIntent,
} from "@/lib/talentOnboarding/stateStore";

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

export async function fetchTalentUserProfile(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { admin, userId } = args;
  const { data, error } = await admin
    .from("talent_users")
    .select(
      "user_id, email, name, profile_picture, headline, bio, location, career_profile, last_logined_at, network_waitlist_id, network_claimed_at, network_source_talent_id, network_application, resume_file_name, resume_storage_path, resume_text, resume_links, created_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_users profile");
  }

  return (data ?? null) as TalentUserProfileRow | null;
}

export async function markTalentUserLoggedIn(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { admin, userId } = args;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("talent_users")
    .update({
      last_logined_at: now,
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message ?? "Failed to update talent login timestamp");
  }
}

export async function fetchTalentStructuredProfile(args: {
  admin: TalentAdminClient;
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

export function buildTalentProfileContext(args: {
  profile: TalentUserProfileRow | null;
  structuredProfile?: TalentStructuredProfile | null;
  setting?: TalentSettingRow | null;
  maxResumeChars?: number;
}) {
  const { profile, structuredProfile, setting, maxResumeChars = 3000 } = args;
  const lines: string[] = [];
  const talentUser = structuredProfile?.talentUser ?? profile;
  const resumeLinks = (profile?.resume_links ?? []).filter(
    (link): link is string => typeof link === "string" && link.trim().length > 0
  );
  const experiences = structuredProfile?.talentExperiences ?? [];
  const educations = structuredProfile?.talentEducations ?? [];
  const extras = structuredProfile?.talentExtras ?? [];
  const engagementLabels = getTalentEngagementLabels(
    normalizeTalentEngagementTypes(setting?.engagement_types ?? [])
  );
  const locationLabels = getTalentLocationLabels(
    normalizeTalentPreferredLocations(setting?.preferred_locations ?? [])
  );
  const careerMoveIntentLabel = getTalentCareerMoveIntentLabel(
    sanitizeTalentCareerMoveIntent(setting?.career_move_intent)
  );
  const blockedCompanies = normalizeTalentBlockedCompanies(
    setting?.blocked_companies ?? []
  ).slice(0, 20);

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

  lines.push("Talent Settings");
  lines.push(
    `- Profile visibility: ${getTalentProfileVisibilityLabel(
      setting?.profile_visibility
    )}`
  );
  lines.push(
    `- Preferred engagement types: ${
      engagementLabels.length > 0 ? engagementLabels.join(", ") : "(none)"
    }`
  );
  lines.push(
    `- Career move intent: ${careerMoveIntentLabel ?? "(not set)"}`
  );
  lines.push(
    `- Preferred locations: ${
      locationLabels.length > 0 ? locationLabels.join(", ") : "(none)"
    }`
  );
  lines.push(
    `- Blocked companies: ${
      blockedCompanies.length > 0 ? blockedCompanies.join(", ") : "(none)"
    }`
  );

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
