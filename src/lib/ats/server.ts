import type { NextRequest } from "next/server";
import { InternalApiError } from "@/lib/internalApi";
import { sendInternalEmail } from "@/lib/internalMail";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { xaiInference } from "@/lib/llm/llm";
import { findCandidateEmailWithAgenticFlow } from "@/lib/ats/emailFinder";
import {
  ATS_DEFAULT_SEQUENCE_TIME,
  ATS_DEFAULT_TIMEZONE_OFFSET_MINUTES,
  ATS_SEQUENCE_INTERVAL_DAYS,
  ATS_SEQUENCE_STEP_COUNT,
  buildCandidateTemplateVariables,
  coerceJsonArray,
  createDefaultAtsSequenceSchedule,
  type AtsCandidateDetail,
  type AtsCandidateDetailResponse,
  type AtsCandidatePublication,
  type AtsCandidateSummary,
  type AtsBookmarkFolderOption,
  type AtsContactEmailDraft,
  type AtsContactHistoryChannel,
  type AtsContactHistoryItem,
  type AtsEmailDiscoveryEvidence,
  type AtsEmailDiscoveryStatus,
  type AtsEmailDiscoveryTraceItem,
  type AtsEmailSourceType,
  type AtsExistingEmailSource,
  type AtsMessageRecord,
  type AtsOutreachRecord,
  type AtsSequenceMarkStatus,
  type AtsSequenceStepSchedule,
  type AtsSequenceStatus,
  type AtsWorkspaceRecord,
  type AtsWorkspaceResponse,
  isAtsSequenceMarkStatus,
  isValidEmail,
  normalizeAtsContactHistory,
  normalizeAtsSequenceSchedule,
  normalizeEmail,
  replaceTemplateVariables,
} from "@/lib/ats/shared";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

type CompanyUserRecord = {
  company: string | null;
  company_description: string | null;
  email: string | null;
  name: string | null;
  user_id: string;
};

type DueSequenceOutreachRow = {
  activeStep: number;
  candidId: string;
  nextDueAt: string;
  sequenceStatus: AtsSequenceStatus;
  userId: string;
};

type BookmarkFolderRecord = {
  created_at: string;
  id: number;
  is_default: boolean;
  name: string;
  updated_at: string;
  user_id: string;
};

const OUTREACH_SELECT = [
  "id",
  "user_id",
  "candid_id",
  "target_email",
  "email_source_type",
  "email_source_label",
  "email_source_url",
  "email_discovery_status",
  "email_discovery_summary",
  "email_discovery_trace",
  "email_discovery_evidence",
  "memo",
  "history",
  "sequence_mark",
  "sequence_schedule",
  "sequence_status",
  "active_step",
  "last_sent_at",
  "next_due_at",
  "stopped_at",
  "created_at",
  "updated_at",
].join(",");

const MESSAGE_SELECT = [
  "id",
  "outreach_id",
  "user_id",
  "candid_id",
  "kind",
  "step_number",
  "status",
  "subject",
  "body",
  "rendered_subject",
  "rendered_body",
  "to_email",
  "sent_at",
  "created_by",
  "created_at",
  "updated_at",
].join(",");

function safeParseJson(raw: string) {
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function sortByLatestDate<
  T extends { endDate?: string | null; startDate?: string | null },
>(items: T[]) {
  return items.slice().sort((a, b) => {
    const aEnd = a.endDate ? Date.parse(a.endDate) : Number.POSITIVE_INFINITY;
    const bEnd = b.endDate ? Date.parse(b.endDate) : Number.POSITIVE_INFINITY;
    if (aEnd !== bEnd) return bEnd - aEnd;

    const aStart = a.startDate ? Date.parse(a.startDate) : 0;
    const bStart = b.startDate ? Date.parse(b.startDate) : 0;
    return bStart - aStart;
  });
}

function mapWorkspaceRecord(args: {
  bookmarkFolderId?: number | null;
  companyUser: CompanyUserRecord | null;
  row: any | null;
  userEmail: string | null | undefined;
}): AtsWorkspaceRecord {
  return {
    bookmarkFolderId:
      args.bookmarkFolderId ??
      (Number.isFinite(Number(args.row?.bookmark_folder_id))
        ? Number(args.row?.bookmark_folder_id)
        : null),
    companyPitch:
      String(args.row?.company_pitch ?? "").trim() ||
      String(args.companyUser?.company_description ?? "").trim() ||
      null,
    jobDescription: String(args.row?.job_description ?? "").trim() || null,
    senderEmail:
      String(args.row?.sender_email ?? "").trim() ||
      String(args.userEmail ?? "").trim() ||
      null,
    signature: String(args.row?.signature ?? "").trim() || null,
  };
}

function mapOutreachRecord(row: any): AtsOutreachRecord {
  return {
    activeStep: Number(row?.active_step ?? 0) || 0,
    candidId: String(row?.candid_id ?? ""),
    createdAt: String(row?.created_at ?? ""),
    emailDiscoveryEvidence: coerceJsonArray<AtsEmailDiscoveryEvidence>(
      row?.email_discovery_evidence
    ),
    emailDiscoveryStatus:
      (row?.email_discovery_status as AtsEmailDiscoveryStatus) ?? "not_started",
    emailDiscoverySummary: row?.email_discovery_summary ?? null,
    emailDiscoveryTrace: coerceJsonArray<AtsEmailDiscoveryTraceItem>(
      row?.email_discovery_trace
    ),
    emailSourceLabel: row?.email_source_label ?? null,
    emailSourceType:
      (row?.email_source_type as AtsEmailSourceType | null) ?? null,
    emailSourceUrl: row?.email_source_url ?? null,
    history: normalizeAtsContactHistory(row?.history),
    id: Number(row?.id ?? 0) || 0,
    lastSentAt: row?.last_sent_at ?? null,
    memo: String(row?.memo ?? "").trim() || null,
    nextDueAt: row?.next_due_at ?? null,
    sequenceMark: isAtsSequenceMarkStatus(row?.sequence_mark)
      ? row.sequence_mark
      : null,
    sequenceSchedule: normalizeAtsSequenceSchedule(row?.sequence_schedule),
    sequenceStatus: (row?.sequence_status as AtsSequenceStatus) ?? "draft",
    stoppedAt: row?.stopped_at ?? null,
    targetEmail: row?.target_email ?? null,
    updatedAt: String(row?.updated_at ?? row?.created_at ?? ""),
    userId: String(row?.user_id ?? ""),
  };
}

function mapMessageRecord(row: any): AtsMessageRecord {
  return {
    body: String(row?.body ?? ""),
    candidId: String(row?.candid_id ?? ""),
    createdAt: String(row?.created_at ?? ""),
    createdBy: String(row?.created_by ?? ""),
    id: Number(row?.id ?? 0) || 0,
    kind: row?.kind === "manual" ? "manual" : "sequence",
    outreachId:
      row?.outreach_id == null ? null : Number(row.outreach_id) || null,
    renderedBody:
      row?.rendered_body == null ? null : String(row.rendered_body ?? ""),
    renderedSubject:
      row?.rendered_subject == null ? null : String(row.rendered_subject ?? ""),
    sentAt: row?.sent_at ?? null,
    status:
      row?.status === "sent" ||
      row?.status === "sending" ||
      row?.status === "skipped" ||
      row?.status === "canceled"
        ? row.status
        : "draft",
    stepNumber:
      row?.step_number == null ? null : Number(row.step_number ?? 0) || null,
    subject: String(row?.subject ?? ""),
    toEmail: row?.to_email == null ? null : String(row.to_email ?? ""),
    updatedAt: String(row?.updated_at ?? row?.created_at ?? ""),
    userId: String(row?.user_id ?? ""),
  };
}

async function fetchCompanyUserRecord(admin: AdminClient, userId: string) {
  const { data, error } = await (admin.from("company_users" as any) as any)
    .select("user_id, email, name, company, company_description")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load company user");
  }

  return (data ?? null) as CompanyUserRecord | null;
}

async function fetchCompanyUserEmailMap(admin: AdminClient, userIds: string[]) {
  const emailByUserId = new Map<string, string | null>();
  if (userIds.length === 0) return emailByUserId;

  const { data, error } = await (admin.from("company_users" as any) as any)
    .select("user_id, email")
    .in("user_id", userIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load company user emails");
  }

  for (const row of coerceJsonArray<any>(data)) {
    const userId = String(row?.user_id ?? "").trim();
    if (!userId) continue;
    const email = String(row?.email ?? "").trim() || null;
    emailByUserId.set(userId, email);
  }

  return emailByUserId;
}

async function fetchWorkspaceRow(admin: AdminClient, userId: string) {
  const { data, error } = await (
    admin.from("candidate_outreach_workspace" as any) as any
  )
    .select(
      "user_id, job_description, sender_email, company_pitch, signature, bookmark_folder_id"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load ATS workspace");
  }

  return data ?? null;
}

async function upsertWorkspaceRow(args: {
  admin: AdminClient;
  bookmarkFolderId?: number | null;
  companyUser: CompanyUserRecord | null;
  companyPitch?: string | null;
  jobDescription?: string | null;
  senderEmail?: string | null;
  signature?: string | null;
  userEmail?: string | null;
  userId: string;
}) {
  const existing = await fetchWorkspaceRow(args.admin, args.userId);
  const payload = {
    bookmark_folder_id:
      args.bookmarkFolderId !== undefined
        ? args.bookmarkFolderId
        : (existing?.bookmark_folder_id ?? null),
    company_pitch:
      args.companyPitch != null
        ? String(args.companyPitch).trim() || null
        : (existing?.company_pitch ??
          args.companyUser?.company_description ??
          null),
    job_description:
      args.jobDescription != null
        ? String(args.jobDescription).trim() || null
        : (existing?.job_description ?? null),
    sender_email:
      args.senderEmail != null
        ? String(args.senderEmail).trim() || null
        : (existing?.sender_email ?? args.userEmail ?? null),
    signature:
      args.signature != null
        ? String(args.signature).trim() || null
        : (existing?.signature ?? null),
    updated_at: new Date().toISOString(),
    user_id: args.userId,
  };

  const { data, error } = await (
    args.admin.from("candidate_outreach_workspace" as any) as any
  )
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "user_id, job_description, sender_email, company_pitch, signature, bookmark_folder_id"
    )
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save ATS workspace");
  }

  return mapWorkspaceRecord({
    companyUser: args.companyUser,
    row: data,
    userEmail: args.userEmail,
  });
}

