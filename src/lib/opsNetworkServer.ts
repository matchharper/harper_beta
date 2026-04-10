// @ts-ignore: pdf parser has loose types.
import pdf from "pdf-parse-fork";
import { InternalApiError } from "@/lib/internalApi";
import {
  getNetworkTalentId,
  hasStructuredTalentProfile,
  type NetworkLeadDetailResponse,
  type NetworkLeadLatestExperience,
  type NetworkLeadListFilters,
  type NetworkLeadListResponse,
  type NetworkLeadListStats,
  type NetworkLeadRecentMemo,
  type NetworkLeadSummary,
  type TalentInternalEntry,
  type TalentInternalType,
} from "@/lib/opsNetwork";
import {
  buildNetworkLead,
  NETWORK_WAITLIST_TYPE,
  type NetworkLead,
} from "@/lib/networkOps";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentStructuredProfile,
  fetchTalentUserProfile,
  getTalentSupabaseAdmin,
  mergeTalentInsightContent,
  mergeTalentSettingSeed,
  upsertTalentInsights,
  upsertTalentSetting,
} from "@/lib/talentOnboarding/server";
import { findClaimedTalentUserByWaitlistId } from "@/lib/talentOnboarding/networkClaim";
import { ingestTalentProfileFromLinkedin } from "@/lib/talentOnboarding/profileIngestion";
import { normalizeTalentNetworkApplication } from "@/lib/talentNetworkApplication";
import type { Database } from "@/types/database.types";

type NetworkWaitlistRow = Pick<
  Database["public"]["Tables"]["harper_waitlist"]["Row"],
  | "id"
  | "created_at"
  | "email"
  | "is_mobile"
  | "local_id"
  | "name"
  | "text"
  | "url"
>;

type TalentInternalInsert =
  Database["public"]["Tables"]["talent_internal"]["Insert"];
type TalentNotificationInsert =
  Database["public"]["Tables"]["talent_notification"]["Insert"];

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const MAX_SCAN_LIMIT = 5_000;
const MAX_RESUME_TEXT_CHARS = 20_000;
const EDITABLE_INTERNAL_TYPES = new Set<TalentInternalType>([
  "conversation",
  "memo",
]);

function normalizeText(value: string | null | undefined, maxLength = 4000) {
  const normalized = String(value ?? "")
    .replace(/\r/g, "")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function parseOffset(value: string | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.floor(numeric));
}

type NetworkLeadFilterArgs = {
  cvOnly?: boolean;
  move?: string | null;
  query?: string | null;
  role?: string | null;
};

export function parseLeadLimit(value: string | null) {
  const numeric = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(numeric)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(numeric)));
}

export function parseLeadQuery(value: string | null) {
  return normalizeText(value, 200);
}

export function parseLeadFilterValue(value: string | null) {
  return normalizeText(value, 120);
}

export function parseLeadBoolean(value: string | null) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized === "1" || normalized === "true";
}

function profileHasStructuredData(
  row:
    | Pick<
        Database["public"]["Tables"]["talent_users"]["Row"],
        "headline" | "bio" | "location" | "resume_text"
      >
    | null
    | undefined
) {
  return Boolean(
    row?.headline || row?.bio || row?.location || row?.resume_text
  );
}

function collectLeadLinks(lead: NetworkLead) {
  return dedupeStrings([
    lead.linkedinProfileUrl,
    lead.githubProfileUrl,
    lead.scholarProfileUrl,
    lead.primaryProfileUrl,
  ]);
}

function buildLeadInsightSeed(lead: NetworkLead) {
  const content = {
    ...(lead.impactSummary ? { technical_strengths: lead.impactSummary } : {}),
    ...(lead.dreamTeams ? { desired_teams: lead.dreamTeams } : {}),
  };

  return Object.keys(content).length > 0 ? content : null;
}

function isPdfResume(args: {
  fileName?: string | null;
  mimeType?: string | null;
}) {
  const fileName = String(args.fileName ?? "").toLowerCase();
  const mimeType = String(args.mimeType ?? "").toLowerCase();

  return mimeType === "application/pdf" || fileName.endsWith(".pdf");
}

