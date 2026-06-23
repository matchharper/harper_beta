import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  TALENT_RESUME_BUCKET,
  type TalentInsightContent,
  type TalentUserProfileRow,
  fetchTalentInsights,
  fetchTalentSetting,
  fetchTalentUserProfile,
  mergeTalentInsightContent,
  mergeTalentSettingSeed,
  upsertTalentInsights,
  upsertTalentSetting,
} from "@/lib/talentOnboarding/server";
import { NETWORK_WAITLIST_TYPE, buildNetworkLead } from "@/lib/networkOps";
import { parseTalentNetworkInviteToken } from "@/lib/talentNetworkInvite";
import { v5 as uuidv5 } from "uuid";

type AdminClient = Parameters<typeof fetchTalentUserProfile>[0]["admin"];

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

type TalentExperienceInsert =
  Database["public"]["Tables"]["talent_experiences"]["Insert"];
type TalentEducationInsert =
  Database["public"]["Tables"]["talent_educations"]["Insert"];

const NETWORK_TALENT_NAMESPACE = "8be1d393-baf3-4cb2-bb85-1f111ab7291b";

function getNetworkTalentId(leadId: number) {
  return uuidv5(`harper_waitlist:${leadId}`, NETWORK_TALENT_NAMESPACE);
}

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function dedupeLinks(values: Array<string | null | undefined>) {
  const unique = new Set<string>();
  const normalized: string[] = [];

  for (const raw of values) {
    const value = normalizeText(raw);
    if (!value) continue;
    if (unique.has(value)) continue;
    unique.add(value);
    normalized.push(value);
  }

  return normalized;
}

function valuesAreEqual(left: unknown, right: unknown) {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftArray = Array.isArray(left) ? left : [];
    const rightArray = Array.isArray(right) ? right : [];
    return JSON.stringify(leftArray) === JSON.stringify(rightArray);
  }

  if (left && right && typeof left === "object" && typeof right === "object") {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  return (left ?? null) === (right ?? null);
}

function hasTalentUserMergeChanges(args: {
  currentProfile: TalentUserProfileRow | null;
  payload: Database["public"]["Tables"]["talent_users"]["Update"];
}) {
  const { currentProfile, payload } = args;
  if (!currentProfile) return true;

  for (const [key, nextValue] of Object.entries(payload)) {
    if (typeof nextValue === "undefined") continue;
    const currentValue = (currentProfile as Record<string, unknown>)[key];
    if (!valuesAreEqual(currentValue, nextValue)) {
      return true;
    }
  }

  return false;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function collectLeadLinks(lead: ReturnType<typeof buildNetworkLead>) {
  return dedupeLinks([
    lead.linkedinProfileUrl,
    lead.githubProfileUrl,
    lead.scholarProfileUrl,
    lead.personalWebsiteUrl,
    lead.primaryProfileUrl,
  ]);
}

function buildLeadInsightSeed(lead: ReturnType<typeof buildNetworkLead>) {
  const content = {
    ...(lead.impactSummary ? { technical_strengths: lead.impactSummary } : {}),
    ...(lead.dreamTeams ? { desired_teams: lead.dreamTeams } : {}),
  } satisfies TalentInsightContent;

  return Object.keys(content).length > 0 ? content : null;
}

function toStableInsightSignature(content: TalentInsightContent | null) {
  if (!content) return "";

  return Object.keys(content)
    .sort()
    .map((key) => `${key}:${content[key]}`)
    .join("\n");
}

async function fetchWaitlistLead(admin: AdminClient, waitlistId: number) {
  const { data, error } = await admin
    .from("harper_waitlist")
    .select("id, created_at, email, is_mobile, local_id, name, text, url")
    .eq("id", waitlistId)
    .eq("type", NETWORK_WAITLIST_TYPE)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load network waitlist entry");
  }
  if (!data) {
    throw new Error("초대 정보를 찾지 못했습니다.");
  }

  return buildNetworkLead(data as NetworkWaitlistRow);
}