async function fetchDefaultFolderCandidateIds(
  admin: AdminClient,
  userId: string
) {
  const { data: folder, error: folderError } = await (
    admin.from("bookmark_folder" as any) as any
  )
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  if (folderError) {
    throw new Error(folderError.message ?? "Failed to load default shortlist");
  }

  if (!folder?.id) {
    return [] as string[];
  }

  return fetchBookmarkFolderCandidateIds(admin, userId, Number(folder.id));
}

async function fetchBookmarkFolders(admin: AdminClient, userId: string) {
  const { data, error } = await (admin.from("bookmark_folder" as any) as any)
    .select("id, user_id, name, is_default, created_at, updated_at")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load bookmark folders");
  }

  return coerceJsonArray<BookmarkFolderRecord>(data);
}

function mapBookmarkFolderOption(
  row: BookmarkFolderRecord
): AtsBookmarkFolderOption {
  return {
    id: Number(row.id),
    isDefault: Boolean(row.is_default),
    name: String(row.name ?? ""),
  };
}

function resolveAtsBookmarkFolderId(args: {
  folders: BookmarkFolderRecord[];
  requestedFolderId?: number | null;
}) {
  if (args.folders.length === 0) return null;

  const folderById = new Set(args.folders.map((folder) => Number(folder.id)));
  if (
    args.requestedFolderId != null &&
    folderById.has(Number(args.requestedFolderId))
  ) {
    return Number(args.requestedFolderId);
  }

  const defaultFolder = args.folders.find((folder) => folder.is_default);
  return Number(defaultFolder?.id ?? args.folders[0]?.id ?? 0) || null;
}

async function fetchBookmarkFolderCandidateIds(
  admin: AdminClient,
  userId: string,
  folderId: number
) {
  if (!Number.isFinite(folderId) || folderId < 1) {
    return [] as string[];
  }

  const { data, error } = await (
    admin.from("bookmark_folder_item" as any) as any
  )
    .select("candid_id")
    .eq("user_id", userId)
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed to load shortlist candidates");
  }

  return coerceJsonArray<any>(data)
    .map((row) => String(row?.candid_id ?? "").trim())
    .filter(Boolean);
}

async function fetchOutreachRecordsByCandidateIds(args: {
  admin: AdminClient;
  candidIds: string[];
  userId: string;
}) {
  const byCandidateId = new Map<string, AtsOutreachRecord>();
  if (args.candidIds.length === 0) return byCandidateId;

  const { data, error } = await (
    args.admin.from("candidate_outreach" as any) as any
  )
    .select(OUTREACH_SELECT)
    .eq("user_id", args.userId)
    .in("candid_id", args.candidIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load outreach records");
  }

  for (const row of coerceJsonArray<any>(data)) {
    const candidId = String(row?.candid_id ?? "").trim();
    if (!candidId) continue;
    byCandidateId.set(candidId, mapOutreachRecord(row));
  }

  return byCandidateId;
}

async function fetchMessageRecordsByCandidateId(args: {
  admin: AdminClient;
  candidId: string;
  userId: string;
}) {
  const { data, error } = await (
    args.admin.from("candidate_outreach_message" as any) as any
  )
    .select(MESSAGE_SELECT)
    .eq("user_id", args.userId)
    .eq("candid_id", args.candidId)
    .order("step_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed to load outreach messages");
  }

  return coerceJsonArray<any>(data).map(mapMessageRecord);
}

async function fetchMessageRecordById(args: {
  admin: AdminClient;
  id: number;
  userId: string;
}) {
  const { data, error } = await (
    args.admin.from("candidate_outreach_message" as any) as any
  )
    .select(MESSAGE_SELECT)
    .eq("user_id", args.userId)
    .eq("id", args.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load outreach message");
  }

  return data ? mapMessageRecord(data) : null;
}

async function fetchShortlistMemoMap(
  admin: AdminClient,
  userId: string,
  ids: string[]
) {
  const memoById = new Map<string, string>();
  if (ids.length === 0) return memoById;

  const { data, error } = await (admin.from("shortlist_memo" as any) as any)
    .select("candid_id, memo")
    .eq("user_id", userId)
    .in("candid_id", ids);

  if (error) {
    throw new Error(error.message ?? "Failed to load shortlist memos");
  }

  for (const row of coerceJsonArray<any>(data)) {
    const candidId = String(row?.candid_id ?? "").trim();
    if (!candidId) continue;
    memoById.set(candidId, String(row?.memo ?? ""));
  }

  return memoById;
}

function pickBestGithubProfile(rows: any[]) {
  return (
    rows.slice().sort((a, b) => {
      const aHasReadme =
        typeof a?.readme_markdown === "string" && a.readme_markdown.trim()
          ? 1
          : 0;
      const bHasReadme =
        typeof b?.readme_markdown === "string" && b.readme_markdown.trim()
          ? 1
          : 0;
      if (aHasReadme !== bHasReadme) return bHasReadme - aHasReadme;
      return Number(b?.followers ?? 0) - Number(a?.followers ?? 0);
    })[0] ?? null
  );
}

function buildExistingEmailSources(args: {
  candidateEmail?: string | null;
  githubProfile?: any | null;
  scholarProfile?: any | null;
}): AtsExistingEmailSource[] {
  const candidates = [
    args.candidateEmail
      ? {
          email: normalizeEmail(args.candidateEmail),
          label: "candid.email",
          sourceType: "candid" as const,
          url: null,
        }
      : null,
    args.githubProfile?.email
      ? {
          email: normalizeEmail(args.githubProfile.email),
          label: "github_profile.email",
          sourceType: "github" as const,
          url: args.githubProfile.github_url ?? args.githubProfile.blog ?? null,
        }
      : null,
    args.scholarProfile?.email
      ? {
          email: normalizeEmail(args.scholarProfile.email),
          label: "scholar_profile.email",
          sourceType: "scholar" as const,
          url:
            args.scholarProfile.scholar_url ??
            args.scholarProfile.homepage_link ??
            null,
        }
      : null,
  ];

  const sources = candidates.filter(
    (source): source is NonNullable<(typeof candidates)[number]> =>
      Boolean(source && isValidEmail(source.email))
  );

  return Array.from(
    new Map(sources.map((source) => [source.email, source] as const)).values()
  ) as AtsExistingEmailSource[];
}

