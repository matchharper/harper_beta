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
      "user_id, email, name, profile_picture, headline, bio, location, last_logined_at, resume_file_name, resume_storage_path, resume_text, resume_links, created_at, updated_at"
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
          "id, talent_id, role, description, employment_type, start_date, end_date, months, company_id, company_link, company_name, company_location, company_logo, memo, created_at"
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
  includeResumeFileName?: boolean;
  includeResumeText?: boolean;
  includeRowIds?: boolean;
  profile: TalentUserProfileRow | null;
  structuredProfile?: TalentStructuredProfile | null;
  setting?: TalentSettingRow | null;
  maxResumeChars?: number;
}) {
  const {
    includeResumeFileName = true,
    includeResumeText = false,
    includeRowIds = true,
    profile,
    structuredProfile,
    setting,
    maxResumeChars = 3000,
  } = args;
  const lines: string[] = [];
  const talentUser = structuredProfile?.talentUser ?? profile;
  const resumeLinks = (profile?.resume_links ?? []).filter(
    (link): link is string => typeof link === "string" && link.trim().length > 0
  );
  const experiences = structuredProfile?.talentExperiences ?? [];
  const educations = structuredProfile?.talentEducations ?? [];
  const extras = structuredProfile?.talentExtras ?? [];
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

  if (includeResumeFileName && profile?.resume_file_name) {
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
      if (experience.employment_type) {
        parts.push(`Employment type: ${experience.employment_type}`);
      }
      if (experience.company_location) {
        parts.push(`Location: ${experience.company_location}`);
      }

      let itemText = `${index + 1}. ${parts.join(", ")}`;
      if (includeRowIds && experience.id) {
        itemText += `\n   RowID: ${experience.id}`;
      }
      const description = clampPromptText(experience.description, 700);
      if (description) itemText += `\n   Description: ${description}`;
      const memo = clampPromptText(experience.memo, 600);
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
      if (includeRowIds && education.id) {
        itemText += `\n   RowID: ${education.id}`;
      }
      const memo = clampPromptText(education.memo, 600);
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
      const memo = clampPromptText(extra.memo, 600);
      if (memo) itemText += `\n   Memo: ${memo}`;
      lines.push(itemText);
    });
  }

  const resumeSnippet = includeResumeText
    ? clampPromptText(profile?.resume_text, maxResumeChars)
    : "";
  if (resumeSnippet) {
    lines.push("Resume Text Snippet");
    lines.push(resumeSnippet);
  }

  return lines.join("\n");
}

const MEMO_MAX_CHARS = 2000;

export type RowMemoOutcome =
  | {
      ok: true;
      target?: {
        entityId?: number | string | null;
        entityLabel: string;
        entityType: "education" | "experience" | "extra";
      };
      updated: boolean;
    }
  | {
      ok: false;
      reason:
        | "row_not_found"
        | "title_not_found"
        | "ambiguous_title"
        | "empty_input";
    };

function joinMemoWithDelta(
  existing: string | null | undefined,
  newInfo: string
) {
  const trimmedExisting = (existing ?? "").replace(/\r/g, "").trim();
  const trimmedNew = newInfo.replace(/\r/g, "").trim();
  if (!trimmedNew) return null;
  const joined = trimmedExisting
    ? `${trimmedExisting}\n${trimmedNew}`
    : trimmedNew;
  return joined.slice(0, MEMO_MAX_CHARS);
}

function parseRowIdToNumber(rowId: string | number | null | undefined) {
  if (
    typeof rowId === "number" &&
    Number.isFinite(rowId) &&
    Number.isInteger(rowId)
  ) {
    return rowId;
  }
  if (typeof rowId !== "string") return null;
  const trimmed = rowId.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0)
    return null;
  return parsed;
}

function normalizeMemoTargetText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function describeExperienceMemoTarget(row: {
  company_name?: unknown;
  id?: unknown;
  role?: unknown;
}) {
  const role = normalizeMemoTargetText(row.role);
  const company = normalizeMemoTargetText(row.company_name);
  if (role && company) return `${role} at ${company}`;
  if (role) return role;
  if (company) return company;
  return `experience ${row.id ?? ""}`.trim();
}

function describeEducationMemoTarget(row: {
  degree?: unknown;
  field?: unknown;
  id?: unknown;
  school?: unknown;
}) {
  const school = normalizeMemoTargetText(row.school);
  const degree = normalizeMemoTargetText(row.degree);
  const field = normalizeMemoTargetText(row.field);
  const program = [degree, field].filter(Boolean).join(" in ");
  if (school && program) return `${program} at ${school}`;
  if (school) return school;
  if (program) return program;
  return `education ${row.id ?? ""}`.trim();
}

export async function fetchExperienceForMemo(args: {
  admin: TalentAdminClient;
  userId: string;
  rowId: string | number;
}) {
  const { admin, userId, rowId } = args;
  const parsedId = parseRowIdToNumber(rowId);
  if (parsedId === null) return null;
  const { data, error } = await admin
    .from("talent_experiences")
    .select("id, talent_id, memo, role, company_name")
    .eq("id", parsedId)
    .eq("talent_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to load talent_experiences row");
  }
  return data ?? null;
}