async function countRows(args: {
  admin: AdminClient;
  table: "talent_experiences" | "talent_educations";
  talentId: string;
}) {
  const { count, error } = await args.admin
    .from(args.table)
    .select("id", { count: "exact", head: true })
    .eq("talent_id", args.talentId);

  if (error) {
    throw new Error(error.message ?? `Failed to count ${args.table}`);
  }

  return count ?? 0;
}

async function copyResumeToTalentBucket(args: {
  admin: AdminClient;
  lead: ReturnType<typeof buildNetworkLead>;
  targetUserId: string;
}) {
  const { admin, lead, targetUserId } = args;
  if (!lead.cvStorageBucket || !lead.cvStoragePath) {
    return null;
  }

  const { data, error } = await admin.storage
    .from(lead.cvStorageBucket)
    .download(lead.cvStoragePath);

  if (error || !data) {
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  const originalName = normalizeText(lead.cvFileName) ?? "resume";
  const storagePath = `${targetUserId}/${Date.now()}_${sanitizeFileName(originalName)}`;

  const { error: uploadError } = await admin.storage
    .from(TALENT_RESUME_BUCKET)
    .upload(storagePath, Buffer.from(arrayBuffer), {
      upsert: false,
      contentType: data.type || "application/octet-stream",
    });

  if (uploadError) {
    return null;
  }

  return {
    resume_file_name: originalName,
    resume_storage_path: storagePath,
  };
}

async function copyExperiencesIfEmpty(args: {
  admin: AdminClient;
  sourceTalentId: string;
  targetTalentId: string;
}) {
  const { admin, sourceTalentId, targetTalentId } = args;
  if (sourceTalentId === targetTalentId) return;

  const currentCount = await countRows({
    admin,
    table: "talent_experiences",
    talentId: targetTalentId,
  });
  if (currentCount > 0) return;

  const { data, error } = await admin
    .from("talent_experiences")
    .select(
      "company_id, company_link, company_location, company_logo, company_name, created_at, description, employment_type, end_date, memo, months, role, start_date"
    )
    .eq("talent_id", sourceTalentId)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load source experiences");
  }

  const rows = (data ?? []).map(
    (row): TalentExperienceInsert => ({
      ...row,
      talent_id: targetTalentId,
    })
  );

  if (rows.length === 0) return;

  const { error: insertError } = await admin
    .from("talent_experiences")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to copy experiences");
  }
}

async function copyEducationsIfEmpty(args: {
  admin: AdminClient;
  sourceTalentId: string;
  targetTalentId: string;
}) {
  const { admin, sourceTalentId, targetTalentId } = args;
  if (sourceTalentId === targetTalentId) return;

  const currentCount = await countRows({
    admin,
    table: "talent_educations",
    talentId: targetTalentId,
  });
  if (currentCount > 0) return;

  const { data, error } = await admin
    .from("talent_educations")
    .select(
      "created_at, degree, description, end_date, field, memo, school, start_date, url"
    )
    .eq("talent_id", sourceTalentId)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load source educations");
  }

  const rows = (data ?? []).map(
    (row): TalentEducationInsert => ({
      ...row,
      talent_id: targetTalentId,
    })
  );

  if (rows.length === 0) return;

  const { error: insertError } = await admin
    .from("talent_educations")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to copy educations");
  }
}

async function copyExtrasIfEmpty(args: {
  admin: AdminClient;
  sourceTalentId: string;
  targetTalentId: string;
}) {
  const { admin, sourceTalentId, targetTalentId } = args;
  if (sourceTalentId === targetTalentId) return;

  const { data: current, error: currentError } = await admin
    .from("talent_extras")
    .select("talent_id")
    .eq("talent_id", targetTalentId)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message ?? "Failed to load target extras");
  }
  if (current) return;

  const { data: source, error: sourceError } = await admin
    .from("talent_extras")
    .select("content")
    .eq("talent_id", sourceTalentId)
    .maybeSingle();

  if (sourceError) {
    throw new Error(sourceError.message ?? "Failed to load source extras");
  }
  if (!source) return;

  const { error: upsertError } = await admin.from("talent_extras").upsert(
    {
      talent_id: targetTalentId,
      content: source.content,
    },
    { onConflict: "talent_id" }
  );

  if (upsertError) {
    throw new Error(upsertError.message ?? "Failed to copy extras");
  }
}