function normalizeLinkList(value: unknown) {
  return coerceJsonArray<string>(value)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function findFirstLink(urls: string[], pattern: RegExp) {
  return urls.find((url) => pattern.test(url)) ?? null;
}

function getCandidateProfileLinks(args: {
  candidateLinks?: unknown;
  githubProfile?: any | null;
  scholarProfile?: any | null;
}) {
  const candidateLinks = normalizeLinkList(args.candidateLinks);

  return {
    githubUrl: String(args.githubProfile?.github_url ?? "").trim() || null,
    linkedinUrl: findFirstLink(candidateLinks, /linkedin\.com/i),
    scholarUrl:
      String(
        args.scholarProfile?.scholar_url ??
          args.scholarProfile?.homepage_link ??
          ""
      ).trim() || null,
  };
}

async function fetchCandidateSummariesByIds(args: {
  admin: AdminClient;
  candidIds: string[];
  outreachByCandidateId: Map<string, AtsOutreachRecord>;
  shortlistMemoByCandidateId: Map<string, string>;
}) {
  if (args.candidIds.length === 0) return [] as AtsCandidateSummary[];

  const { data: candidates, error: candidateError } = await (
    args.admin.from("candid" as any) as any
  )
    .select(
      `
        id,
        name,
        headline,
        location,
        profile_picture,
        email,
        links,
        experience_user (
          role,
          start_date,
          end_date,
          company_db (
            name,
            logo
          )
        ),
        edu_user (
          school,
          start_date,
          end_date
        )
      `
    )
    .in("id", args.candidIds);

  if (candidateError) {
    throw new Error(candidateError.message ?? "Failed to load ATS candidates");
  }

  const { data: githubProfiles, error: githubError } = await (
    args.admin.from("github_profile" as any) as any
  )
    .select(
      "candid_id, email, github_username, github_url, blog, followers, readme_markdown"
    )
    .in("candid_id", args.candidIds);

  if (githubError) {
    throw new Error(githubError.message ?? "Failed to load GitHub profiles");
  }

  const { data: scholarProfiles, error: scholarError } = await (
    args.admin.from("scholar_profile" as any) as any
  )
    .select("candid_id, email, affiliation, homepage_link, scholar_url")
    .in("candid_id", args.candidIds);

  if (scholarError) {
    throw new Error(scholarError.message ?? "Failed to load Scholar profiles");
  }

  const githubByCandidateId = new Map<string, any[]>();
  for (const row of coerceJsonArray<any>(githubProfiles)) {
    const candidId = String(row?.candid_id ?? "").trim();
    if (!candidId) continue;
    githubByCandidateId.set(candidId, [
      ...(githubByCandidateId.get(candidId) ?? []),
      row,
    ]);
  }

  const scholarByCandidateId = new Map<string, any>();
  for (const row of coerceJsonArray<any>(scholarProfiles)) {
    const candidId = String(row?.candid_id ?? "").trim();
    if (!candidId || scholarByCandidateId.has(candidId)) continue;
    scholarByCandidateId.set(candidId, row);
  }

  const candidateById = new Map(
    coerceJsonArray<any>(candidates).map((candidate) => [
      candidate.id,
      candidate,
    ])
  );

  return args.candidIds
    .map((id) => {
      const candidate = candidateById.get(id);
      if (!candidate) return null;

      const experiences = sortByLatestDate(
        coerceJsonArray<any>(candidate.experience_user).map((item) => ({
          company: item?.company_db?.name ?? null,
          companyLogo: item?.company_db?.logo ?? null,
          endDate: item?.end_date ?? null,
          role: item?.role ?? null,
          startDate: item?.start_date ?? null,
        }))
      );
      const education = sortByLatestDate(
        coerceJsonArray<any>(candidate.edu_user).map((item) => ({
          endDate: item?.end_date ?? null,
          school: item?.school ?? null,
          startDate: item?.start_date ?? null,
        }))
      );
      const githubProfile = pickBestGithubProfile(
        githubByCandidateId.get(id) ?? []
      );
      const scholarProfile = scholarByCandidateId.get(id) ?? null;
      const existingEmailSources = buildExistingEmailSources({
        candidateEmail: candidate?.email ?? null,
        githubProfile,
        scholarProfile,
      });
      const profileLinks = getCandidateProfileLinks({
        candidateLinks: candidate?.links,
        githubProfile,
        scholarProfile,
      });

      return {
        currentCompany: experiences[0]?.company ?? null,
        currentCompanyLogo: experiences[0]?.companyLogo ?? null,
        currentRole: experiences[0]?.role ?? null,
        currentSchool: education[0]?.school ?? null,
        existingEmailSources,
        githubUrl: profileLinks.githubUrl,
        githubUsername: githubProfile?.github_username ?? null,
        headline: candidate?.headline ?? null,
        id,
        linkedinUrl: profileLinks.linkedinUrl,
        location: candidate?.location ?? null,
        name: candidate?.name ?? null,
        outreach: args.outreachByCandidateId.get(id) ?? null,
        profilePicture: candidate?.profile_picture ?? null,
        scholarAffiliation: scholarProfile?.affiliation ?? null,
        scholarUrl: profileLinks.scholarUrl,
        shortlistMemo: args.shortlistMemoByCandidateId.get(id) ?? "",
      } satisfies AtsCandidateSummary;
    })
    .filter(Boolean) as AtsCandidateSummary[];
}

async function fetchCandidateDetailById(args: {
  admin: AdminClient;
  candidId: string;
  outreach: AtsOutreachRecord | null;
  shortlistMemo: string | null;
}) {
  const { data, error } = await (args.admin.from("candid" as any) as any)
    .select(
      `
        id,
        name,
        headline,
        bio,
        email,
        location,
        profile_picture,
        links,
        experience_user (
          role,
          description,
          start_date,
          end_date,
          company_db (
            name,
            linkedin_url,
            logo
          )
        ),
        edu_user (
          school,
          start_date,
          end_date
        ),
        publications (
          title,
          link,
          published_at,
          citation_num
        )
      `
    )
    .eq("id", args.candidId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load ATS candidate detail");
  }

  if (!data) {
    throw new InternalApiError(404, "Candidate not found");
  }

  const { data: githubProfiles, error: githubError } = await (
    args.admin.from("github_profile" as any) as any
  )
    .select(
      [
        "candid_id",
        "avatar_url",
        "bio",
        "blog",
        "company",
        "email",
        "followers",
        "github_url",
        "github_username",
        "location",
        "name",
        "public_repos",
        "readme_markdown",
      ].join(",")
    )
    .eq("candid_id", args.candidId);

  if (githubError) {
    throw new Error(githubError.message ?? "Failed to load GitHub profile");
  }

  const { data: scholarProfile, error: scholarError } = await (
    args.admin.from("scholar_profile" as any) as any
  )
    .select(
      "candid_id, email, affiliation, h_index, homepage_link, scholar_url, topics, total_citations_num"
    )
    .eq("candid_id", args.candidId)
    .maybeSingle();

  if (scholarError) {
    throw new Error(scholarError.message ?? "Failed to load Scholar profile");
  }

  const bestGithubProfile = pickBestGithubProfile(
    coerceJsonArray<any>(githubProfiles)
  );
  const profileLinks = getCandidateProfileLinks({
    candidateLinks: data?.links,
    githubProfile: bestGithubProfile,
    scholarProfile,
  });

  const existingEmailSources = buildExistingEmailSources({
    candidateEmail: data?.email ?? null,
    githubProfile: bestGithubProfile,
    scholarProfile,
  });

  const experience = sortByLatestDate(
    coerceJsonArray<any>(data.experience_user).map((item) => ({
      company: item?.company_db?.name ?? null,
      companyLogo: item?.company_db?.logo ?? null,
      companyLinkedinUrl: item?.company_db?.linkedin_url ?? null,
      description: item?.description ?? null,
      endDate: item?.end_date ?? null,
      role: item?.role ?? null,
      startDate: item?.start_date ?? null,
    }))
  );

  const education = sortByLatestDate(
    coerceJsonArray<any>(data.edu_user).map((item) => ({
      endDate: item?.end_date ?? null,
      school: item?.school ?? null,
      startDate: item?.start_date ?? null,
    }))
  );

  const publications = coerceJsonArray<any>(data.publications).map(
    (item) =>
      ({
        citationCount:
          item?.citation_num == null ? null : Number(item.citation_num ?? 0),
        link: item?.link ?? null,
        publishedAt: item?.published_at ?? null,
        title: String(item?.title ?? ""),
      }) satisfies AtsCandidatePublication
  );

  return {
    bio: data?.bio ?? null,
    companyLinks: Array.from(
      new Set(
        experience
          .map((item) => item.companyLinkedinUrl)
          .filter((value): value is string => Boolean(value))
      )
    ),
    currentCompany: experience[0]?.company ?? null,
    currentCompanyLogo: experience[0]?.companyLogo ?? null,
    currentRole: experience[0]?.role ?? null,
    currentSchool: education[0]?.school ?? null,
    existingEmailSources,
    experience,
    githubProfile: bestGithubProfile
      ? {
          avatarUrl: bestGithubProfile.avatar_url ?? null,
          bio: bestGithubProfile.bio ?? null,
          blog: bestGithubProfile.blog ?? null,
          company: bestGithubProfile.company ?? null,
          email: bestGithubProfile.email ?? null,
          followers:
            bestGithubProfile.followers == null
              ? null
              : Number(bestGithubProfile.followers ?? 0),
          githubUrl: bestGithubProfile.github_url ?? null,
          location: bestGithubProfile.location ?? null,
          name: bestGithubProfile.name ?? null,
          publicRepos:
            bestGithubProfile.public_repos == null
              ? null
              : Number(bestGithubProfile.public_repos ?? 0),
          readmeMarkdown: bestGithubProfile.readme_markdown ?? null,
          username: bestGithubProfile.github_username ?? null,
        }
      : null,
    githubUrl: profileLinks.githubUrl,
    githubUsername: bestGithubProfile?.github_username ?? null,
    headline: data?.headline ?? null,
    id: String(data?.id ?? args.candidId),
    linkedinUrl: profileLinks.linkedinUrl,
    links: coerceJsonArray<string>(data?.links).map((link) => String(link)),
    location: data?.location ?? null,
    name: data?.name ?? null,
    outreach: args.outreach,
    profilePicture: data?.profile_picture ?? null,
    publications,
    scholarAffiliation: scholarProfile?.affiliation ?? null,
    scholarUrl: profileLinks.scholarUrl,
    scholarProfile: scholarProfile
      ? {
          affiliation: scholarProfile.affiliation ?? null,
          email: scholarProfile.email ?? null,
          hIndex:
            scholarProfile.h_index == null
              ? null
              : Number(scholarProfile.h_index ?? 0),
          homepageLink: scholarProfile.homepage_link ?? null,
          scholarUrl: scholarProfile.scholar_url ?? null,
          topics: scholarProfile.topics ?? null,
          totalCitations:
            scholarProfile.total_citations_num == null
              ? null
              : Number(scholarProfile.total_citations_num ?? 0),
        }
      : null,
    shortlistMemo: args.shortlistMemo ?? "",
  } satisfies AtsCandidateDetail;
}

async function ensureOutreachRecord(args: {
  admin: AdminClient;
  candidId: string;
  seed?: Partial<{
    active_step: number;
    email_discovery_evidence: AtsEmailDiscoveryEvidence[];
    email_discovery_status: AtsEmailDiscoveryStatus;
    email_discovery_summary: string | null;
    email_discovery_trace: AtsEmailDiscoveryTraceItem[];
    email_source_label: string | null;
    email_source_type: AtsEmailSourceType | null;
    email_source_url: string | null;
    history: AtsContactHistoryItem[];
    last_sent_at: string | null;
    memo: string | null;
    next_due_at: string | null;
    sequence_mark: AtsSequenceMarkStatus | null;
    sequence_schedule: AtsSequenceStepSchedule[];
    sequence_status: AtsSequenceStatus;
    stopped_at: string | null;
    target_email: string | null;
  }>;
  userId: string;
}) {
  const { data: existing, error: existingError } = await (
    args.admin.from("candidate_outreach" as any) as any
  )
    .select(OUTREACH_SELECT)
    .eq("user_id", args.userId)
    .eq("candid_id", args.candidId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message ?? "Failed to read outreach record");
  }

  if (existing) {
    return mapOutreachRecord(existing);
  }

  const now = new Date().toISOString();
  const payload = {
    active_step: 0,
    candid_id: args.candidId,
    created_at: now,
    email_discovery_evidence: [],
    email_discovery_status: "not_started",
    email_discovery_summary: null,
    email_discovery_trace: [],
    email_source_label: null,
    email_source_type: null,
    email_source_url: null,
    history: [],
    last_sent_at: null,
    memo: null,
    next_due_at: null,
    sequence_mark: null,
    sequence_schedule: createDefaultAtsSequenceSchedule(),
    sequence_status: "draft",
    stopped_at: null,
    target_email: null,
    updated_at: now,
    user_id: args.userId,
    ...(args.seed ?? {}),
  };

  const { data, error } = await (
    args.admin.from("candidate_outreach" as any) as any
  )
    .upsert(payload, {
      onConflict: "user_id,candid_id",
    })
    .select(OUTREACH_SELECT)
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to ensure outreach record");
  }

  return mapOutreachRecord(data);
}