export async function fetchEducationForMemo(args: {
  admin: TalentAdminClient;
  userId: string;
  rowId: string | number;
}) {
  const { admin, userId, rowId } = args;
  const parsedId = parseRowIdToNumber(rowId);
  if (parsedId === null) return null;
  const { data, error } = await admin
    .from("talent_educations")
    .select("id, talent_id, memo, school, degree, field")
    .eq("id", parsedId)
    .eq("talent_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to load talent_educations row");
  }
  return data ?? null;
}

export async function appendExperienceMemo(args: {
  admin: TalentAdminClient;
  userId: string;
  rowId: string | number;
  newInfo: string;
}): Promise<RowMemoOutcome> {
  const { admin, userId, rowId, newInfo } = args;
  const parsedId = parseRowIdToNumber(rowId);
  if (parsedId === null) return { ok: false, reason: "row_not_found" };
  const row = await fetchExperienceForMemo({ admin, userId, rowId: parsedId });
  if (!row) return { ok: false, reason: "row_not_found" };
  const next = joinMemoWithDelta(row.memo, newInfo);
  if (next === null) return { ok: false, reason: "empty_input" };
  if (next === (row.memo ?? "")) {
    return {
      ok: true,
      target: {
        entityId: parsedId,
        entityLabel: describeExperienceMemoTarget(row),
        entityType: "experience",
      },
      updated: false,
    };
  }
  const { error } = await admin
    .from("talent_experiences")
    .update({ memo: next })
    .eq("id", parsedId)
    .eq("talent_id", userId);
  if (error) {
    throw new Error(
      error.message ?? "Failed to update talent_experiences memo"
    );
  }
  return {
    ok: true,
    target: {
      entityId: parsedId,
      entityLabel: describeExperienceMemoTarget(row),
      entityType: "experience",
    },
    updated: true,
  };
}

export async function appendEducationMemo(args: {
  admin: TalentAdminClient;
  userId: string;
  rowId: string | number;
  newInfo: string;
}): Promise<RowMemoOutcome> {
  const { admin, userId, rowId, newInfo } = args;
  const parsedId = parseRowIdToNumber(rowId);
  if (parsedId === null) return { ok: false, reason: "row_not_found" };
  const row = await fetchEducationForMemo({ admin, userId, rowId: parsedId });
  if (!row) return { ok: false, reason: "row_not_found" };
  const next = joinMemoWithDelta(row.memo, newInfo);
  if (next === null) return { ok: false, reason: "empty_input" };
  if (next === (row.memo ?? "")) {
    return {
      ok: true,
      target: {
        entityId: parsedId,
        entityLabel: describeEducationMemoTarget(row),
        entityType: "education",
      },
      updated: false,
    };
  }
  const { error } = await admin
    .from("talent_educations")
    .update({ memo: next })
    .eq("id", parsedId)
    .eq("talent_id", userId);
  if (error) {
    throw new Error(error.message ?? "Failed to update talent_educations memo");
  }
  return {
    ok: true,
    target: {
      entityId: parsedId,
      entityLabel: describeEducationMemoTarget(row),
      entityType: "education",
    },
    updated: true,
  };
}

export async function appendExtraMemo(args: {
  admin: TalentAdminClient;
  userId: string;
  title: string;
  newInfo: string;
}): Promise<RowMemoOutcome> {
  const { admin, userId, title, newInfo } = args;
  const queryTitle = title.trim().toLocaleLowerCase("ko");
  if (!queryTitle) {
    return { ok: false, reason: "empty_input" };
  }

  const { data, error } = await admin
    .from("talent_extras")
    .select("talent_id, content")
    .eq("talent_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to load talent_extras row");
  }
  if (!data) return { ok: false, reason: "title_not_found" };

  const items = parseTalentExtrasContent(data.content);
  const matchIndices: number[] = [];
  items.forEach((item, index) => {
    const itemTitle = item.title?.trim().toLocaleLowerCase("ko") ?? "";
    if (itemTitle && itemTitle === queryTitle) matchIndices.push(index);
  });
  if (matchIndices.length === 0) {
    return { ok: false, reason: "title_not_found" };
  }
  if (matchIndices.length > 1) {
    return { ok: false, reason: "ambiguous_title" };
  }

  const matchIndex = matchIndices[0];
  const target = items[matchIndex];
  const next = joinMemoWithDelta(target.memo, newInfo);
  if (next === null) return { ok: false, reason: "empty_input" };
  if (next === (target.memo ?? "")) {
    return {
      ok: true,
      target: {
        entityLabel: target.title ?? title,
        entityType: "extra",
      },
      updated: false,
    };
  }

  const nextItems = items.map((item, index) =>
    index === matchIndex ? { ...item, memo: next } : item
  );

  const { error: updateError } = await admin
    .from("talent_extras")
    .update({ content: nextItems })
    .eq("talent_id", userId);
  if (updateError) {
    throw new Error(
      updateError.message ?? "Failed to update talent_extras memo"
    );
  }
  return {
    ok: true,
    target: {
      entityLabel: target.title ?? title,
      entityType: "extra",
    },
    updated: true,
  };
}
