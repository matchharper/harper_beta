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
import { safeSlice } from "@/lib/textSanitization";

export const MEMO_MAX_CHARS = 2000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown, maxLength = 4000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return safeSlice(normalized, maxLength);
}

function asMultilineText(value: unknown, maxLength = 4000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) return null;
  return safeSlice(normalized, maxLength);
}

function asDateText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return safeSlice(normalized, 32);
}

function asRowIdText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return safeSlice(normalized, 120);
}

function normalizeExtraRowIdSeed(value: string | null | undefined): string {
  return String(value ?? "")
    .toLocaleLowerCase("ko")
    .replace(/\s+/g, " ")
    .trim();
}

function stableExtraRowHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildExtraBaseRowId(extra: TalentExtraItem) {
  if (extra.id) return extra.id;
  const seed =
    [
      normalizeExtraRowIdSeed(extra.title),
      normalizeExtraRowIdSeed(extra.date),
      normalizeExtraRowIdSeed(extra.description),
    ].join("|") || "extra";
  return `extra_${stableExtraRowHash(seed)}`;
}

function assignTalentExtraRowIds(items: TalentExtraItem[]): TalentExtraItem[] {
  const used = new Set<string>();
  const baseCounts = new Map<string, number>();

  return items.map((item) => {
    const base = buildExtraBaseRowId(item);
    let count = (baseCounts.get(base) ?? 0) + 1;
    baseCounts.set(base, count);

    let rowId = count === 1 ? base : `${base}_${count}`;
    while (used.has(rowId)) {
      count += 1;
      rowId = `${base}_${count}`;
    }
    used.add(rowId);
    return { ...item, id: rowId };
  });
}

function toTalentExtraItem(value: unknown): TalentExtraItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const id =
    asRowIdText(record.id) ??
    asRowIdText(record.rowId) ??
    asRowIdText(record.row_id);
  const title =
    asText(record.title, 300) ??
    asText(record.name, 300) ??
    asText(record.role, 300);
  const description =
    asMultilineText(record.description, 8000) ??
    asMultilineText(record.content, 8000) ??
    asMultilineText(record.summary, 8000);
  const date =
    asDateText(record.date) ??
    asDateText(record.issued_at) ??
    asDateText(record.published_at) ??
    asDateText(record.start_date);
  const memo = asMultilineText(record.memo, MEMO_MAX_CHARS);

  if (!title && !description && !date && !memo) return null;
  return { id, title, description, date, memo };
}

function parseTalentExtrasContent(content: unknown): TalentExtraItem[] {
  const fromArray = (value: unknown) =>
    assignTalentExtraRowIds(
      (Array.isArray(value) ? value : [])
        .map((item) => toTalentExtraItem(item))
        .filter((item): item is TalentExtraItem => Boolean(item))
    );

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

function serializeTalentExtraItems(items: TalentExtraItem[]) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    date: item.date,
    memo: item.memo,
  }));
}

function replaceTalentExtrasContentItems(
  content: unknown,
  items: TalentExtraItem[]
) {
  const serialized = serializeTalentExtraItems(items);
  if (Array.isArray(content)) return serialized;

  const record = asRecord(content);
  if (!record) return serialized;

  if (Array.isArray(record.talent_extras)) {
    return { ...record, talent_extras: serialized };
  }
  if (Array.isArray(record.talentExtras)) {
    return { ...record, talentExtras: serialized };
  }
  if (Array.isArray(record.items)) {
    return { ...record, items: serialized };
  }
  if (Array.isArray(record.publications)) {
    return { ...record, publications: serialized };
  }
  return { ...record, talent_extras: serialized };
}