async function updateOutreachRecord(args: {
  admin: AdminClient;
  candidId: string;
  patch: Record<string, unknown>;
  userId: string;
}) {
  await ensureOutreachRecord({
    admin: args.admin,
    candidId: args.candidId,
    userId: args.userId,
  });

  const { data, error } = await (
    args.admin.from("candidate_outreach" as any) as any
  )
    .update({
      ...args.patch,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", args.userId)
    .eq("candid_id", args.candidId)
    .select(OUTREACH_SELECT)
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to update outreach record");
  }

  return mapOutreachRecord(data);
}

async function fetchDueSequenceOutreachRows(args: {
  admin: AdminClient;
  limit: number;
  nowIso: string;
}) {
  const { data, error } = await (
    args.admin.from("candidate_outreach" as any) as any
  )
    .select("user_id, candid_id, active_step, next_due_at, sequence_status")
    .in("sequence_status", ["draft", "active"])
    .not("next_due_at", "is", null)
    .lte("next_due_at", args.nowIso)
    .order("next_due_at", { ascending: true })
    .limit(args.limit);

  if (error) {
    throw new Error(error.message ?? "Failed to load due ATS sequences");
  }

  return coerceJsonArray<any>(data)
    .map((row) => {
      const candidId = String(row?.candid_id ?? "").trim();
      const userId = String(row?.user_id ?? "").trim();
      const nextDueAt = String(row?.next_due_at ?? "").trim();
      if (!candidId || !userId || !nextDueAt) return null;

      return {
        activeStep: Number(row?.active_step ?? 0) || 0,
        candidId,
        nextDueAt,
        sequenceStatus: row?.sequence_status === "active" ? "active" : "draft",
        userId,
      } satisfies DueSequenceOutreachRow;
    })
    .filter(Boolean) as DueSequenceOutreachRow[];
}

function getOutreachPairKey(userId: string, candidId: string) {
  return `${userId}:${candidId}`;
}

async function fetchSequenceDraftPairKeys(args: {
  admin: AdminClient;
  rows: DueSequenceOutreachRow[];
}) {
  const pairKeys = new Set<string>();
  if (args.rows.length === 0) return pairKeys;

  const candidIds = Array.from(new Set(args.rows.map((row) => row.candidId)));
  const userIds = Array.from(new Set(args.rows.map((row) => row.userId)));
  const { data, error } = await (
    args.admin.from("candidate_outreach_message" as any) as any
  )
    .select("user_id, candid_id")
    .eq("kind", "sequence")
    .in("user_id", userIds)
    .in("candid_id", candidIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load sequence drafts");
  }

  for (const row of coerceJsonArray<any>(data)) {
    const userId = String(row?.user_id ?? "").trim();
    const candidId = String(row?.candid_id ?? "").trim();
    if (!userId || !candidId) continue;
    pairKeys.add(getOutreachPairKey(userId, candidId));
  }

  return pairKeys;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function getLocalDateStringForOffset(
  date: Date,
  timezoneOffsetMinutes: number
) {
  const shifted = new Date(date.getTime() - timezoneOffsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  return `${year}-${month}-${day}`;
}

function addDaysToDateString(dateString: string, days: number) {
  const [year, month, day] = dateString
    .split("-")
    .map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function toIsoWithFixedOffset(args: {
  date: string;
  sendTime: string;
  timezoneOffsetMinutes: number;
}) {
  const [year, month, day] = args.date.split("-").map((value) => Number(value));
  const [hours, minutes] = args.sendTime
    .split(":")
    .map((value) => Number(value));
  const utcMs =
    Date.UTC(year, month - 1, day, hours, minutes, 0, 0) +
    args.timezoneOffsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}

function getScheduleForStep(
  schedule: AtsSequenceStepSchedule[] | null | undefined,
  stepNumber: number
) {
  const normalized = normalizeAtsSequenceSchedule(schedule);
  return (
    normalized.find((item) => item.stepNumber === stepNumber) ??
    normalized[stepNumber - 1] ?? {
      date: null,
      delayDays: stepNumber === 1 ? 0 : ATS_SEQUENCE_INTERVAL_DAYS,
      mode: stepNumber === 1 ? ("date" as const) : ("relative" as const),
      sendTime: ATS_DEFAULT_SEQUENCE_TIME,
      stepNumber,
      timezoneOffsetMinutes: ATS_DEFAULT_TIMEZONE_OFFSET_MINUTES,
    }
  );
}

function computeDueAtFromSchedule(args: {
  baseAt: Date;
  schedule: AtsSequenceStepSchedule | null | undefined;
}) {
  const schedule =
    args.schedule ??
    ({
      date: null,
      delayDays: ATS_SEQUENCE_INTERVAL_DAYS,
      mode: "relative",
      sendTime: ATS_DEFAULT_SEQUENCE_TIME,
      stepNumber: 1,
      timezoneOffsetMinutes: ATS_DEFAULT_TIMEZONE_OFFSET_MINUTES,
    } satisfies AtsSequenceStepSchedule);
  const timezoneOffsetMinutes = Number.isFinite(schedule.timezoneOffsetMinutes)
    ? schedule.timezoneOffsetMinutes
    : ATS_DEFAULT_TIMEZONE_OFFSET_MINUTES;
  const sendTime = /^\d{2}:\d{2}$/.test(schedule.sendTime)
    ? schedule.sendTime
    : ATS_DEFAULT_SEQUENCE_TIME;
  const date =
    schedule.mode === "date" && schedule.date
      ? schedule.date
      : addDaysToDateString(
          getLocalDateStringForOffset(args.baseAt, timezoneOffsetMinutes),
          Math.max(0, schedule.delayDays)
        );

  return toIsoWithFixedOffset({
    date,
    sendTime,
    timezoneOffsetMinutes,
  });
}

function resolveTargetEmail(args: {
  candidate: Pick<
    AtsCandidateDetail | AtsCandidateSummary,
    "existingEmailSources"
  >;
  outreach: AtsOutreachRecord | null;
}) {
  if (isValidEmail(args.outreach?.targetEmail)) {
    return normalizeEmail(args.outreach?.targetEmail);
  }

  const fallback = args.candidate.existingEmailSources.find((source) =>
    isValidEmail(source.email)
  );

  return fallback?.email ?? null;
}

function getNextOutreachStep(activeStep: number) {
  const next = Math.max(1, activeStep + 1);
  if (next > ATS_SEQUENCE_STEP_COUNT) {
    return null;
  }
  return next;
}

function getSentStepNumbers(messages: AtsMessageRecord[]) {
  return new Set(
    messages
      .filter(
        (message) =>
          message.status === "sent" &&
          message.stepNumber != null &&
          message.stepNumber >= 1 &&
          message.stepNumber <= ATS_SEQUENCE_STEP_COUNT
      )
      .map((message) => message.stepNumber as number)
  );
}

function getNextSequenceStepFromSentSet(sentStepNumbers: Set<number>) {
  for (
    let stepNumber = 1;
    stepNumber <= ATS_SEQUENCE_STEP_COUNT;
    stepNumber += 1
  ) {
    if (!sentStepNumbers.has(stepNumber)) {
      return stepNumber;
    }
  }

  return null;
}

async function fetchSentStepNumbersByCandidateIds(args: {
  admin: AdminClient;
  candidIds: string[];
  userId: string;
}) {
  const sentByCandidateId = new Map<string, Set<number>>();
  if (args.candidIds.length === 0) return sentByCandidateId;

  const { data, error } = await (
    args.admin.from("candidate_outreach_message" as any) as any
  )
    .select("candid_id, step_number")
    .eq("user_id", args.userId)
    .eq("status", "sent")
    .in("candid_id", args.candidIds);

  if (error) {
    throw new Error(error.message ?? "Failed to load sent outreach steps");
  }

  for (const row of coerceJsonArray<any>(data)) {
    const candidId = String(row?.candid_id ?? "").trim();
    const stepNumber = Number(row?.step_number ?? 0) || 0;
    if (!candidId || stepNumber < 1 || stepNumber > ATS_SEQUENCE_STEP_COUNT)
      continue;

    const existing = sentByCandidateId.get(candidId) ?? new Set<number>();
    existing.add(stepNumber);
    sentByCandidateId.set(candidId, existing);
  }

  return sentByCandidateId;
}

async function tryClaimSequenceDraftMessage(args: {
  admin: AdminClient;
  currentStatus: "draft" | "sending";
  id: number;
  staleBeforeIso?: string;
  userId: string;
}) {
  let query = (args.admin.from("candidate_outreach_message" as any) as any)
    .update({
      status: "sending",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", args.userId)
    .eq("id", args.id)
    .eq("kind", "sequence")
    .eq("status", args.currentStatus);

  if (args.currentStatus === "sending" && args.staleBeforeIso) {
    query = query.lte("updated_at", args.staleBeforeIso);
  }

  const { data, error } = await query.select(MESSAGE_SELECT);

  if (error) {
    throw new Error(error.message ?? "Failed to claim sequence draft");
  }

  const row = coerceJsonArray<any>(data)[0] ?? null;
  return row ? mapMessageRecord(row) : null;
}

async function claimSequenceDraftMessage(args: {
  admin: AdminClient;
  id: number;
  userId: string;
}) {
  const staleBeforeIso = new Date(Date.now() - 15 * 60_000).toISOString();
  const claimedDraft = await tryClaimSequenceDraftMessage({
    admin: args.admin,
    currentStatus: "draft",
    id: args.id,
    userId: args.userId,
  });
  if (claimedDraft) {
    return { message: claimedDraft, outcome: "claimed" as const };
  }

  const current = await fetchMessageRecordById({
    admin: args.admin,
    id: args.id,
    userId: args.userId,
  });
  if (!current) {
    return { outcome: "not_found" as const };
  }

  if (current.status === "sent") {
    return { message: current, outcome: "already_sent" as const };
  }

  if (current.status === "sending") {
    const currentUpdatedAt =
      Date.parse(current.updatedAt || current.createdAt) || Number.NaN;
    if (
      !Number.isNaN(currentUpdatedAt) &&
      currentUpdatedAt <= Date.parse(staleBeforeIso)
    ) {
      const reclaimed = await tryClaimSequenceDraftMessage({
        admin: args.admin,
        currentStatus: "sending",
        id: args.id,
        staleBeforeIso,
        userId: args.userId,
      });
      if (reclaimed) {
        return { message: reclaimed, outcome: "claimed" as const };
      }
    }

    return { message: current, outcome: "already_sending" as const };
  }

  return { message: current, outcome: "not_claimable" as const };
}

async function restoreSequenceDraftMessage(args: {
  admin: AdminClient;
  id: number;
  userId: string;
}) {
  const { error } = await (
    args.admin.from("candidate_outreach_message" as any) as any
  )
    .update({
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", args.userId)
    .eq("id", args.id)
    .eq("kind", "sequence")
    .eq("status", "sending");

  if (error) {
    throw new Error(error.message ?? "Failed to restore sequence draft");
  }
}

async function upsertSequenceDrafts(args: {
  admin: AdminClient;
  candidId: string;
  createdBy: string;
  drafts: Array<{ body: string; stepNumber: number; subject: string }>;
  outreachId: number;
  userId: string;
}) {
  const existing = await fetchMessageRecordsByCandidateId({
    admin: args.admin,
    candidId: args.candidId,
    userId: args.userId,
  });

  const existingByStep = new Map(
    existing
      .filter((message) => message.kind === "sequence" && message.stepNumber)
      .map((message) => [message.stepNumber as number, message] as const)
  );

  for (const draft of args.drafts) {
    const existingMessage = existingByStep.get(draft.stepNumber);
    if (existingMessage?.status === "sent") {
      continue;
    }

    const payload = {
      body: draft.body,
      candid_id: args.candidId,
      created_by: args.createdBy,
      kind: "sequence",
      outreach_id: args.outreachId,
      status: existingMessage?.status ?? "draft",
      step_number: draft.stepNumber,
      subject: draft.subject,
      updated_at: new Date().toISOString(),
      user_id: args.userId,
    };

    if (existingMessage) {
      const { error } = await (
        args.admin.from("candidate_outreach_message" as any) as any
      )
        .update(payload)
        .eq("id", existingMessage.id);

      if (error) {
        throw new Error(error.message ?? "Failed to update sequence draft");
      }
      continue;
    }

    const { error } = await (
      args.admin.from("candidate_outreach_message" as any) as any
    ).insert({
      ...payload,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(error.message ?? "Failed to insert sequence draft");
    }
  }
}

async function buildSequenceDrafts(args: {
  candidate: AtsCandidateDetail;
  companyUser: CompanyUserRecord | null;
  workspace: AtsWorkspaceRecord;
}) {
  const jobDescription = String(args.workspace.jobDescription ?? "").trim();
  if (!jobDescription) {
    throw new InternalApiError(400, "JD를 먼저 입력해 주세요.");
  }

  const systemPrompt = `You create a concise 4-step recruiting outreach sequence.
Return JSON only with key "steps".
"steps" must be an array of exactly 4 objects.
Each object must include:
- stepNumber: 1..4
- subject: short email subject
- body: plain text email body

Rules:
- Use Korean by default, but keep company, paper, repo, and technical terms in English when natural.
- Personalize with the candidate's actual background.
- Keep each email compact and recruiter-like.
- Step 1 introduces the role and why they are relevant.
- Steps 2 and 3 are follow-ups with new angles.
- Step 4 is a respectful final nudge.
- Do not invent unavailable facts.
- No markdown bullets unless they feel natural in email.
- Do not include placeholders.
- Do not include fake signatures beyond what is provided.`;

  const userPrompt = `Company context:
- company: ${args.companyUser?.company ?? "Harper"}
- company pitch: ${args.workspace.companyPitch ?? ""}
- signature: ${args.workspace.signature ?? ""}

JD:
${jobDescription}

Candidate:
- name: ${args.candidate.name ?? ""}
- headline: ${args.candidate.headline ?? ""}
- location: ${args.candidate.location ?? ""}
- current role: ${args.candidate.currentRole ?? ""}
- current company: ${args.candidate.currentCompany ?? ""}
- current school: ${args.candidate.currentSchool ?? ""}
- scholar affiliation: ${args.candidate.scholarAffiliation ?? ""}
- github username: ${args.candidate.githubUsername ?? ""}
- bio: ${args.candidate.bio ?? ""}

Top experience:
${args.candidate.experience
  .slice(0, 3)
  .map((item, index) => {
    return `${index + 1}. ${item.role ?? ""} @ ${item.company ?? ""} (${item.startDate ?? ""} ~ ${item.endDate ?? "current"})`;
  })
  .join("\n")}

Top publications:
${args.candidate.publications
  .slice(0, 3)
  .map((item, index) => {
    return `${index + 1}. ${item.title} (${item.publishedAt ?? ""})`;
  })
  .join("\n")}`;

  const raw = await xaiInference(
    "grok-4-fast-reasoning",
    systemPrompt,
    userPrompt,
    0.35
  );
  const parsed = safeParseJson(raw) as {
    steps?: Array<{
      body?: string;
      stepNumber?: number;
      subject?: string;
    }>;
  } | null;

  const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
  const normalized = steps
    .map((step) => ({
      body: String(step?.body ?? "").trim(),
      stepNumber: Number(step?.stepNumber ?? 0),
      subject: String(step?.subject ?? "").trim(),
    }))
    .filter(
      (step) =>
        step.stepNumber >= 1 && step.stepNumber <= ATS_SEQUENCE_STEP_COUNT
    )
    .sort((a, b) => a.stepNumber - b.stepNumber);

  if (normalized.length !== ATS_SEQUENCE_STEP_COUNT) {
    throw new Error("4-step sequence generation failed");
  }

  if (normalized.some((step) => !step.subject || !step.body)) {
    throw new Error("Generated sequence is incomplete");
  }

  return normalized;
}

function buildAtsCandidatePrompt(candidate: AtsCandidateDetail) {
  return `Candidate:
- name: ${candidate.name ?? ""}
- headline: ${candidate.headline ?? ""}
- location: ${candidate.location ?? ""}
- current role: ${candidate.currentRole ?? ""}
- current company: ${candidate.currentCompany ?? ""}
- current school: ${candidate.currentSchool ?? ""}
- scholar affiliation: ${candidate.scholarAffiliation ?? ""}
- github username: ${candidate.githubUsername ?? ""}
- bio: ${candidate.bio ?? ""}

Top experience:
${candidate.experience
  .slice(0, 3)
  .map((item, index) => {
    return `${index + 1}. ${item.role ?? ""} @ ${item.company ?? ""} (${item.startDate ?? ""} ~ ${item.endDate ?? "current"})`;
  })
  .join("\n")}

Top publications:
${candidate.publications
  .slice(0, 3)
  .map((item, index) => {
    return `${index + 1}. ${item.title} (${item.publishedAt ?? ""})`;
  })
  .join("\n")}`;
}

function buildAtsCompanyPrompt(args: {
  companyUser: CompanyUserRecord | null;
  workspace: AtsWorkspaceRecord;
}) {
  return `Company context:
- company: ${args.companyUser?.company ?? "Harper"}
- company pitch: ${args.workspace.companyPitch ?? ""}
- signature: ${args.workspace.signature ?? ""}`;
}

async function buildInitialContactDraft(args: {
  candidate: AtsCandidateDetail;
  companyUser: CompanyUserRecord | null;
  workspace: AtsWorkspaceRecord;
}) {
  const jobDescription = String(args.workspace.jobDescription ?? "").trim();
  const companyPitch = String(args.workspace.companyPitch ?? "").trim();

  if (!jobDescription && !companyPitch) {
    throw new InternalApiError(
      400,
      "JD 또는 Company Pitch를 먼저 입력해 주세요."
    );
  }

  const systemPrompt = `You write a single first-touch recruiting outreach email.
Return JSON only with keys "subject" and "body".

Rules:
- Write in Korean by default.
- Keep company names, paper titles, repo names, and technical keywords in English when natural.
- This is the very first outreach email, not a follow-up.
- Personalize using only real candidate background from the prompt.
- Tone: concise, thoughtful, recruiter-like, not pushy.
- Subject should be short.
- Body should be plain text and easy to skim.
- Avoid markdown bullets unless absolutely natural for email.
- Do not invent unavailable facts.
- Do not include placeholders.
- If a signature is provided, end with it naturally.`;

  const userPrompt = `${buildAtsCompanyPrompt(args)}

JD:
${jobDescription}

${buildAtsCandidatePrompt(args.candidate)}

Write one initial outreach email for this candidate.`;

  const raw = await xaiInference(
    "grok-4-fast-reasoning",
    systemPrompt,
    userPrompt,
    0.35
  );
  const parsed = safeParseJson(raw) as {
    body?: string;
    subject?: string;
  } | null;

  const subject = String(parsed?.subject ?? "").trim();
  const body = String(parsed?.body ?? "").trim();

  if (!subject || !body) {
    throw new Error("Initial contact draft generation failed");
  }

  return {
    body,
    subject,
  } satisfies AtsContactEmailDraft;
}

export async function fetchAtsWorkspace(args: {
  userEmail: string | null | undefined;
  userId: string;
}): Promise<AtsWorkspaceResponse> {
  const admin = getSupabaseAdmin();
  const [companyUser, workspaceRow, bookmarkFolders] = await Promise.all([
    fetchCompanyUserRecord(admin, args.userId),
    fetchWorkspaceRow(admin, args.userId),
    fetchBookmarkFolders(admin, args.userId),
  ]);
  const selectedFolderId = resolveAtsBookmarkFolderId({
    folders: bookmarkFolders,
    requestedFolderId: Number.isFinite(Number(workspaceRow?.bookmark_folder_id))
      ? Number(workspaceRow?.bookmark_folder_id)
      : null,
  });
  const candidateIds =
    selectedFolderId != null
      ? await fetchBookmarkFolderCandidateIds(
          admin,
          args.userId,
          selectedFolderId
        )
      : [];

  const [outreachByCandidateId, shortlistMemoByCandidateId] = await Promise.all(
    [
      fetchOutreachRecordsByCandidateIds({
        admin,
        candidIds: candidateIds,
        userId: args.userId,
      }),
      fetchShortlistMemoMap(admin, args.userId, candidateIds),
    ]
  );

  const candidates = await fetchCandidateSummariesByIds({
    admin,
    candidIds: candidateIds,
    outreachByCandidateId,
    shortlistMemoByCandidateId,
  });

  return {
    allowedDomain: "matchharper.com",
    candidates,
    folders: bookmarkFolders.map(mapBookmarkFolderOption),
    totalCount: candidates.length,
    workspace: mapWorkspaceRecord({
      bookmarkFolderId: selectedFolderId,
      companyUser,
      row: workspaceRow,
      userEmail: args.userEmail,
    }),
  };
}

export async function saveAtsWorkspace(args: {
  bookmarkFolderId?: number | null;
  companyPitch?: string | null;
  jobDescription?: string | null;
  senderEmail?: string | null;
  signature?: string | null;
  userEmail: string | null | undefined;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const [companyUser, bookmarkFolders] = await Promise.all([
    fetchCompanyUserRecord(admin, args.userId),
    fetchBookmarkFolders(admin, args.userId),
  ]);
  const normalizedSenderEmail = String(args.senderEmail ?? "").trim();

  if (normalizedSenderEmail && !isValidEmail(normalizedSenderEmail)) {
    throw new InternalApiError(400, "유효한 발신자 이메일을 입력해 주세요.");
  }

  const normalizedBookmarkFolderId =
    args.bookmarkFolderId === undefined
      ? undefined
      : args.bookmarkFolderId == null
        ? null
        : Number(args.bookmarkFolderId);

  if (
    normalizedBookmarkFolderId !== undefined &&
    normalizedBookmarkFolderId !== null &&
    !bookmarkFolders.some(
      (folder) => Number(folder.id) === normalizedBookmarkFolderId
    )
  ) {
    throw new InternalApiError(400, "유효한 북마크 폴더를 선택해 주세요.");
  }

  return upsertWorkspaceRow({
    admin,
    bookmarkFolderId: normalizedBookmarkFolderId,
    companyPitch: args.companyPitch,
    companyUser,
    jobDescription: args.jobDescription,
    senderEmail: normalizedSenderEmail || null,
    signature: args.signature,
    userEmail: args.userEmail ?? null,
    userId: args.userId,
  });
}

export async function fetchAtsCandidateDetail(args: {
  userEmail: string | null | undefined;
  userId: string;
  candidId: string;
}): Promise<AtsCandidateDetailResponse> {
  const admin = getSupabaseAdmin();
  const [
    companyUser,
    workspaceRow,
    outreachByCandidateId,
    shortlistMemoByCandidateId,
  ] = await Promise.all([
    fetchCompanyUserRecord(admin, args.userId),
    fetchWorkspaceRow(admin, args.userId),
    fetchOutreachRecordsByCandidateIds({
      admin,
      candidIds: [args.candidId],
      userId: args.userId,
    }),
    fetchShortlistMemoMap(admin, args.userId, [args.candidId]),
  ]);

  const outreach = outreachByCandidateId.get(args.candidId) ?? null;
  const candidate = await fetchCandidateDetailById({
    admin,
    candidId: args.candidId,
    outreach,
    shortlistMemo: shortlistMemoByCandidateId.get(args.candidId) ?? "",
  });
  const messages = await fetchMessageRecordsByCandidateId({
    admin,
    candidId: args.candidId,
    userId: args.userId,
  });

  return {
    candidate,
    messages,
    workspace: mapWorkspaceRecord({
      companyUser,
      row: workspaceRow,
      userEmail: args.userEmail,
    }),
  };
}

export async function discoverCandidateEmail(args: {
  candidId: string;
  req: NextRequest;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const outreach = await ensureOutreachRecord({
    admin,
    candidId: args.candidId,
    seed: {
      email_discovery_status: "searching",
      email_discovery_summary: "공개 이메일 탐색 중입니다.",
    },
    userId: args.userId,
  });

  const shortlistMemoByCandidateId = await fetchShortlistMemoMap(
    admin,
    args.userId,
    [args.candidId]
  );
  const candidate = await fetchCandidateDetailById({
    admin,
    candidId: args.candidId,
    outreach,
    shortlistMemo: shortlistMemoByCandidateId.get(args.candidId) ?? "",
  });

  let persistedTraceLength = 0;
  let persistedTraceAt = 0;
  let persistTraceChain: Promise<void> = Promise.resolve();

  const queueLiveTracePersist = (trace: AtsEmailDiscoveryTraceItem[]) => {
    const latestTrace = trace[trace.length - 1];
    if (!latestTrace) return;

    const now = Date.now();
    const shouldPersist =
      trace.length === 1 ||
      latestTrace.kind === "query" ||
      latestTrace.kind === "scrape" ||
      trace.length - persistedTraceLength >= 2 ||
      now - persistedTraceAt >= 1_500;

    if (!shouldPersist) return;

    persistedTraceLength = trace.length;
    persistedTraceAt = now;

    const traceSnapshot = trace.slice();
    persistTraceChain = persistTraceChain
      .catch(() => undefined)
      .then(async () => {
        await updateOutreachRecord({
          admin,
          candidId: args.candidId,
          patch: {
            email_discovery_status: "searching",
            email_discovery_summary: latestTrace.content,
            email_discovery_trace: traceSnapshot,
          },
          userId: args.userId,
        });
      })
      .catch((error) => {
        console.error("[ats-email-discovery] failed to persist live trace", {
          candidId: args.candidId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };

  const result = await findCandidateEmailWithAgenticFlow({
    candidate,
    onTrace: queueLiveTracePersist,
    req: args.req,
  });

  await persistTraceChain;

  const patch = {
    email_discovery_evidence: result.evidence,
    email_discovery_status:
      result.status === "found"
        ? result.sourceType === "manual"
          ? "manual"
          : "found"
        : result.status === "error"
          ? "error"
          : "not_found",
    email_discovery_summary: result.summary,
    email_discovery_trace: result.trace,
    email_source_label: result.sourceLabel,
    email_source_type: result.sourceType,
    email_source_url: result.sourceUrl,
    target_email: result.bestEmail ?? outreach.targetEmail ?? null,
  };

  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch,
    userId: args.userId,
  });
}

export async function setManualCandidateEmail(args: {
  candidId: string;
  email: string;
  userId: string;
}) {
  const normalizedEmail = normalizeEmail(args.email);
  if (!isValidEmail(normalizedEmail)) {
    throw new InternalApiError(400, "유효한 이메일을 입력해 주세요.");
  }

  const admin = getSupabaseAdmin();
  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      email_discovery_status: "manual",
      email_discovery_summary: "수동으로 이메일을 입력했습니다.",
      email_source_label: "manual override",
      email_source_type: "manual",
      email_source_url: null,
      target_email: normalizedEmail,
    },
    userId: args.userId,
  });
}

export async function setAtsSequenceMark(args: {
  candidId: string;
  sequenceMark: AtsSequenceMarkStatus | null;
  userId: string;
}) {
  if (args.sequenceMark && !isAtsSequenceMarkStatus(args.sequenceMark)) {
    throw new InternalApiError(400, "유효한 sequence mark를 선택해 주세요.");
  }

  const admin = getSupabaseAdmin();
  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      sequence_mark: args.sequenceMark,
    },
    userId: args.userId,
  });
}

export async function saveAtsCandidateMemo(args: {
  candidId: string;
  memo: string | null;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      memo: String(args.memo ?? "").trim() || null,
    },
    userId: args.userId,
  });
}

export async function clearAtsEmailDiscoveryTrace(args: {
  candidId: string;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const current = await ensureOutreachRecord({
    admin,
    candidId: args.candidId,
    userId: args.userId,
  });
  const shouldResetDiscoveryState =
    current.emailDiscoveryStatus === "not_started" ||
    current.emailDiscoveryStatus === "searching" ||
    current.emailDiscoveryStatus === "not_found" ||
    current.emailDiscoveryStatus === "error";

  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      ...(shouldResetDiscoveryState
        ? {
            email_discovery_evidence: [],
            email_discovery_status: "not_started",
            email_discovery_summary: null,
            email_source_label: null,
            email_source_type: null,
            email_source_url: null,
          }
        : {}),
      email_discovery_trace: [],
    },
    userId: args.userId,
  });
}

export async function resetAtsCandidateOutreach(args: {
  candidId: string;
  userId: string;
}) {
  const admin = getSupabaseAdmin();

  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      active_step: 0,
      email_discovery_evidence: [],
      email_discovery_status: "not_started",
      email_discovery_summary: null,
      email_discovery_trace: [],
      email_source_label: null,
      email_source_type: null,
      email_source_url: null,
      history: [],
      last_sent_at: null,
      memo: null,
      next_due_at: null,
      sequence_mark: null,
      sequence_schedule: createDefaultAtsSequenceSchedule(),
      sequence_status: "draft",
      stopped_at: null,
      target_email: null,
    },
    userId: args.userId,
  });
}

