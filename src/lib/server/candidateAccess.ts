import { createClient, type User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { getRequestUser } from "@/lib/supabaseServer";
import type { CandidateMarkStatus } from "@/lib/candidateMark";
import type { SearchSource } from "@/lib/searchSource";
import {
  buildEvidenceMap,
  buildRankMap,
  filterPositiveScoreCandidates,
  type RunPageCandidate,
} from "@/lib/searchEvidence";
import {
  buildMaskedSourceLinks,
  getRevealLogoColor,
  maskFullValue,
  maskWithFirstCharacter,
} from "@/lib/profileReveal";

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server misconfigured: missing Supabase admin credentials");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireAuthenticatedUser(
  req: NextRequest
): Promise<User> {
  const user = await getRequestUser(req);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function fetchRevealMapForUser(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  ids: string[]
) {
  const revealMap = new Map<string, boolean>();

  if (!userId || ids.length === 0) {
    return revealMap;
  }

  const { data, error } = await (
    supabaseAdmin.from("unlock_profile" as any) as any
  )
    .select("candid_id")
    .eq("company_user_id", userId)
    .in("candid_id", ids);

  if (error) throw error;

  for (const row of data ?? []) {
    const candidId = String(row?.candid_id ?? "").trim();
    if (!candidId) continue;
    revealMap.set(candidId, true);
  }

  return revealMap;
}

export async function fetchCandidateMarkMapForUser(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  ids: string[]
) {
  const markMap = new Map<string, any>();

  if (!userId || ids.length === 0) {
    return markMap;
  }

  const { data, error } = await (
    supabaseAdmin.from("candidate_mark" as any) as any
  )
    .select("candid_id, status, created_at, updated_at")
    .eq("user_id", userId)
    .in("candid_id", ids);

  if (error) throw error;

  for (const row of data ?? []) {
    const candidId = String(row?.candid_id ?? "").trim();
    if (!candidId) continue;

    markMap.set(candidId, {
      candidId,
      status: row?.status ?? null,
      createdAt: row?.created_at ?? null,
      updatedAt: row?.updated_at ?? row?.created_at ?? null,
    });
  }

  return markMap;
}

export async function fetchShortlistMemoMapForUser(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  ids: string[]
) {
  const memoMap = new Map<string, string>();

  if (!userId || ids.length === 0) {
    return memoMap;
  }

  const { data, error } = await (
    supabaseAdmin.from("shortlist_memo" as any) as any
  )
    .select("candid_id, memo")
    .eq("user_id", userId)
    .in("candid_id", ids);

  if (error) throw error;

  for (const row of data ?? []) {
    const candidId = String(row?.candid_id ?? "").trim();
    if (!candidId) continue;
    memoMap.set(candidId, String(row?.memo ?? ""));
  }

  return memoMap;
}

export async function fetchCandidateIdsByMarkStatusesForUser(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  statuses: CandidateMarkStatus[]
) {
  const ids = new Set<string>();

  if (!userId || statuses.length === 0) {
    return ids;
  }

  const { data, error } = await (
    supabaseAdmin.from("candidate_mark" as any) as any
  )
    .select("candid_id, status")
    .eq("user_id", userId)
    .in("status", statuses);

  if (error) throw error;

  for (const row of data ?? []) {
    const candidId = String(row?.candid_id ?? "").trim();
    if (!candidId) continue;
    ids.add(candidId);
  }

  return ids;
}

export async function fetchScholarPreviewByCandidateIds(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  ids: string[]
) {
  const previewByCandidateId = new Map<string, any>();

  if (ids.length === 0) {
    return previewByCandidateId;
  }

  const { data: profiles, error: profileError } = await (
    supabaseAdmin.from("scholar_profile" as any) as any
  )
    .select("id, candid_id, affiliation, topics, h_index, total_citations_num")
    .in("candid_id", ids);

  if (profileError) throw profileError;

  const profileRows = Array.isArray(profiles) ? profiles : [];
  if (profileRows.length === 0) {
    return previewByCandidateId;
  }

  const profileIds = profileRows.map((row) => row.id);
  const { data: contributions, error: contributionError } = await (
    supabaseAdmin.from("scholar_contributions" as any) as any
  )
    .select("scholar_profile_id")
    .in("scholar_profile_id", profileIds);

  if (contributionError) throw contributionError;

  const paperCountByProfileId = new Map<string, number>();
  for (const row of contributions ?? []) {
    const profileId = String((row as any)?.scholar_profile_id ?? "");
    if (!profileId) continue;
    paperCountByProfileId.set(
      profileId,
      (paperCountByProfileId.get(profileId) ?? 0) + 1
    );
  }

  for (const row of profileRows) {
    if (!row?.candid_id) continue;
    previewByCandidateId.set(row.candid_id, {
      scholarProfileId: row.id,
      affiliation: row.affiliation,
      topics: row.topics,
      hIndex: row.h_index,
      paperCount: paperCountByProfileId.get(row.id) ?? 0,
      citationCount: row.total_citations_num ?? 0,
    });
  }

  return previewByCandidateId;
}

export async function fetchGithubPreviewByCandidateIds(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  ids: string[]
) {
  const previewByCandidateId = new Map<string, any>();

  if (ids.length === 0) {
    return previewByCandidateId;
  }

  const { data: profiles, error: profileError } = await (
    supabaseAdmin.from("github_profile" as any) as any
  )
    .select("id, candid_id, name, company, location, followers, public_repos")
    .in("candid_id", ids);

  if (profileError) throw profileError;

  const profileRows = Array.isArray(profiles) ? profiles : [];
  if (profileRows.length === 0) {
    return previewByCandidateId;
  }

  const profileIds = profileRows.map((row) => row.id);
  const { data: contributions, error: contributionError } = await (
    supabaseAdmin.from("github_repo_contribution" as any) as any
  )
    .select("github_profile_id, repo_id")
    .in("github_profile_id", profileIds);

  if (contributionError) throw contributionError;

  const repoIds = (contributions ?? [])
    .map((row: any) => String(row?.repo_id ?? "").trim())
    .filter(Boolean);

  const { data: repos, error: repoError } = await (
    supabaseAdmin.from("github_repo" as any) as any
  )
    .select("id, language, stars")
    .in("id", repoIds);

  if (repoError) throw repoError;

  const repoMap = new Map<string, any>(
    (repos ?? []).map((repo: any) => [String(repo.id), repo] as const)
  );
  const profileData = new Map<
    string,
    { topLanguages: Set<string>; topRepoStars: number }
  >();

  for (const contribution of contributions ?? []) {
    const profileId = String((contribution as any)?.github_profile_id ?? "");
    const repoId = String((contribution as any)?.repo_id ?? "");
    if (!profileId || !repoId) continue;

    const repo = repoMap.get(repoId) as any;
    if (!repo) continue;

    const current = profileData.get(profileId) ?? {
      topLanguages: new Set<string>(),
      topRepoStars: 0,
    };

    if (repo.language) {
      current.topLanguages.add(String(repo.language));
    }
    current.topRepoStars = Math.max(current.topRepoStars, repo.stars ?? 0);
    profileData.set(profileId, current);
  }

  for (const row of profileRows) {
    if (!row?.candid_id) continue;
    const current = profileData.get(row.id);
    previewByCandidateId.set(row.candid_id, {
      name: row.name,
      company: row.company,
      location: row.location,
      followers: row.followers ?? 0,
      publicRepos: row.public_repos ?? 0,
      topLanguages: current ? Array.from(current.topLanguages).slice(0, 5) : [],
      topRepoStars: current?.topRepoStars ?? 0,
    });
  }

  return previewByCandidateId;
}

export async function fetchBaseCandidatesByIds(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  ids: string[];
  userId: string;
  runId?: string;
}) {
  const { supabaseAdmin, ids, userId, runId } = params;
  const shouldIncludeSynthesizedSummary = Boolean(runId);

  if (ids.length === 0) {
    return [];
  }

  const selectFields = `
        id,
        headline,
        bio,
        linkedin_url,
        links,
        location,
        name,
        profile_picture,
        summary,
        edu_user (
          candid_id,
          school,
          degree,
          field,
          start_date,
          end_date,
          url
        ),
        experience_user (
          candid_id,
          role,
          description,
          months,
          start_date,
          end_date,
          company_id,
          company_db (
            name,
            logo,
            linkedin_url,
            investors,
            short_description,
            location
          )
        ),
        connection (
          user_id,
          typed,
          text
        ),
        s:summary (
          text
        )${
          shouldIncludeSynthesizedSummary
            ? `,
        synthesized_summary (
          text,
          run_id
        )`
            : ""
        }
      `;

  let query = (supabaseAdmin.from("candid" as any) as any)
    .select(selectFields)
    .in("id", ids)
    .eq("connection.user_id", userId);

  if (shouldIncludeSynthesizedSummary) {
    query = query.eq("synthesized_summary.run_id", runId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const normalizedCandidates = (data ?? []).map((candidate: any) => ({
    ...candidate,
    edu_user: Array.isArray(candidate?.edu_user)
      ? candidate.edu_user.map((education: any) => ({
          ...education,
          field_of_study: education?.field_of_study ?? education?.field ?? null,
        }))
      : [],
  }));

  const byId = new Map(
    normalizedCandidates.map((candidate: any) => [candidate.id, candidate])
  );
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function loadRunPageCandidateWindow(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  runId: string;
  pageIdx: number;
  userId: string;
  excludedMarkStatuses?: CandidateMarkStatus[];
  excludeUnopenedProfiles?: boolean;
}) {
  const {
    supabaseAdmin,
    runId,
    pageIdx,
    userId,
    excludedMarkStatuses = [],
    excludeUnopenedProfiles = false,
  } = params;

  const { data, error } = await (supabaseAdmin.from("runs_pages" as any) as any)
    .select("candidate_ids, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  const row = data?.[0];
  const all = filterPositiveScoreCandidates(
    (row?.candidate_ids ?? []) as RunPageCandidate[]
  );
  const excludedCandidateIds =
    excludedMarkStatuses.length > 0
      ? await fetchCandidateIdsByMarkStatusesForUser(
          supabaseAdmin,
          userId,
          excludedMarkStatuses
        )
      : new Set<string>();
  let visibleCandidates =
    excludedCandidateIds.size > 0
      ? all.filter(
          (candidate) => !excludedCandidateIds.has(String(candidate.id))
        )
      : all;

  if (excludeUnopenedProfiles) {
    const candidateIds = visibleCandidates
      .map((candidate) => String(candidate.id ?? "").trim())
      .filter(Boolean);
    const revealMap = await fetchRevealMapForUser(
      supabaseAdmin,
      userId,
      candidateIds
    );

    visibleCandidates = visibleCandidates.filter(
      (candidate) => revealMap.get(String(candidate.id ?? "").trim()) === true
    );
  }

  const start = pageIdx * 10;
  const end = start + 10;
  const ids = visibleCandidates
    .slice(start, end)
    .map((candidate) => candidate.id)
    .filter(Boolean) as string[];

  return {
    ids,
    total: visibleCandidates.length,
    evidenceByCandidateId: buildEvidenceMap(visibleCandidates),
    rankByCandidateId: buildRankMap(visibleCandidates),
  };
}

function maskExperienceEntry(entry: any, options?: { keepRole?: boolean }) {
  return {
    ...entry,
    company_id: null,
    role: options?.keepRole
      ? (entry?.role ?? "")
      : maskWithFirstCharacter(entry?.role),
    description: "",
    months: null,
    start_date: "",
    end_date: "",
    company_db: entry?.company_db
      ? {
          ...entry.company_db,
          name: maskWithFirstCharacter(entry.company_db?.name),
          logo: entry.company_db?.logo ?? null,
          linkedin_url: "",
          short_description: "",
          location: "",
        }
      : null,
  };
}

function maskEducationEntry(entry: any) {
  return {
    ...entry,
    school: maskWithFirstCharacter(entry?.school),
    degree: maskWithFirstCharacter(entry?.degree),
    field: maskWithFirstCharacter(entry?.field),
    field_of_study: maskWithFirstCharacter(entry?.field_of_study),
    start_date: "",
    end_date: "",
    url: entry?.url ?? "",
  };
}

function maskScholarPreview(preview: any) {
  if (!preview) return null;
  return {
    ...preview,
    affiliation: maskWithFirstCharacter(preview.affiliation),
    topics: maskFullValue(),
  };
}

function maskGithubPreview(preview: any) {
  if (!preview) return null;
  return {
    ...preview,
    name: maskWithFirstCharacter(preview.name),
    company: maskWithFirstCharacter(preview.company),
    location: preview.location ?? "",
  };
}

function maskSearchEvidence(evidence: any) {
  if (!evidence || evidence.type !== "paper") return evidence ?? null;
  return {
    ...evidence,
    paper: evidence.paper
      ? {
          ...evidence.paper,
          paper_id: null,
          title: maskFullValue(),
        }
      : null,
  };
}

export function applyListRevealState(candidate: any, isRevealed: boolean) {
  if (isRevealed) {
    return {
      ...candidate,
      profile_revealed: true,
    };
  }

  const experiences = Array.isArray(candidate?.experience_user)
    ? candidate.experience_user
    : [];
  const educations = Array.isArray(candidate?.edu_user)
    ? candidate.edu_user
    : [];

  return {
    ...candidate,
    profile_revealed: false,
    name: maskWithFirstCharacter(candidate?.name),
    headline: maskWithFirstCharacter(candidate?.headline),
    bio: "",
    linkedin_url: "",
    location: candidate?.location ?? "",
    links: buildMaskedSourceLinks(candidate?.links),
    experience_user:
      experiences.length > 0 ? [maskExperienceEntry(experiences[0])] : [],
    edu_user: educations.length > 0 ? [maskEducationEntry(educations[0])] : [],
    scholar_profile_preview: maskScholarPreview(
      candidate?.scholar_profile_preview
    ),
    github_profile_preview: maskGithubPreview(
      candidate?.github_profile_preview
    ),
    search_evidence: maskSearchEvidence(candidate?.search_evidence),
  };
}

export function applyDetailRevealState(candidate: any, isRevealed: boolean) {
  if (isRevealed) {
    return {
      ...candidate,
      profile_revealed: true,
      masked_experience_count: 0,
    };
  }

  const experiences = Array.isArray(candidate?.experience_user)
    ? candidate.experience_user
    : [];
  const publications = Array.isArray(candidate?.publications)
    ? candidate.publications
    : [];
  const scholarPapers = Array.isArray(candidate?.scholar_papers)
    ? candidate.scholar_papers
    : [];

  const latestExperience = experiences[0]
    ? maskExperienceEntry(experiences[0], { keepRole: true })
    : null;

  return {
    ...candidate,
    profile_revealed: false,
    name: maskWithFirstCharacter(candidate?.name),
    headline: maskWithFirstCharacter(candidate?.headline),
    email: Array.isArray(candidate?.email) ? [] : "[]",
    linkedin_url: "",
    location: candidate?.location ?? "",
    bio: "",
    summary: Array.isArray(candidate?.summary) ? [] : "",
    links: buildMaskedSourceLinks(candidate?.links),
    s: [],
    oneline: "",
    experience_user: latestExperience ? [latestExperience] : [],
    masked_experience_count: Math.max(0, experiences.length - 1),
    edu_user: [],
    extra_experience: [],
    github_profile: null,
    github_repo_contribution: [],
    publications: publications.map((publication: any) => ({
      ...publication,
      title: maskFullValue(),
      link: null,
      paper_id: null,
    })),
    scholar_profile: candidate?.scholar_profile
      ? {
          ...candidate.scholar_profile,
          affiliation: maskFullValue(),
          topics: maskFullValue(),
          scholar_url: null,
          homepage_link: null,
        }
      : null,
    scholar_papers: scholarPapers.map((paper: any) => ({
      ...paper,
      title: maskFullValue(),
      external_link: null,
      scholar_link: null,
    })),
  };
}

export function createRevealLogoStyle(seed: string) {
  return {
    backgroundColor: getRevealLogoColor(seed),
  };
}