async function fetchLeadRows(args: {
  limit?: number;
  offset?: number;
  scanAll?: boolean;
}) {
  const { limit = DEFAULT_LIMIT, offset = 0, scanAll = false } = args;

  const { data, error, count } = await supabaseServer
    .from("harper_waitlist")
    .select("id, created_at, email, is_mobile, local_id, name, text, url", {
      count: "exact",
    })
    .eq("type", NETWORK_WAITLIST_TYPE)
    .order("created_at", { ascending: false })
    .range(0, scanAll ? MAX_SCAN_LIMIT - 1 : offset + limit - 1);

  if (error) {
    throw new Error(error.message ?? "Failed to load network leads");
  }

  return {
    rows: ((data ?? []) as NetworkWaitlistRow[]).slice(
      scanAll ? 0 : offset,
      scanAll ? undefined : offset + limit
    ),
    totalCount: count ?? 0,
  };
}

function buildLeadStats(leads: NetworkLead[]): NetworkLeadListStats {
  const readyNowCount = leads.filter(
    (lead) => lead.careerMoveIntent === "ready_to_move"
  ).length;
  const withCvCount = leads.filter((lead) => lead.hasCv).length;
  const recentCount = leads.filter((lead) => {
    const submittedAt = new Date(lead.submittedAt);
    if (Number.isNaN(submittedAt.getTime())) return false;
    const diff = Date.now() - submittedAt.getTime();
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  return {
    readyNowCount,
    recentCount,
    totalCount: leads.length,
    withCvCount,
  };
}

function buildLeadFilterOptions(leads: NetworkLead[]): NetworkLeadListFilters {
  const roleOptions = Array.from(
    new Set(
      leads
        .map((lead) => normalizeText(lead.selectedRole, 200))
        .filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right));

  const moveOptions = Array.from(
    new Set(
      leads
        .map(
          (lead) =>
            normalizeText(
              lead.careerMoveIntentLabel ?? lead.careerMoveIntent ?? "미입력",
              200
            ) ?? "미입력"
        )
        .filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right));

  return { moveOptions, roleOptions };
}

function matchesLeadFilters(lead: NetworkLead, filters: NetworkLeadFilterArgs) {
  if (filters.cvOnly && !lead.hasCv) return false;
  if (filters.role && lead.selectedRole !== filters.role) return false;

  const moveValue =
    normalizeText(lead.careerMoveIntentLabel ?? lead.careerMoveIntent, 200) ??
    "미입력";
  if (filters.move && moveValue !== filters.move) return false;

  const needle = normalizeText(filters.query, 200)?.toLowerCase();
  if (!needle) return true;

  const haystack = [
    lead.name,
    lead.email,
    lead.selectedRole,
    lead.linkedinProfileUrl,
    lead.githubProfileUrl,
    lead.scholarProfileUrl,
    lead.primaryProfileUrl,
    lead.impactSummary,
    lead.dreamTeams,
    lead.careerMoveIntentLabel,
    lead.careerMoveIntent,
    lead.engagementTypes.join(" "),
    lead.preferredLocations.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

function toLatestExperienceSummary(
  experience:
    | Pick<
        Database["public"]["Tables"]["talent_experiences"]["Row"],
        "company_location" | "company_name" | "end_date" | "role" | "start_date"
      >
    | null
    | undefined
): NetworkLeadLatestExperience | null {
  if (!experience) return null;

  return {
    companyLocation: experience.company_location ?? null,
    companyName: experience.company_name ?? null,
    endDate: experience.end_date ?? null,
    role: experience.role ?? null,
    startDate: experience.start_date ?? null,
  };
}

function toRecentMemoSummary(
  entry:
    | Pick<TalentInternalEntry, "content" | "created_at" | "id">
    | null
    | undefined
): NetworkLeadRecentMemo | null {
  if (!entry) return null;

  const content = normalizeText(entry.content, 240);
  if (!content) return null;

  return {
    content,
    createdAt: entry.created_at,
    id: entry.id,
  };
}

export async function fetchNetworkLeadById(leadId: number) {
  const { data, error } = await supabaseServer
    .from("harper_waitlist")
    .select("id, created_at, email, is_mobile, local_id, name, text, url")
    .eq("type", NETWORK_WAITLIST_TYPE)
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load network lead");
  }

  if (!data) {
    throw new InternalApiError(404, "Lead not found");
  }

  return buildNetworkLead(data);
}

async function fetchLeadSummaryDecorations(leads: NetworkLead[]) {
  const admin = getTalentSupabaseAdmin();
  const leadIds = leads.map((lead) => lead.id);

  if (leadIds.length === 0) {
    return {
      latestExperienceByTalentId: new Map<
        string,
        NetworkLeadLatestExperience
      >(),
      lastActivityAtByLeadId: new Map<number, string | null>(),
      recentMemosByLeadId: new Map<number, NetworkLeadRecentMemo[]>(),
      resolvedTalentIdByLeadId: new Map<number, string>(),
      structuredTalentIds: new Set<string>(),
    };
  }

  const sourceTalentIdByLeadId = new Map(
    leads.map((lead) => [lead.id, getNetworkTalentId(lead.id)])
  );

  const [claimedTalentRes, internalRes] = await Promise.all([
    admin
      .from("talent_users")
      .select("network_waitlist_id, user_id")
      .in("network_waitlist_id", leadIds),
    admin
      .from("talent_internal")
      .select("id, waitlist_id, created_at, content, type")
      .in("waitlist_id", leadIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  if (claimedTalentRes.error) {
    throw new Error(
      claimedTalentRes.error.message ?? "Failed to load claimed talent_users"
    );
  }
  if (internalRes.error) {
    throw new Error(
      internalRes.error.message ?? "Failed to load talent_internal"
    );
  }

  const resolvedTalentIdByLeadId = new Map<number, string>();
  for (const lead of leads) {
    resolvedTalentIdByLeadId.set(
      lead.id,
      sourceTalentIdByLeadId.get(lead.id) ?? getNetworkTalentId(lead.id)
    );
  }
  for (const row of claimedTalentRes.data ?? []) {
    if (!row.network_waitlist_id) continue;
    resolvedTalentIdByLeadId.set(row.network_waitlist_id, row.user_id);
  }

  const resolvedTalentIds = Array.from(
    new Set(Array.from(resolvedTalentIdByLeadId.values()))
  );

  const [profileRes, experienceRes, educationRes, extrasRes] =
    resolvedTalentIds.length > 0
      ? await Promise.all([
          admin
            .from("talent_users")
            .select("user_id, headline, bio, location, resume_text")
            .in("user_id", resolvedTalentIds),
          admin
            .from("talent_experiences")
            .select(
              "id, talent_id, role, company_name, company_location, start_date, end_date"
            )
            .in("talent_id", resolvedTalentIds)
            .order("start_date", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false }),
          admin
            .from("talent_educations")
            .select("talent_id")
            .in("talent_id", resolvedTalentIds),
          admin
            .from("talent_extras")
            .select("talent_id")
            .in("talent_id", resolvedTalentIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

  if (profileRes.error) {
    throw new Error(profileRes.error.message ?? "Failed to load talent_users");
  }
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

  const structuredTalentIds = new Set<string>();
  for (const row of profileRes.data ?? []) {
    if (profileHasStructuredData(row)) {
      structuredTalentIds.add(row.user_id);
    }
  }
  for (const row of experienceRes.data ?? []) {
    structuredTalentIds.add(row.talent_id);
  }
  for (const row of educationRes.data ?? []) {
    structuredTalentIds.add(row.talent_id);
  }
  for (const row of extrasRes.data ?? []) {
    structuredTalentIds.add(row.talent_id);
  }

  const latestExperienceByTalentId = new Map<
    string,
    NetworkLeadLatestExperience
  >();
  for (const row of experienceRes.data ?? []) {
    if (latestExperienceByTalentId.has(row.talent_id)) continue;
    const latestExperience = toLatestExperienceSummary(row);
    if (!latestExperience) continue;
    latestExperienceByTalentId.set(row.talent_id, latestExperience);
  }

  const lastActivityAtByLeadId = new Map<number, string | null>();
  const recentMemosByLeadId = new Map<number, NetworkLeadRecentMemo[]>();
  for (const row of internalRes.data ?? []) {
    if (!lastActivityAtByLeadId.has(row.waitlist_id)) {
      lastActivityAtByLeadId.set(row.waitlist_id, row.created_at);
    }

    if (row.type !== "memo") continue;
    const recentMemo = toRecentMemoSummary(row);
    if (!recentMemo) continue;

    const current = recentMemosByLeadId.get(row.waitlist_id) ?? [];
    if (current.length >= 2) continue;
    recentMemosByLeadId.set(row.waitlist_id, [...current, recentMemo]);
  }

  return {
    latestExperienceByTalentId,
    lastActivityAtByLeadId,
    recentMemosByLeadId,
    resolvedTalentIdByLeadId,
    structuredTalentIds,
  };
}

function toLeadSummary(args: {
  lead: NetworkLead;
  latestExperienceByTalentId: Map<string, NetworkLeadLatestExperience>;
  lastActivityAt: string | null;
  recentMemosByLeadId: Map<number, NetworkLeadRecentMemo[]>;
  resolvedTalentId: string;
  structuredTalentIds: Set<string>;
}) {
  return {
    ...args.lead,
    talentId: args.resolvedTalentId,
    hasStructuredProfile: args.structuredTalentIds.has(args.resolvedTalentId),
    lastInternalActivityAt: args.lastActivityAt,
    latestExperience:
      args.latestExperienceByTalentId.get(args.resolvedTalentId) ?? null,
    recentMemos: args.recentMemosByLeadId.get(args.lead.id) ?? [],
  } satisfies NetworkLeadSummary;
}

export async function fetchNetworkLeadPage(args: {
  cvOnly?: boolean;
  limit?: number;
  offset?: number;
  move?: string | null;
  query?: string | null;
  role?: string | null;
  userEmail?: string | null;
}): Promise<NetworkLeadListResponse> {
  const limit = Math.max(1, Math.min(MAX_LIMIT, args.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, args.offset ?? 0);

  const { rows, totalCount: allCount } = await fetchLeadRows({ scanAll: true });
  const allLeads = rows.map((row) => buildNetworkLead(row));
  const filters = {
    cvOnly: args.cvOnly === true,
    move: parseLeadFilterValue(args.move ?? null),
    query: parseLeadQuery(args.query ?? null),
    role: parseLeadFilterValue(args.role ?? null),
  } satisfies NetworkLeadFilterArgs;

  const filteredLeads = allLeads.filter((lead) =>
    matchesLeadFilters(lead, filters)
  );
  const pagedLeads = filteredLeads.slice(offset, offset + limit);
  const {
    latestExperienceByTalentId,
    lastActivityAtByLeadId,
    recentMemosByLeadId,
    resolvedTalentIdByLeadId,
    structuredTalentIds,
  } = await fetchLeadSummaryDecorations(pagedLeads);

  const summaries = pagedLeads.map((lead) =>
    toLeadSummary({
      lead,
      latestExperienceByTalentId,
      lastActivityAt: lastActivityAtByLeadId.get(lead.id) ?? null,
      recentMemosByLeadId,
      resolvedTalentId:
        resolvedTalentIdByLeadId.get(lead.id) ?? getNetworkTalentId(lead.id),
      structuredTalentIds,
    })
  );

  const nextOffset =
    offset + summaries.length < filteredLeads.length
      ? offset + summaries.length
      : null;

  return {
    allowedDomain: "matchharper.com",
    allCount,
    filters: buildLeadFilterOptions(allLeads),
    filteredCount: filteredLeads.length,
    hasMore: nextOffset !== null,
    leads: summaries,
    limit,
    loadedCount: summaries.length,
    nextOffset,
    offset,
    page: Math.floor(offset / limit) + 1,
    stats: buildLeadStats(allLeads),
    totalCount: filteredLeads.length,
    totalPages:
      filteredLeads.length > 0 ? Math.ceil(filteredLeads.length / limit) : 1,
    userEmail: args.userEmail ?? null,
  };
}

async function upsertWaitlistLeadTalentUser(lead: NetworkLead) {
  const admin = getTalentSupabaseAdmin();
  const talentId = getNetworkTalentId(lead.id);
  const now = new Date().toISOString();
  const links = collectLeadLinks(lead);

  const { data: existing, error: existingError } = await admin
    .from("talent_users")
    .select(
      "user_id, email, name, resume_file_name, resume_storage_path, resume_links"
    )
    .eq("user_id", talentId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message ?? "Failed to read talent_users");
  }

  const payload: Database["public"]["Tables"]["talent_users"]["Insert"] = {
    user_id: talentId,
    updated_at: now,
    email: lead.email ?? existing?.email ?? null,
    name: lead.name ?? existing?.name ?? null,
    resume_file_name: lead.cvFileName ?? existing?.resume_file_name ?? null,
    resume_storage_path:
      lead.cvStoragePath ?? existing?.resume_storage_path ?? null,
    resume_links: links.length > 0 ? links : (existing?.resume_links ?? []),
  };

  const { error } = await admin
    .from("talent_users")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message ?? "Failed to upsert talent_users");
  }

  return talentId;
}

export async function insertTalentNotification(args: {
  leadId: number;
  message: string;
}) {
  const admin = getTalentSupabaseAdmin();
  const lead = await fetchNetworkLeadById(args.leadId);
  const claimedTalentUser = await findClaimedTalentUserByWaitlistId({
    admin,
    waitlistId: lead.id,
  });
  const talentId =
    claimedTalentUser?.user_id ?? (await upsertWaitlistLeadTalentUser(lead));
  const message = normalizeText(args.message);

  if (!message) {
    throw new InternalApiError(400, "Notification message is required");
  }

  const payload: TalentNotificationInsert = {
    created_at: new Date().toISOString(),
    is_read: false,
    message,
    talent_id: talentId,
  };

  const { data, error } = await admin
    .from("talent_notification")
    .insert(payload)
    .select("id, talent_id, message, is_read, created_at")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to insert talent_notification");
  }

  return data;
}

async function extractResumeTextFromLead(lead: NetworkLead) {
  const admin = getTalentSupabaseAdmin();
  if (!lead.cvStorageBucket || !lead.cvStoragePath) {
    return null;
  }

  const { data, error } = await admin.storage
    .from(lead.cvStorageBucket)
    .download(lead.cvStoragePath);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to download resume");
  }

  if (isPdfResume({ fileName: lead.cvFileName, mimeType: data.type })) {
    const arrayBuffer = await data.arrayBuffer();
    const parsed = await pdf(Buffer.from(arrayBuffer));
    return normalizeText(String(parsed?.text ?? ""), MAX_RESUME_TEXT_CHARS);
  }

  return normalizeText(await data.text(), MAX_RESUME_TEXT_CHARS);
}

async function fetchTalentInternalEntries(waitlistId: number) {
  const admin = getTalentSupabaseAdmin();
  const { data, error } = await admin
    .from("talent_internal")
    .select(
      "id, talent_id, waitlist_id, type, content, from_email, to_email, subject, created_by, created_at"
    )
    .eq("waitlist_id", waitlistId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_internal");
  }

  return (data ?? []) as TalentInternalEntry[];
}

async function fetchTalentInternalEntryById(entryId: number) {
  const admin = getTalentSupabaseAdmin();
  const { data, error } = await admin
    .from("talent_internal")
    .select(
      "id, talent_id, waitlist_id, type, content, from_email, to_email, subject, created_by, created_at"
    )
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_internal entry");
  }

  if (!data) {
    throw new InternalApiError(404, "Internal entry not found");
  }

  return data as TalentInternalEntry;
}

function assertEditableInternalEntry(entry: TalentInternalEntry) {
  if (!EDITABLE_INTERNAL_TYPES.has(entry.type)) {
    throw new InternalApiError(
      400,
      "Only memo and conversation entries can be edited"
    );
  }
}

export async function fetchNetworkLeadDetail(
  leadId: number
): Promise<NetworkLeadDetailResponse> {
  const admin = getTalentSupabaseAdmin();
  const lead = await fetchNetworkLeadById(leadId);
  const sourceTalentId = getNetworkTalentId(lead.id);
  const claimedTalentUser = await findClaimedTalentUserByWaitlistId({
    admin,
    waitlistId: lead.id,
  });
  const resolvedTalentId = claimedTalentUser?.user_id ?? sourceTalentId;

  const [
    resolvedTalentProfile,
    structuredProfile,
    internalEntries,
    latestTalentSetting,
    latestTalentInsightsRow,
  ] = await Promise.all([
    claimedTalentUser
      ? Promise.resolve(claimedTalentUser)
      : fetchTalentUserProfile({
          admin,
          userId: resolvedTalentId,
        }),
    fetchTalentStructuredProfile({
      admin,
      userId: resolvedTalentId,
      talentUser: claimedTalentUser ?? undefined,
    }),
    fetchTalentInternalEntries(lead.id),
    fetchTalentSetting({
      admin,
      userId: resolvedTalentId,
    }),
    fetchTalentInsights({
      admin,
      userId: resolvedTalentId,
    }),
  ]);

  const hasStructuredProfile = hasStructuredTalentProfile({
    profile: resolvedTalentProfile,
    structuredProfile,
  });
  const lastInternalActivityAt = internalEntries[0]?.created_at ?? null;
  const latestExperience = toLatestExperienceSummary(
    structuredProfile?.talentExperiences?.[0]
  );
  const recentMemos = internalEntries
    .filter((entry) => entry.type === "memo")
    .map((entry) => toRecentMemoSummary(entry))
    .filter((entry): entry is NetworkLeadRecentMemo => Boolean(entry))
    .slice(0, 2);

  return {
    claimedTalentId: claimedTalentUser?.user_id ?? null,
    hasStructuredProfile,
    ingestionState: {
      hasLinkedin: Boolean(lead.linkedinProfileUrl),
      hasResume: lead.hasCv,
      lastInternalActivityAt,
      resumeTextAvailable: Boolean(resolvedTalentProfile?.resume_text),
    },
    internalEntries,
    lead: {
      ...lead,
      talentId: resolvedTalentId,
      hasStructuredProfile,
      lastInternalActivityAt,
      latestExperience,
      recentMemos,
    },
    latestNetworkApplication: normalizeTalentNetworkApplication(
      resolvedTalentProfile?.career_profile ??
        resolvedTalentProfile?.network_application
    ),
    latestTalentInsights: mergeTalentInsightContent({
      currentContent: latestTalentInsightsRow?.content,
      seedContent: null,
    }),
    latestTalentSetting: latestTalentSetting
      ? {
          engagement_types: latestTalentSetting.engagement_types,
          preferred_locations: latestTalentSetting.preferred_locations,
          career_move_intent: latestTalentSetting.career_move_intent,
        }
      : null,
    sourceTalentId,
    structuredProfile,
    talentId: resolvedTalentId,
    talentProfile: resolvedTalentProfile,
  };
}

export async function ingestNetworkLeadProfile(args: { leadId: number }) {
  const admin = getTalentSupabaseAdmin();
  const lead = await fetchNetworkLeadById(args.leadId);
  if (!lead.linkedinProfileUrl) {
    throw new InternalApiError(
      400,
      "LinkedIn profile URL is required to extract candidate information"
    );
  }

  const claimedTalentUser = await findClaimedTalentUserByWaitlistId({
    admin,
    waitlistId: lead.id,
  });
  const talentId =
    claimedTalentUser?.user_id ?? (await upsertWaitlistLeadTalentUser(lead));
  const [existingTalentSetting, existingTalentInsights] = await Promise.all([
    fetchTalentSetting({
      admin,
      userId: talentId,
    }),
    fetchTalentInsights({
      admin,
      userId: talentId,
    }),
  ]);
  let resumeText: string | null = null;
  if (lead.hasCv) {
    try {
      resumeText = await extractResumeTextFromLead(lead);
    } catch {
      resumeText = null;
    }
  }
  const links = collectLeadLinks(lead);

  const ingestion = await ingestTalentProfileFromLinkedin({
    admin,
    userId: talentId,
    links,
    resumeFileName: lead.cvFileName,
    resumeStoragePath: lead.cvStoragePath,
    resumeText,
  });

  await Promise.all([
    upsertTalentSetting({
      admin,
      userId: talentId,
      ...mergeTalentSettingSeed({
        currentSetting: existingTalentSetting,
        engagementTypes: lead.engagementTypes,
        preferredLocations: lead.preferredLocations,
        careerMoveIntent: lead.careerMoveIntent,
      }),
    }),
    upsertTalentInsights({
      admin,
      userId: talentId,
      content: mergeTalentInsightContent({
        currentContent: existingTalentInsights?.content,
        seedContent: buildLeadInsightSeed(lead),
      }),
    }),
  ]);

  return {
    ingestion,
    resumeTextIncluded: Boolean(resumeText),
    talentId,
  };
}

export async function insertTalentInternalEntry(args: {
  content: string;
  createdBy: string;
  fromEmail?: string | null;
  leadId: number;
  subject?: string | null;
  toEmail?: string | null;
  type: TalentInternalType;
}) {
  const lead = await fetchNetworkLeadById(args.leadId);
  const admin = getTalentSupabaseAdmin();
  const talentId = await upsertWaitlistLeadTalentUser(lead);
  const isMail = args.type === "mail";

  const payload: TalentInternalInsert = {
    content: args.content,
    created_at: new Date().toISOString(),
    created_by: args.createdBy,
    from_email: isMail ? (args.fromEmail ?? null) : null,
    subject: isMail ? (args.subject ?? null) : null,
    talent_id: talentId,
    to_email: isMail ? (args.toEmail ?? lead.email ?? null) : null,
    type: args.type,
    waitlist_id: lead.id,
  };

  const { data, error } = await admin
    .from("talent_internal")
    .insert(payload)
    .select(
      "id, talent_id, waitlist_id, type, content, from_email, to_email, subject, created_by, created_at"
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to insert talent_internal");
  }

  return data as TalentInternalEntry;
}

export async function updateTalentInternalEntry(args: {
  content: string;
  entryId: number;
}) {
  const admin = getTalentSupabaseAdmin();
  const entry = await fetchTalentInternalEntryById(args.entryId);
  assertEditableInternalEntry(entry);

  const { data, error } = await admin
    .from("talent_internal")
    .update({
      content: args.content,
      from_email: null,
      subject: null,
      to_email: null,
    })
    .eq("id", entry.id)
    .select(
      "id, talent_id, waitlist_id, type, content, from_email, to_email, subject, created_by, created_at"
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to update talent_internal");
  }

  return data as TalentInternalEntry;
}

export async function deleteTalentInternalEntry(args: { entryId: number }) {
  const admin = getTalentSupabaseAdmin();
  const entry = await fetchTalentInternalEntryById(args.entryId);
  assertEditableInternalEntry(entry);

  const { error } = await admin
    .from("talent_internal")
    .delete()
    .eq("id", entry.id);

  if (error) {
    throw new Error(error.message ?? "Failed to delete talent_internal");
  }

  return entry;
}

export async function sendCandidateMailAndLog(args: {
  content: string;
  createdBy: string;
  fromEmail: string;
  leadId: number;
  sendEmail: (params: {
    from: string;
    subject: string;
    text: string;
    to: string;
  }) => Promise<unknown>;
  subject: string;
}) {
  const lead = await fetchNetworkLeadById(args.leadId);
  const toEmail = normalizeText(lead.email, 320);

  if (!toEmail) {
    throw new InternalApiError(400, "Candidate email is required");
  }

  await args.sendEmail({
    from: args.fromEmail,
    subject: args.subject,
    text: args.content,
    to: toEmail,
  });

  return insertTalentInternalEntry({
    content: args.content,
    createdBy: args.createdBy,
    fromEmail: args.fromEmail,
    leadId: lead.id,
    subject: args.subject,
    toEmail,
    type: "mail",
  });
}

export function parseLeadOffset(value: string | null) {
  return parseOffset(value);
}