export async function saveAtsSequenceSchedule(args: {
  candidId: string;
  sequenceSchedule: AtsSequenceStepSchedule[];
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const current =
    (
      await fetchOutreachRecordsByCandidateIds({
        admin,
        candidIds: [args.candidId],
        userId: args.userId,
      })
    ).get(args.candidId) ??
    (await ensureOutreachRecord({
      admin,
      candidId: args.candidId,
      userId: args.userId,
    }));
  const sequenceSchedule = normalizeAtsSequenceSchedule(args.sequenceSchedule);
  const nextStep =
    current.sequenceStatus === "completed"
      ? null
      : getNextOutreachStep(current.activeStep);
  const baseAt = current.lastSentAt ? new Date(current.lastSentAt) : new Date();

  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      next_due_at:
        nextStep == null
          ? null
          : computeDueAtFromSchedule({
              baseAt,
              schedule: getScheduleForStep(sequenceSchedule, nextStep),
            }),
      sequence_schedule: sequenceSchedule,
    },
    userId: args.userId,
  });
}

export async function generateAtsContactEmailDraft(args: {
  candidId: string;
  userEmail: string | null | undefined;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const [
    companyUser,
    workspaceRow,
    outreachByCandidateId,
    shortlistMemoByCandidateId,
  ] = await Promise.all([
    fetchCompanyUserRecord(admin, args.userId),
    fetchWorkspaceRow(admin, args.userId),
    fetchOutreachRecordsByCandidateIds({
      admin,
      candidIds: [args.candidId],
      userId: args.userId,
    }),
    fetchShortlistMemoMap(admin, args.userId, [args.candidId]),
  ]);

  const workspace = mapWorkspaceRecord({
    companyUser,
    row: workspaceRow,
    userEmail: args.userEmail,
  });
  const outreach =
    outreachByCandidateId.get(args.candidId) ??
    (await ensureOutreachRecord({
      admin,
      candidId: args.candidId,
      userId: args.userId,
    }));
  const candidate = await fetchCandidateDetailById({
    admin,
    candidId: args.candidId,
    outreach,
    shortlistMemo: shortlistMemoByCandidateId.get(args.candidId) ?? "",
  });

  return buildInitialContactDraft({
    candidate,
    companyUser,
    workspace,
  });
}

export async function addAtsContactHistory(args: {
  candidId: string;
  channel: AtsContactHistoryChannel;
  contactedAt: string;
  note: string | null;
  source?: AtsContactHistoryItem["source"];
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const current =
    (
      await fetchOutreachRecordsByCandidateIds({
        admin,
        candidIds: [args.candidId],
        userId: args.userId,
      })
    ).get(args.candidId) ??
    (await ensureOutreachRecord({
      admin,
      candidId: args.candidId,
      userId: args.userId,
    }));
  const item = {
    channel: args.channel,
    contactedAt: args.contactedAt,
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    note: String(args.note ?? "").trim() || null,
    source: args.source ?? "manual",
  } satisfies AtsContactHistoryItem;

  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      history: [...current.history, item],
    },
    userId: args.userId,
  });
}