async function copyTalentSettingIfEmpty(args: {
  admin: AdminClient;
  sourceTalentId: string;
  targetTalentId: string;
  lead: ReturnType<typeof buildNetworkLead>;
}) {
  const { admin, sourceTalentId, targetTalentId, lead } = args;
  if (sourceTalentId === targetTalentId) return;

  const [currentSetting, sourceSetting] = await Promise.all([
    fetchTalentSetting({
      admin,
      userId: targetTalentId,
    }),
    fetchTalentSetting({
      admin,
      userId: sourceTalentId,
    }),
  ]);

  const sourceEngagementTypes =
    (sourceSetting?.engagement_types?.length ?? 0) > 0
      ? sourceSetting?.engagement_types
      : lead.engagementTypes;

  const merged = mergeTalentSettingSeed({
    currentSetting,
    engagementTypes: sourceEngagementTypes,
  });

  const shouldSave =
    !currentSetting || currentSetting.engagement_types.length === 0;

  if (!shouldSave) return;

  await upsertTalentSetting({
    admin,
    userId: targetTalentId,
    ...merged,
  });
}

async function copyTalentInsightsIfEmpty(args: {
  admin: AdminClient;
  sourceTalentId: string;
  targetTalentId: string;
  lead: ReturnType<typeof buildNetworkLead>;
}) {
  const { admin, sourceTalentId, targetTalentId, lead } = args;
  if (sourceTalentId === targetTalentId) return;

  const [currentInsights, sourceInsights] = await Promise.all([
    fetchTalentInsights({
      admin,
      userId: targetTalentId,
    }),
    fetchTalentInsights({
      admin,
      userId: sourceTalentId,
    }),
  ]);

  const currentNormalized = mergeTalentInsightContent({
    currentContent: currentInsights?.content,
    seedContent: null,
  });
  const sourceNormalized = mergeTalentInsightContent({
    currentContent: sourceInsights?.content,
    seedContent: buildLeadInsightSeed(lead),
  });

  const mergedContent = mergeTalentInsightContent({
    currentContent: currentInsights?.content,
    seedContent: sourceNormalized ?? null,
  });

  const hasSameContent =
    toStableInsightSignature(mergedContent) ===
    toStableInsightSignature(currentNormalized);
  const shouldSave = Boolean(
    mergedContent && (!currentInsights || !hasSameContent)
  );

  if (!shouldSave) return;

  await upsertTalentInsights({
    admin,
    userId: targetTalentId,
    content: mergedContent,
  });
}

