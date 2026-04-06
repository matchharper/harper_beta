// @ts-ignore: pdf parser has loose types.
import pdf from "pdf-parse-fork";
import { InternalApiError } from "@/lib/internalApi";
import {
  getNetworkTalentId,
  hasStructuredTalentProfile,
  type NetworkLeadDetailResponse,
  type NetworkLeadListResponse,
  type NetworkLeadSummary,
  type TalentInternalEntry,
  type TalentInternalType,
} from "@/lib/opsNetwork";
import { buildNetworkLead, NETWORK_WAITLIST_TYPE, type NetworkLead } from "@/lib/networkOps";
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
  "id" | "created_at" | "email" | "is_mobile" | "local_id" | "name" | "text" | "url"
>;

type TalentInternalInsert =
  Database["public"]["Tables"]["talent_internal"]["Insert"];

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const MAX_RESUME_TEXT_CHARS = 20_000;
const EDITABLE_INTERNAL_TYPES = new Set<TalentInternalType>([
  "conversation",
  "memo",
]);

function normalizeText(value: string | null | undefined, maxLength = 4000) {
  const normalized = String(value ?? "").replace(/\r/g, "").trim();
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

export function parseLeadLimit(value: string | null) {
  const numeric = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(numeric)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(numeric)));
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
  return Boolean(row?.headline || row?.bio || row?.location || row?.resume_text);
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
    ...(lead.impactSummary
      ? { technical_strengths: lead.impactSummary }
      : {}),
    ...(lead.dreamTeams ? { desired_teams: lead.dreamTeams } : {}),
  };

  return Object.keys(content).length > 0 ? content : null;
}

function isPdfResume(args: { fileName?: string | null; mimeType?: string | null }) {
  const fileName = String(args.fileName ?? "").toLowerCase();
  const mimeType = String(args.mimeType ?? "").toLowerCase();

  return mimeType === "application/pdf" || fileName.endsWith(".pdf");
}

async function fetchLeadRowsPage(args: { limit: number; offset: number }) {
  const { limit, offset } = args;

  const { data, error, count } = await supabaseServer
    .from("harper_waitlist")
    .select("id, created_at, email, is_mobile, local_id, name, text, url", {
      count: "exact",
    })
    .eq("type", NETWORK_WAITLIST_TYPE)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message ?? "Failed to load network leads");
  }

  return {
    rows: (data ?? []) as NetworkWaitlistRow[],
    totalCount: count ?? 0,
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
  const talentIds = leads.map((lead) => getNetworkTalentId(lead.id));

  if (leadIds.length === 0) {
    return {
      lastActivityAtByLeadId: new Map<number, string | null>(),
      structuredTalentIds: new Set<string>(),
    };
  }

  const [profileRes, experienceRes, educationRes, extrasRes, internalRes] =
    await Promise.all([
      admin
        .from("talent_users")
        .select("user_id, headline, bio, location, resume_text")
        .in("user_id", talentIds),
      admin.from("talent_experiences").select("talent_id").in("talent_id", talentIds),
      admin.from("talent_educations").select("talent_id").in("talent_id", talentIds),
      admin.from("talent_extras").select("talent_id").in("talent_id", talentIds),
      admin
        .from("talent_internal")
        .select("waitlist_id, created_at")
        .in("waitlist_id", leadIds)
        .order("created_at", { ascending: false }),
    ]);

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
  if (internalRes.error) {
    throw new Error(
      internalRes.error.message ?? "Failed to load talent_internal"
    );
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

  const lastActivityAtByLeadId = new Map<number, string | null>();
  for (const row of internalRes.data ?? []) {
    if (!lastActivityAtByLeadId.has(row.waitlist_id)) {
      lastActivityAtByLeadId.set(row.waitlist_id, row.created_at);
    }
  }

  return { lastActivityAtByLeadId, structuredTalentIds };
}

function toLeadSummary(args: {
  lead: NetworkLead;
  lastActivityAt: string | null;
  structuredTalentIds: Set<string>;
}) {
  const talentId = getNetworkTalentId(args.lead.id);

  return {
    ...args.lead,
    talentId,
    hasStructuredProfile: args.structuredTalentIds.has(talentId),
    lastInternalActivityAt: args.lastActivityAt,
  } satisfies NetworkLeadSummary;
}

export async function fetchNetworkLeadPage(args: {
  limit?: number;
  offset?: number;
  userEmail?: string | null;
}): Promise<NetworkLeadListResponse> {
  const limit = Math.max(1, Math.min(MAX_LIMIT, args.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, args.offset ?? 0);

  const { rows, totalCount } = await fetchLeadRowsPage({ limit, offset });
  const leads = rows.map((row) => buildNetworkLead(row));
  const { lastActivityAtByLeadId, structuredTalentIds } =
    await fetchLeadSummaryDecorations(leads);

  const summaries = leads.map((lead) =>
    toLeadSummary({
      lead,
      lastActivityAt: lastActivityAtByLeadId.get(lead.id) ?? null,
      structuredTalentIds,
    })
  );

  const nextOffset =
    offset + summaries.length < totalCount ? offset + summaries.length : null;

  return {
    allowedDomain: "matchharper.com",
    hasMore: nextOffset !== null,
    leads: summaries,
    limit,
    loadedCount: summaries.length,
    nextOffset,
    offset,
    totalCount,
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
    resume_links: links.length > 0 ? links : existing?.resume_links ?? [],
  };

  const { error } = await admin
    .from("talent_users")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    throw new Error(error.message ?? "Failed to upsert talent_users");
  }

  return talentId;
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
    throw new InternalApiError(400, "Only memo and conversation entries can be edited");
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
  ] =
    await Promise.all([
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
      talentId: sourceTalentId,
      hasStructuredProfile,
      lastInternalActivityAt,
    },
    latestNetworkApplication: normalizeTalentNetworkApplication(
      resolvedTalentProfile?.career_profile ?? resolvedTalentProfile?.network_application
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
  const talentId = claimedTalentUser?.user_id ?? (await upsertWaitlistLeadTalentUser(lead));
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
    from_email: isMail ? args.fromEmail ?? null : null,
    subject: isMail ? args.subject ?? null : null,
    talent_id: talentId,
    to_email: isMail ? args.toEmail ?? lead.email ?? null : null,
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

  const { error } = await admin.from("talent_internal").delete().eq("id", entry.id);

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