export async function deleteAtsContactHistory(args: {
  candidId: string;
  historyId: string;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const current =
    (
      await fetchOutreachRecordsByCandidateIds({
        admin,
        candidIds: [args.candidId],
        userId: args.userId,
      })
    ).get(args.candidId) ??
    (await ensureOutreachRecord({
      admin,
      candidId: args.candidId,
      userId: args.userId,
    }));

  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      history: current.history.filter((item) => item.id !== args.historyId),
    },
    userId: args.userId,
  });
}

export async function sendAtsSingleManualEmail(args: {
  body: string;
  candidId: string;
  subject: string;
  targetEmail?: string | null;
  userEmail: string | null | undefined;
  userId: string;
}) {
  if (!String(args.subject ?? "").trim() || !String(args.body ?? "").trim()) {
    throw new InternalApiError(400, "제목과 본문을 입력해 주세요.");
  }

  const admin = getSupabaseAdmin();
  const [workspaceRow, outreachByCandidateId, shortlistMemoByCandidateId] =
    await Promise.all([
      fetchWorkspaceRow(admin, args.userId),
      fetchOutreachRecordsByCandidateIds({
        admin,
        candidIds: [args.candidId],
        userId: args.userId,
      }),
      fetchShortlistMemoMap(admin, args.userId, [args.candidId]),
    ]);

  const outreach =
    outreachByCandidateId.get(args.candidId) ??
    (await ensureOutreachRecord({
      admin,
      candidId: args.candidId,
      userId: args.userId,
    }));
  const candidate = await fetchCandidateDetailById({
    admin,
    candidId: args.candidId,
    outreach,
    shortlistMemo: shortlistMemoByCandidateId.get(args.candidId) ?? "",
  });
  const senderEmail = normalizeEmail(
    workspaceRow?.sender_email ?? args.userEmail ?? ""
  );
  if (!isValidEmail(senderEmail)) {
    throw new InternalApiError(400, "유효한 발신자 이메일이 필요합니다.");
  }

  const targetEmail = normalizeEmail(
    args.targetEmail ?? resolveTargetEmail({ candidate, outreach }) ?? ""
  );
  if (!isValidEmail(targetEmail)) {
    throw new InternalApiError(400, "유효한 대상 이메일이 필요합니다.");
  }

  const variables = buildCandidateTemplateVariables(candidate);
  const renderedSubject = replaceTemplateVariables(
    args.subject,
    variables
  ).trim();
  const renderedBody = replaceTemplateVariables(args.body, variables).trim();
  if (!renderedSubject || !renderedBody) {
    throw new InternalApiError(400, "제목과 본문을 입력해 주세요.");
  }

  await sendInternalEmail({
    from: senderEmail,
    subject: renderedSubject,
    text: renderedBody,
    to: targetEmail,
  });

  const now = new Date().toISOString();
  const { error: insertError } = await (
    admin.from("candidate_outreach_message" as any) as any
  ).insert({
    body: args.body,
    candid_id: args.candidId,
    created_at: now,
    created_by: senderEmail,
    kind: "manual",
    outreach_id: outreach.id,
    rendered_body: renderedBody,
    rendered_subject: renderedSubject,
    sent_at: now,
    status: "sent",
    step_number: null,
    subject: args.subject,
    to_email: targetEmail,
    updated_at: now,
    user_id: args.userId,
  });

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to log manual email");
  }

  await updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      history: [
        ...outreach.history,
        {
          channel: "email",
          contactedAt: now,
          createdAt: now,
          id: crypto.randomUUID(),
          note: `Manual email sent · ${renderedSubject}`,
          source: "manual",
        } satisfies AtsContactHistoryItem,
      ],
      last_sent_at: now,
      target_email: targetEmail,
    },
    userId: args.userId,
  });

  return fetchAtsCandidateDetail({
    candidId: args.candidId,
    userEmail: args.userEmail,
    userId: args.userId,
  });
}

