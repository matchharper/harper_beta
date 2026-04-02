import type { Database } from "@/types/database.types";

export const NETWORK_WAITLIST_TYPE = 2;

type NetworkWaitlistRow = Pick<
  Database["public"]["Tables"]["harper_waitlist"]["Row"],
  "created_at" | "email" | "id" | "is_mobile" | "local_id" | "name" | "text" | "url"
>;

type UnknownRecord = Record<string, unknown>;

export type NetworkLeadPayload = {
  source?: string | null;
  selected_role?: string | null;
  profile_input_types?: string[];
  linkedin_profile_url?: string | null;
  personal_website_url?: string | null;
  github_profile_url?: string | null;
  scholar_profile_url?: string | null;
  cv_file_name?: string | null;
  cv_storage_bucket?: string | null;
  cv_storage_path?: string | null;
  impact_summary?: string | null;
  engagement_types?: string[];
  preferred_locations?: string[];
  career_move_intent?: string | null;
  career_move_intent_label?: string | null;
  dream_teams?: string | null;
  submitted_at?: string | null;
};

export type NetworkLead = {
  id: number;
  createdAt: string;
  submittedAt: string;
  email: string | null;
  isMobile: boolean | null;
  localId: string | null;
  name: string | null;
  primaryProfileUrl: string | null;
  source: string | null;
  selectedRole: string | null;
  profileInputTypes: string[];
  linkedinProfileUrl: string | null;
  personalWebsiteUrl: string | null;
  githubProfileUrl: string | null;
  scholarProfileUrl: string | null;
  cvFileName: string | null;
  cvStorageBucket: string | null;
  cvStoragePath: string | null;
  hasCv: boolean;
  impactSummary: string | null;
  engagementTypes: string[];
  preferredLocations: string[];
  careerMoveIntent: string | null;
  careerMoveIntentLabel: string | null;
  dreamTeams: string | null;
  rawPayload: NetworkLeadPayload;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
}

export function parseNetworkLeadPayload(raw: string | null) {
  if (!raw) return {} as NetworkLeadPayload;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {} as NetworkLeadPayload;

    return {
      source: normalizeString(parsed.source),
      selected_role: normalizeString(parsed.selected_role),
      profile_input_types: normalizeStringArray(parsed.profile_input_types),
      linkedin_profile_url: normalizeString(parsed.linkedin_profile_url),
      personal_website_url: normalizeString(parsed.personal_website_url),
      github_profile_url: normalizeString(parsed.github_profile_url),
      scholar_profile_url: normalizeString(parsed.scholar_profile_url),
      cv_file_name: normalizeString(parsed.cv_file_name),
      cv_storage_bucket: normalizeString(parsed.cv_storage_bucket),
      cv_storage_path: normalizeString(parsed.cv_storage_path),
      impact_summary: normalizeString(parsed.impact_summary),
      engagement_types: normalizeStringArray(parsed.engagement_types),
      preferred_locations: normalizeStringArray(parsed.preferred_locations),
      career_move_intent: normalizeString(parsed.career_move_intent),
      career_move_intent_label: normalizeString(parsed.career_move_intent_label),
      dream_teams: normalizeString(parsed.dream_teams),
      submitted_at: normalizeString(parsed.submitted_at),
    } satisfies NetworkLeadPayload;
  } catch {
    return {} as NetworkLeadPayload;
  }
}

export function buildNetworkLead(row: NetworkWaitlistRow): NetworkLead {
  const payload = parseNetworkLeadPayload(row.text);

  return {
    id: row.id,
    createdAt: row.created_at,
    submittedAt: payload.submitted_at ?? row.created_at,
    email: normalizeString(row.email),
    isMobile: row.is_mobile,
    localId: normalizeString(row.local_id),
    name: normalizeString(row.name),
    primaryProfileUrl: normalizeString(row.url),
    source: payload.source ?? null,
    selectedRole: payload.selected_role ?? null,
    profileInputTypes: payload.profile_input_types ?? [],
    linkedinProfileUrl: payload.linkedin_profile_url ?? null,
    personalWebsiteUrl: payload.personal_website_url ?? null,
    githubProfileUrl: payload.github_profile_url ?? null,
    scholarProfileUrl: payload.scholar_profile_url ?? null,
    cvFileName: payload.cv_file_name ?? null,
    cvStorageBucket: payload.cv_storage_bucket ?? null,
    cvStoragePath: payload.cv_storage_path ?? null,
    hasCv: Boolean(payload.cv_storage_bucket && payload.cv_storage_path),
    impactSummary: payload.impact_summary ?? null,
    engagementTypes: payload.engagement_types ?? [],
    preferredLocations: payload.preferred_locations ?? [],
    careerMoveIntent: payload.career_move_intent ?? null,
    careerMoveIntentLabel: payload.career_move_intent_label ?? null,
    dreamTeams: payload.dream_teams ?? null,
    rawPayload: payload,
  };
}