function clampPromptText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r/g, "").trim();
  if (!normalized) return "";
  return safeSlice(normalized, maxLength);
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
      "user_id, email, phone_number, name, profile_picture, headline, bio, current_location, location, last_logined_at, resume_file_name, resume_storage_path, resume_text, resume_links, created_at, updated_at"
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
            .select(
              "user_id, email, phone_number, name, profile_picture, headline, bio, current_location, location"
            )
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
    | "user_id"
    | "email"
    | "phone_number"
    | "name"
    | "profile_picture"
    | "headline"
    | "bio"
    | "current_location"
    | "location"
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
  const extras = assignTalentExtraRowIds(structuredProfile?.talentExtras ?? []);
  const blockedCompanies = normalizeTalentBlockedCompanies(
    setting?.blocked_companies ?? []
  ).slice(0, 20);

  lines.push("[Structured Talent Profile]");

  if (talentUser) {
    lines.push("Basic");
    if (talentUser.name) lines.push(`- Name: ${talentUser.name}`);
    if (talentUser.headline) lines.push(`- Headline: ${talentUser.headline}`);
    if (talentUser.location) lines.push(`- Location: ${talentUser.location}`);
    const currentLocation = clampPromptText(
      talentUser.current_location ?? profile?.current_location,
      240
    );
    if (currentLocation && currentLocation !== talentUser.location) {
      lines.push(`- Signup/current location: ${currentLocation}`);
    }
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
      const memo = clampPromptText(experience.memo, MEMO_MAX_CHARS);
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
      const memo = clampPromptText(education.memo, MEMO_MAX_CHARS);
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
      if (includeRowIds && extra.id) {
        itemText += `\n   RowID: ${extra.id}`;
      }
      const description = clampPromptText(extra.description, 500);
      if (description) itemText += `\n   Description: ${description}`;
      const memo = clampPromptText(extra.memo, MEMO_MAX_CHARS);
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

export type RowMemoOperation = "append" | "update";

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
      reason: "row_not_found" | "empty_input";
    };

export function applyRowMemoOperation(args: {
  existing: string | null | undefined;
  memo: string;
  operation: RowMemoOperation;
}) {
  const { existing, memo, operation } = args;
  const trimmedExisting = (existing ?? "").replace(/\r/g, "").trim();
  const trimmedNew = memo.replace(/\r/g, "").trim();
  if (operation === "update") {
    return safeSlice(trimmedNew, MEMO_MAX_CHARS);
  }
  if (!trimmedNew) return null;
  if (
    trimmedExisting === trimmedNew ||
    trimmedExisting.endsWith(`\n${trimmedNew}`)
  ) {
    return safeSlice(trimmedExisting, MEMO_MAX_CHARS);
  }
  const appended = trimmedExisting
    ? `${trimmedExisting}\n${trimmedNew}`
    : trimmedNew;
  return safeSlice(appended, MEMO_MAX_CHARS);
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

export async function mutateExperienceMemo(args: {
  admin: TalentAdminClient;
  userId: string;
  rowId: string | number;
  memo: string;
  operation: RowMemoOperation;
}): Promise<RowMemoOutcome> {
  const { admin, userId, rowId, memo, operation } = args;
  const parsedId = parseRowIdToNumber(rowId);
  if (parsedId === null) return { ok: false, reason: "row_not_found" };
  const row = await fetchExperienceForMemo({ admin, userId, rowId: parsedId });
  if (!row) return { ok: false, reason: "row_not_found" };
  const next = applyRowMemoOperation({
    existing: row.memo,
    memo,
    operation,
  });
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

export async function mutateEducationMemo(args: {
  admin: TalentAdminClient;
  userId: string;
  rowId: string | number;
  memo: string;
  operation: RowMemoOperation;
}): Promise<RowMemoOutcome> {
  const { admin, userId, rowId, memo, operation } = args;
  const parsedId = parseRowIdToNumber(rowId);
  if (parsedId === null) return { ok: false, reason: "row_not_found" };
  const row = await fetchEducationForMemo({ admin, userId, rowId: parsedId });
  if (!row) return { ok: false, reason: "row_not_found" };
  const next = applyRowMemoOperation({
    existing: row.memo,
    memo,
    operation,
  });
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

export async function mutateExtraMemo(args: {
  admin: TalentAdminClient;
  userId: string;
  rowId: string;
  memo: string;
  operation: RowMemoOperation;
}): Promise<RowMemoOutcome> {
  const { admin, userId, rowId, memo, operation } = args;
  const queryRowId = rowId.trim();
  if (!queryRowId) {
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
  if (!data) return { ok: false, reason: "row_not_found" };

  const items = parseTalentExtrasContent(data.content);
  const matchIndex = items.findIndex((item) => item.id === queryRowId);
  if (matchIndex < 0) {
    return { ok: false, reason: "row_not_found" };
  }

  const target = items[matchIndex];
  const next = applyRowMemoOperation({
    existing: target.memo,
    memo,
    operation,
  });
  if (next === null) return { ok: false, reason: "empty_input" };
  if (next === (target.memo ?? "")) {
    return {
      ok: true,
      target: {
        entityId: target.id,
        entityLabel: target.title ?? rowId,
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
    .update({
      content: replaceTalentExtrasContentItems(data.content, nextItems),
    })
    .eq("talent_id", userId);
  if (updateError) {
    throw new Error(
      updateError.message ?? "Failed to update talent_extras memo"
    );
  }
  return {
    ok: true,
    target: {
      entityId: target.id,
      entityLabel: target.title ?? rowId,
      entityType: "extra",
    },
    updated: true,
  };
}