export async function updateAtsSequenceStatus(args: {
  candidId: string;
  paused: boolean;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const current =
    (
      await fetchOutreachRecordsByCandidateIds({
        admin,
        candidIds: [args.candidId],
        userId: args.userId,
      })
    ).get(args.candidId) ?? null;

  if (!current) {
    throw new InternalApiError(400, "먼저 시퀀스를 생성해 주세요.");
  }

  const messages = await fetchMessageRecordsByCandidateId({
    admin,
    candidId: args.candidId,
    userId: args.userId,
  });

  if (!messages.some((message) => message.kind === "sequence")) {
    throw new InternalApiError(400, "먼저 시퀀스를 생성해 주세요.");
  }

  if (
    current.sequenceStatus === "completed" ||
    current.activeStep >= ATS_SEQUENCE_STEP_COUNT
  ) {
    throw new InternalApiError(400, "완료된 시퀀스는 변경할 수 없습니다.");
  }

  return updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      sequence_status: args.paused
        ? "paused"
        : current.activeStep > 0
          ? "active"
          : "draft",
      stopped_at: args.paused ? new Date().toISOString() : null,
    },
    userId: args.userId,
  });
}

export async function generateCandidateSequence(args: {
  candidId: string;
  userEmail: string | null | undefined;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  const [
    companyUser,
    workspaceRow,
    outreachByCandidateId,
    shortlistMemoByCandidateId,
  ] = await Promise.all([
    fetchCompanyUserRecord(admin, args.userId),
    fetchWorkspaceRow(admin, args.userId),
    fetchOutreachRecordsByCandidateIds({
      admin,
      candidIds: [args.candidId],
      userId: args.userId,
    }),
    fetchShortlistMemoMap(admin, args.userId, [args.candidId]),
  ]);

  const workspace = mapWorkspaceRecord({
    companyUser,
    row: workspaceRow,
    userEmail: args.userEmail,
  });
  const outreach =
    outreachByCandidateId.get(args.candidId) ??
    (await ensureOutreachRecord({
      admin,
      candidId: args.candidId,
      userId: args.userId,
    }));
  const candidate = await fetchCandidateDetailById({
    admin,
    candidId: args.candidId,
    outreach,
    shortlistMemo: shortlistMemoByCandidateId.get(args.candidId) ?? "",
  });

  const targetEmail = resolveTargetEmail({ candidate, outreach });
  if (!targetEmail) {
    throw new InternalApiError(
      400,
      "이메일을 먼저 찾은 뒤 시퀀스를 생성해 주세요."
    );
  }
  const sequenceSchedule = normalizeAtsSequenceSchedule(
    outreach.sequenceSchedule
  );
  const nextStep = getNextOutreachStep(outreach.activeStep);
  const nextDueAt =
    nextStep == null
      ? null
      : computeDueAtFromSchedule({
          baseAt: outreach.lastSentAt
            ? new Date(outreach.lastSentAt)
            : new Date(),
          schedule: getScheduleForStep(sequenceSchedule, nextStep),
        });

  const drafts = await buildSequenceDrafts({
    candidate,
    companyUser,
    workspace,
  });

  await upsertSequenceDrafts({
    admin,
    candidId: args.candidId,
    createdBy: args.userEmail ?? "unknown@matchharper.com",
    drafts,
    outreachId: outreach.id,
    userId: args.userId,
  });

  await updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      sequence_status:
        outreach.activeStep >= ATS_SEQUENCE_STEP_COUNT
          ? "completed"
          : outreach.activeStep > 0
            ? "active"
            : "draft",
      next_due_at: nextDueAt,
      sequence_schedule: sequenceSchedule,
      target_email: targetEmail,
    },
    userId: args.userId,
  });

  return fetchAtsCandidateDetail({
    candidId: args.candidId,
    userEmail: args.userEmail,
    userId: args.userId,
  });
}

export async function saveAtsSequenceDraft(args: {
  body: string;
  candidId: string;
  stepNumber: number;
  subject: string;
  userEmail: string | null | undefined;
  userId: string;
}) {
  if (args.stepNumber < 1 || args.stepNumber > ATS_SEQUENCE_STEP_COUNT) {
    throw new InternalApiError(400, "잘못된 step 번호입니다.");
  }

  const subject = String(args.subject ?? "").trim();
  const body = String(args.body ?? "").trim();
  if (!subject || !body) {
    throw new InternalApiError(400, "제목과 본문을 입력해 주세요.");
  }

  const admin = getSupabaseAdmin();
  const detail = await fetchAtsCandidateDetail({
    candidId: args.candidId,
    userEmail: args.userEmail,
    userId: args.userId,
  });
  const outreach = detail.candidate.outreach;
  if (!outreach) {
    throw new InternalApiError(400, "시퀀스 상태를 찾지 못했습니다.");
  }

  const draft = detail.messages.find(
    (message) =>
      message.kind === "sequence" && message.stepNumber === args.stepNumber
  );
  if (!draft) {
    throw new InternalApiError(400, "Generate 4-Step 후에 수정할 수 있습니다.");
  }
  if (draft.status === "sent") {
    throw new InternalApiError(400, "이미 발송된 step은 수정할 수 없습니다.");
  }
  if (draft.status === "sending") {
    throw new InternalApiError(
      409,
      "해당 step 메일이 발송 중입니다. 잠시 후 다시 시도해 주세요."
    );
  }

  const now = new Date().toISOString();
  const { error } = await (
    admin.from("candidate_outreach_message" as any) as any
  )
    .update({
      body,
      rendered_body: null,
      rendered_subject: null,
      status: "draft",
      subject,
      updated_at: now,
    })
    .eq("id", draft.id)
    .eq("user_id", args.userId)
    .eq("kind", "sequence");

  if (error) {
    throw new Error(error.message ?? "Failed to update sequence draft");
  }

  return fetchAtsCandidateDetail({
    candidId: args.candidId,
    userEmail: args.userEmail,
    userId: args.userId,
  });
}