function buildTalentUserMergePayload(args: {
  currentProfile: TalentUserProfileRow | null;
  sourceProfile: TalentUserProfileRow | null;
  lead: ReturnType<typeof buildNetworkLead>;
  user: User;
}) {
  const { currentProfile, sourceProfile, lead, user } = args;
  const mergedLinks = dedupeLinks([
    ...(currentProfile?.resume_links ?? []),
    ...(sourceProfile?.resume_links ?? []),
    ...collectLeadLinks(lead),
  ]);
  const payload: Database["public"]["Tables"]["talent_users"]["Update"] = {
    email: user.email ?? currentProfile?.email ?? lead.email ?? null,
    resume_links: mergedLinks,
  };

  if (!normalizeText(currentProfile?.name)) {
    payload.name =
      normalizeText(sourceProfile?.name) ??
      normalizeText(lead.name) ??
      currentProfile?.name ??
      null;
  }
  if (
    !normalizeText(currentProfile?.headline) &&
    normalizeText(sourceProfile?.headline)
  ) {
    payload.headline = sourceProfile?.headline ?? null;
  }
  if (
    !normalizeText(currentProfile?.bio) &&
    normalizeText(sourceProfile?.bio)
  ) {
    payload.bio = sourceProfile?.bio ?? null;
  }
  if (
    !normalizeText(currentProfile?.location) &&
    normalizeText(sourceProfile?.location)
  ) {
    payload.location = sourceProfile?.location ?? null;
  }
  if (
    !normalizeText(currentProfile?.profile_picture) &&
    normalizeText(sourceProfile?.profile_picture)
  ) {
    payload.profile_picture = sourceProfile?.profile_picture ?? null;
  }
  if (
    !normalizeText(currentProfile?.resume_file_name) &&
    normalizeText(sourceProfile?.resume_file_name)
  ) {
    payload.resume_file_name = sourceProfile?.resume_file_name ?? null;
  }
  if (
    !normalizeText(currentProfile?.resume_text) &&
    normalizeText(sourceProfile?.resume_text)
  ) {
    payload.resume_text = sourceProfile?.resume_text ?? null;
  }

  return payload;
}

export async function claimTalentNetworkInvite(args: {
  admin: AdminClient;
  inviteToken: string;
  user: User;
}) {
  const { admin, inviteToken, user } = args;
  const invite = parseTalentNetworkInviteToken(inviteToken);
  const currentUserEmail = normalizeEmail(user.email);

  if (!currentUserEmail || currentUserEmail !== invite.email) {
    throw new Error("초대 메일과 동일한 Google 계정으로 로그인해 주세요.");
  }

  const lead = await fetchWaitlistLead(admin, invite.waitlistId);
  const leadEmail = normalizeEmail(lead.email);
  if (leadEmail && leadEmail !== currentUserEmail) {
    throw new Error("초대 메일과 동일한 Google 계정으로 로그인해 주세요.");
  }

  const sourceTalentId = getNetworkTalentId(lead.id);
  const [currentProfile, sourceProfile] = await Promise.all([
    fetchTalentUserProfile({ admin, userId: user.id }),
    fetchTalentUserProfile({ admin, userId: sourceTalentId }).catch(() => null),
  ]);

  const payload = buildTalentUserMergePayload({
    currentProfile,
    sourceProfile,
    lead,
    user,
  });

  const hasExistingResumeStoragePath =
    normalizeText(currentProfile?.resume_storage_path) ||
    normalizeText(payload.resume_storage_path);

  if (!hasExistingResumeStoragePath) {
    const copiedResume = await copyResumeToTalentBucket({
      admin,
      lead,
      targetUserId: user.id,
    });
    if (copiedResume) {
      payload.resume_file_name = copiedResume.resume_file_name;
      payload.resume_storage_path = copiedResume.resume_storage_path;
    }
  }

  const shouldUpdate = hasTalentUserMergeChanges({
    currentProfile,
    payload,
  });

  if (shouldUpdate) {
    payload.updated_at = new Date().toISOString();

    const { error: updateError } = await admin
      .from("talent_users")
      .update(payload)
      .eq("user_id", user.id);

    if (updateError) {
      throw new Error(updateError.message ?? "Failed to claim network invite");
    }
  }

  await Promise.all([
    copyExperiencesIfEmpty({
      admin,
      sourceTalentId,
      targetTalentId: user.id,
    }),
    copyEducationsIfEmpty({
      admin,
      sourceTalentId,
      targetTalentId: user.id,
    }),
    copyExtrasIfEmpty({
      admin,
      sourceTalentId,
      targetTalentId: user.id,
    }),
    copyTalentSettingIfEmpty({
      admin,
      sourceTalentId,
      targetTalentId: user.id,
      lead,
    }),
    copyTalentInsightsIfEmpty({
      admin,
      sourceTalentId,
      targetTalentId: user.id,
      lead,
    }),
  ]);

  return {
    sourceTalentId,
    waitlistId: lead.id,
  };
}