export async function sendCandidateSequenceStep(args: {
  candidId: string;
  stepNumber: number;
  userEmail: string | null | undefined;
  userId: string;
}) {
  if (args.stepNumber < 1 || args.stepNumber > ATS_SEQUENCE_STEP_COUNT) {
    throw new InternalApiError(400, "잘못된 step 번호입니다.");
  }

  const admin = getSupabaseAdmin();
  const detail = await fetchAtsCandidateDetail({
    candidId: args.candidId,
    userEmail: args.userEmail,
    userId: args.userId,
  });
  const outreach = detail.candidate.outreach;
  if (!outreach) {
    throw new InternalApiError(400, "시퀀스 상태를 찾지 못했습니다.");
  }
  if (outreach.sequenceStatus === "paused") {
    throw new InternalApiError(
      400,
      "중단된 시퀀스입니다. 재개 후 발송해 주세요."
    );
  }

  const targetEmail = resolveTargetEmail({
    candidate: detail.candidate,
    outreach,
  });
  if (!targetEmail) {
    throw new InternalApiError(400, "대상 이메일이 없습니다.");
  }

  const draft = detail.messages.find(
    (message) =>
      message.kind === "sequence" && message.stepNumber === args.stepNumber
  );
  const sentStepNumbers = getSentStepNumbers(detail.messages);
  const nextRequiredStep = getNextSequenceStepFromSentSet(sentStepNumbers);
  if (!draft) {
    throw new InternalApiError(400, "먼저 시퀀스를 생성해 주세요.");
  }
  if (nextRequiredStep == null) {
    throw new InternalApiError(400, "이미 모든 step 발송이 완료되었습니다.");
  }
  if (args.stepNumber !== nextRequiredStep) {
    throw new InternalApiError(
      400,
      `현재 발송 가능한 step은 ${nextRequiredStep}번입니다.`
    );
  }

  const claim = await claimSequenceDraftMessage({
    admin,
    id: draft.id,
    userId: args.userId,
  });
  if (claim.outcome === "already_sent") {
    throw new InternalApiError(400, "이미 발송된 step입니다.");
  }
  if (claim.outcome === "already_sending") {
    throw new InternalApiError(409, "해당 step 메일이 이미 발송 중입니다.");
  }
  if (claim.outcome !== "claimed") {
    throw new InternalApiError(
      409,
      "메일 초안 상태가 변경되었습니다. 다시 시도해 주세요."
    );
  }

  const workspace = detail.workspace;
  const senderEmail = normalizeEmail(
    workspace.senderEmail ?? args.userEmail ?? ""
  );
  if (!isValidEmail(senderEmail)) {
    throw new InternalApiError(400, "유효한 발신자 이메일이 필요합니다.");
  }

  const variables = buildCandidateTemplateVariables(detail.candidate);
  const renderedSubject = replaceTemplateVariables(
    draft.subject,
    variables
  ).trim();
  const renderedBody = replaceTemplateVariables(draft.body, variables).trim();

  try {
    await sendInternalEmail({
      from: senderEmail,
      subject: renderedSubject,
      text: renderedBody,
      to: targetEmail,
    });
  } catch (error) {
    try {
      await restoreSequenceDraftMessage({
        admin,
        id: draft.id,
        userId: args.userId,
      });
    } catch (restoreError) {
      console.error(
        "[ats-sequence] failed to restore draft after send failure",
        {
          candidId: args.candidId,
          draftId: draft.id,
          error:
            restoreError instanceof Error
              ? restoreError.message
              : "unknown_restore_error",
        }
      );
    }
    throw error;
  }

  const now = new Date();
  const upcomingStep =
    args.stepNumber < ATS_SEQUENCE_STEP_COUNT ? args.stepNumber + 1 : null;
  const nextDueAt = upcomingStep
    ? computeDueAtFromSchedule({
        baseAt: now,
        schedule: getScheduleForStep(outreach.sequenceSchedule, upcomingStep),
      })
    : null;
  const nextSequenceStatus =
    args.stepNumber >= ATS_SEQUENCE_STEP_COUNT ? "completed" : "active";
  const historyItem = {
    channel: "email",
    contactedAt: now.toISOString(),
    createdAt: now.toISOString(),
    id: crypto.randomUUID(),
    note: `Step ${args.stepNumber} sequence sent`,
    source: "sequence",
  } satisfies AtsContactHistoryItem;

  const { data: sentMessageRows, error: messageError } = await (
    admin.from("candidate_outreach_message" as any) as any
  )
    .update({
      rendered_body: renderedBody,
      rendered_subject: renderedSubject,
      sent_at: now.toISOString(),
      status: "sent",
      to_email: targetEmail,
      updated_at: now.toISOString(),
    })
    .eq("id", draft.id)
    .eq("status", "sending")
    .select(MESSAGE_SELECT);

  if (messageError) {
    throw new Error(messageError.message ?? "Failed to update sent sequence");
  }
  if (!coerceJsonArray<any>(sentMessageRows)[0]) {
    throw new Error("Failed to finalize sent sequence");
  }

  await updateOutreachRecord({
    admin,
    candidId: args.candidId,
    patch: {
      active_step: Math.max(outreach.activeStep, args.stepNumber),
      last_sent_at: now.toISOString(),
      next_due_at: nextDueAt,
      sequence_status: nextSequenceStatus,
      stopped_at: null,
      target_email: targetEmail,
      history: [...outreach.history, historyItem],
    },
    userId: args.userId,
  });

  return fetchAtsCandidateDetail({
    candidId: args.candidId,
    userEmail: args.userEmail,
    userId: args.userId,
  });
}

export async function runAtsSequenceSweep(args?: { limit?: number }) {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const limit = Math.min(100, Math.max(1, Number(args?.limit ?? 25) || 25));
  const dueRows = await fetchDueSequenceOutreachRows({
    admin,
    limit,
    nowIso,
  });
  const sequenceDraftPairKeys = await fetchSequenceDraftPairKeys({
    admin,
    rows: dueRows,
  });
  const eligibleRows = dueRows.filter((row) =>
    sequenceDraftPairKeys.has(getOutreachPairKey(row.userId, row.candidId))
  );
  const userEmailById = await fetchCompanyUserEmailMap(
    admin,
    Array.from(new Set(eligibleRows.map((row) => row.userId)))
  );
  const results: Array<{
    candidId: string;
    message?: string;
    status: "failed" | "sent" | "skipped";
    stepNumber: number | null;
    userId: string;
  }> = [];

  let failed = 0;
  let sent = 0;
  let skipped = 0;

  for (const row of dueRows) {
    if (
      !sequenceDraftPairKeys.has(getOutreachPairKey(row.userId, row.candidId))
    ) {
      skipped += 1;
      results.push({
        candidId: row.candidId,
        message: "Sequence drafts are not generated yet",
        status: "skipped",
        stepNumber: null,
        userId: row.userId,
      });
      continue;
    }

    const nextStep = getNextOutreachStep(row.activeStep);

    if (!nextStep) {
      await updateOutreachRecord({
        admin,
        candidId: row.candidId,
        patch: {
          next_due_at: null,
          sequence_status: "completed",
          stopped_at: null,
        },
        userId: row.userId,
      });
      skipped += 1;
      results.push({
        candidId: row.candidId,
        message: "Sequence already completed",
        status: "skipped",
        stepNumber: null,
        userId: row.userId,
      });
      continue;
    }

    try {
      await sendCandidateSequenceStep({
        candidId: row.candidId,
        stepNumber: nextStep,
        userEmail: userEmailById.get(row.userId) ?? null,
        userId: row.userId,
      });
      sent += 1;
      results.push({
        candidId: row.candidId,
        status: "sent",
        stepNumber: nextStep,
        userId: row.userId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send ATS sequence";
      const isSkippable =
        error instanceof InternalApiError &&
        (error.status === 409 ||
          message.includes("중단된 시퀀스") ||
          message.includes("이미 모든 step") ||
          message.includes("현재 발송 가능한 step은") ||
          message.includes("이미 발송된 step"));

      if (isSkippable) {
        skipped += 1;
        results.push({
          candidId: row.candidId,
          message,
          status: "skipped",
          stepNumber: nextStep,
          userId: row.userId,
        });
      } else {
        failed += 1;
        results.push({
          candidId: row.candidId,
          message,
          status: "failed",
          stepNumber: nextStep,
          userId: row.userId,
        });
      }
    }
  }

  return {
    failed,
    limit,
    nowIso,
    scanned: dueRows.length,
    eligible: eligibleRows.length,
    sent,
    skipped,
    results,
  };
}

export async function sendBulkAtsManualEmails(args: {
  body: string;
  candidIds: string[];
  senderEmail?: string | null;
  subject: string;
  userEmail: string | null | undefined;
  userId: string;
}) {
  const candidIds = Array.from(
    new Set(args.candidIds.map((id) => id.trim()).filter(Boolean))
  );
  if (candidIds.length === 0) {
    throw new InternalApiError(400, "후보자를 먼저 선택해 주세요.");
  }
  if (!args.subject.trim() || !args.body.trim()) {
    throw new InternalApiError(400, "제목과 본문을 입력해 주세요.");
  }

  const admin = getSupabaseAdmin();
  const workspaceRow = await fetchWorkspaceRow(admin, args.userId);
  const senderEmail = normalizeEmail(
    args.senderEmail ?? workspaceRow?.sender_email ?? args.userEmail ?? ""
  );
  if (!isValidEmail(senderEmail)) {
    throw new InternalApiError(400, "유효한 발신자 이메일이 필요합니다.");
  }
  const [outreachByCandidateId, shortlistMemoByCandidateId] = await Promise.all(
    [
      fetchOutreachRecordsByCandidateIds({
        admin,
        candidIds,
        userId: args.userId,
      }),
      fetchShortlistMemoMap(admin, args.userId, candidIds),
    ]
  );
  const sentStepNumbersByCandidateId = await fetchSentStepNumbersByCandidateIds(
    {
      admin,
      candidIds,
      userId: args.userId,
    }
  );

  const candidateSummaries = await fetchCandidateSummariesByIds({
    admin,
    candidIds,
    outreachByCandidateId,
    shortlistMemoByCandidateId,
  });
  const candidateById = new Map(
    candidateSummaries.map((candidate) => [candidate.id, candidate] as const)
  );

  const sent: string[] = [];
  const skipped: Array<{ candidId: string; reason: string }> = [];

  for (const candidId of candidIds) {
    const candidate = candidateById.get(candidId);
    if (!candidate) {
      skipped.push({ candidId, reason: "candidate_not_found" });
      continue;
    }

    const outreach =
      outreachByCandidateId.get(candidId) ??
      (await ensureOutreachRecord({
        admin,
        candidId,
        userId: args.userId,
      }));
    const targetEmail = resolveTargetEmail({ candidate, outreach });
    if (!targetEmail) {
      skipped.push({ candidId, reason: "missing_email" });
      continue;
    }
    const nextStep =
      getNextSequenceStepFromSentSet(
        sentStepNumbersByCandidateId.get(candidId) ?? new Set()
      ) ?? getNextOutreachStep(outreach.activeStep);
    if (!nextStep) {
      skipped.push({ candidId, reason: "sequence_completed" });
      continue;
    }

    const variables = buildCandidateTemplateVariables(candidate);
    const renderedSubject = replaceTemplateVariables(
      args.subject,
      variables
    ).trim();
    const renderedBody = replaceTemplateVariables(args.body, variables).trim();

    await sendInternalEmail({
      from: senderEmail,
      subject: renderedSubject,
      text: renderedBody,
      to: targetEmail,
    });

    const now = new Date();
    const { error: insertError } = await (
      admin.from("candidate_outreach_message" as any) as any
    ).insert({
      body: args.body,
      candid_id: candidId,
      created_at: now.toISOString(),
      created_by: senderEmail,
      kind: "manual",
      outreach_id: outreach.id,
      rendered_body: renderedBody,
      rendered_subject: renderedSubject,
      sent_at: now.toISOString(),
      status: "sent",
      step_number: nextStep,
      subject: args.subject,
      to_email: targetEmail,
      updated_at: now.toISOString(),
      user_id: args.userId,
    });

    if (insertError) {
      throw new Error(insertError.message ?? "Failed to log manual email");
    }

    await updateOutreachRecord({
      admin,
      candidId,
      patch: {
        active_step: nextStep,
        history: [
          ...outreach.history,
          {
            channel: "email",
            contactedAt: now.toISOString(),
            createdAt: now.toISOString(),
            id: crypto.randomUUID(),
            note: `Manual outreach sent as step ${nextStep}`,
            source: "bulk_manual",
          } satisfies AtsContactHistoryItem,
        ],
        last_sent_at: now.toISOString(),
        next_due_at:
          nextStep < ATS_SEQUENCE_STEP_COUNT
            ? computeDueAtFromSchedule({
                baseAt: now,
                schedule: getScheduleForStep(
                  outreach.sequenceSchedule,
                  nextStep + 1
                ),
              })
            : null,
        sequence_status:
          nextStep >= ATS_SEQUENCE_STEP_COUNT ? "completed" : "active",
        stopped_at: null,
        target_email: targetEmail,
      },
      userId: args.userId,
    });

    sent.push(candidId);
  }

  return { sent, skipped };
}
