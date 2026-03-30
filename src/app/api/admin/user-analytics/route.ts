import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword } from "@/lib/admin";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function sanitizeSearchQuery(value: string) {
  return value.replace(/[,%()]/g, " ").trim();
}

function getAdminPassword(req: NextRequest) {
  return (
    req.headers.get("x-admin-password") ??
    req.headers.get("X-Admin-Password") ??
    ""
  );
}

function mapUser(row: any) {
  return {
    userId: String(row?.user_id ?? ""),
    name: row?.name ?? null,
    email: row?.email ?? null,
    company: row?.company ?? null,
  };
}

function incrementCount(
  map: Map<string, number>,
  key: string,
  amount = 1
) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function parseProfileViewCandidateId(type: unknown) {
  const value = String(type ?? "").trim();
  const candidateCardPrefix = "candidate_card_click:";
  if (value.startsWith(candidateCardPrefix)) {
    const candidId = value.slice(candidateCardPrefix.length).trim();
    return candidId || null;
  }

  const profileViewPrefix = "profile_view:";
  if (value.startsWith(profileViewPrefix)) {
    const candidId = value.slice(profileViewPrefix.length).trim();
    return candidId || null;
  }

  return null;
}

function parseLinkClickEvent(type: unknown) {
  const value = String(type ?? "").trim();
  const prefix = "profile_link_click:";
  if (!value.startsWith(prefix)) return null;

  const rest = value.slice(prefix.length);
  const separatorIndex = rest.indexOf(":");
  if (separatorIndex === -1) return null;

  const candidId = rest.slice(0, separatorIndex).trim();
  const host = rest.slice(separatorIndex + 1).trim() || "unknown";
  if (!candidId) return null;

  return { candidId, host };
}

function normalizePageViewCount(seenPage: unknown) {
  const value = Number(seenPage);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value) + 1;
}

async function loadSearchCountsByUserIds(userIds: string[]) {
  const counts = new Map<string, number>();
  if (userIds.length === 0) return counts;

  const { data, error } = await supabaseServer
    .from("queries")
    .select("user_id")
    .in("user_id", userIds)
    .eq("is_deleted", false);

  if (error) {
    throw new Error(error.message ?? "Failed to load search counts");
  }

  for (const row of data ?? []) {
    const userId = String(row?.user_id ?? "").trim();
    incrementCount(counts, userId);
  }

  return counts;
}

async function loadLogCountsByUserIds(userIds: string[], pattern: string) {
  const counts = new Map<string, number>();
  if (userIds.length === 0) return counts;

  const { data, error } = await supabaseServer
    .from("logs")
    .select("user_id, type")
    .in("user_id", userIds)
    .like("type", pattern);

  if (error) {
    throw new Error(error.message ?? "Failed to load log counts");
  }

  for (const row of data ?? []) {
    const userId = String(row?.user_id ?? "").trim();
    if (!userId) continue;
    incrementCount(counts, userId);
  }

  return counts;
}

async function loadUniqueProfileCountsByUserIds(userIds: string[]) {
  const counts = new Map<string, number>();
  if (userIds.length === 0) return counts;

  const { data, error } = await supabaseServer
    .from("logs")
    .select("user_id, type")
    .in("user_id", userIds)
    .like("type", "candidate_card_click:%");

  if (error) {
    throw new Error(error.message ?? "Failed to load unique profile counts");
  }

  const seenCandidateIdsByUserId = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const userId = String(row?.user_id ?? "").trim();
    if (!userId) continue;

    const candidId = parseProfileViewCandidateId(row?.type);
    if (!candidId) continue;

    const seen = seenCandidateIdsByUserId.get(userId) ?? new Set<string>();
    seen.add(candidId);
    seenCandidateIdsByUserId.set(userId, seen);
  }

  for (const [currentUserId, seen] of Array.from(
    seenCandidateIdsByUserId.entries()
  )) {
    counts.set(currentUserId, seen.size);
  }

  return counts;
}

export async function GET(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
        { status: 500 }
      );
    }

    if (!isValidAdminPassword(getAdminPassword(req))) {
      return unauthorized();
    }

    const searchParams = req.nextUrl.searchParams;
    const query = sanitizeSearchQuery(String(searchParams.get("query") ?? ""));
    const userId = String(searchParams.get("userId") ?? "").trim();

    if (userId) {
      const { data: user, error: userError } = await supabaseServer
        .from("company_users")
        .select("user_id, name, email, company")
        .eq("user_id", userId)
        .maybeSingle();

      if (userError) {
        return NextResponse.json(
          { error: userError.message },
          { status: 500 }
        );
      }

      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const [
        { data: queries, error: queryError },
        { data: profileViewLogs, error: profileViewError },
        { data: linkClickLogs, error: linkClickError },
      ] = await Promise.all([
        supabaseServer
          .from("queries")
          .select("query_id")
          .eq("user_id", userId)
          .eq("is_deleted", false),
        supabaseServer
          .from("logs")
          .select("type, created_at")
          .eq("user_id", userId)
          .like("type", "candidate_card_click:%"),
        supabaseServer
          .from("logs")
          .select("type, created_at")
          .eq("user_id", userId)
          .like("type", "profile_link_click:%"),
      ]);

      if (queryError) {
        return NextResponse.json(
          { error: queryError.message },
          { status: 500 }
        );
      }

      if (profileViewError) {
        return NextResponse.json(
          { error: profileViewError.message },
          { status: 500 }
        );
      }

      if (linkClickError) {
        return NextResponse.json(
          { error: linkClickError.message },
          { status: 500 }
        );
      }

      const queryIds = (queries ?? [])
        .map((row) => String(row?.query_id ?? "").trim())
        .filter(Boolean);

      const { data: runs, error: runsError } =
        queryIds.length > 0
          ? await supabaseServer
              .from("runs")
              .select("id")
              .eq("user_id", userId)
              .in("query_id", queryIds)
          : { data: [], error: null };

      if (runsError) {
        return NextResponse.json(
          { error: runsError.message },
          { status: 500 }
        );
      }

      const runIds = (runs ?? [])
        .map((row) => String(row?.id ?? "").trim())
        .filter(Boolean);

      const { data: runPages, error: runPagesError } =
        runIds.length > 0
          ? await supabaseServer
              .from("runs_pages")
              .select("run_id, seen_page, created_at")
              .in("run_id", runIds)
          : { data: [], error: null };

      if (runPagesError) {
        return NextResponse.json(
          { error: runPagesError.message },
          { status: 500 }
        );
      }

      const latestRunPageByRunId = new Map<
        string,
        { created_at: string; seen_page: number | null }
      >();
      for (const row of runPages ?? []) {
        const runId = String(row?.run_id ?? "").trim();
        if (!runId) continue;

        const existing = latestRunPageByRunId.get(runId);
        if (!existing || String(row?.created_at ?? "") > existing.created_at) {
          latestRunPageByRunId.set(runId, {
            created_at: String(row?.created_at ?? ""),
            seen_page:
              typeof row?.seen_page === "number" ? row.seen_page : null,
          });
        }
      }

      const profileViewCountByCandidateId = new Map<string, number>();
      for (const row of profileViewLogs ?? []) {
        const candidId = parseProfileViewCandidateId(row?.type);
        if (!candidId) continue;
        incrementCount(profileViewCountByCandidateId, candidId);
      }

      const linkClickCountByCandidateId = new Map<string, number>();
      const linkClicksByCandidateId = new Map<string, Map<string, number>>();
      for (const row of linkClickLogs ?? []) {
        const parsed = parseLinkClickEvent(row?.type);
        if (!parsed) continue;

        incrementCount(linkClickCountByCandidateId, parsed.candidId);
        const hostCounts =
          linkClicksByCandidateId.get(parsed.candidId) ?? new Map<string, number>();
        incrementCount(hostCounts, parsed.host);
        linkClicksByCandidateId.set(parsed.candidId, hostCounts);
      }

      const candidateIds = Array.from(
        new Set(
          Array.from(profileViewCountByCandidateId.keys()).concat(
            Array.from(linkClickCountByCandidateId.keys())
          )
        )
      );

      const { data: candidates, error: candidatesError } =
        candidateIds.length > 0
          ? await supabaseServer
              .from("candid")
              .select("id, name, headline, linkedin_url")
              .in("id", candidateIds)
          : { data: [], error: null };

      if (candidatesError) {
        return NextResponse.json(
          { error: candidatesError.message },
          { status: 500 }
        );
      }

      const candidateById = new Map<string, any>();
      for (const candidate of candidates ?? []) {
        const candidId = String(candidate?.id ?? "").trim();
        if (!candidId) continue;
        candidateById.set(candidId, candidate);
      }

      const pageViewCount = Array.from(latestRunPageByRunId.values()).reduce(
        (sum, row) => sum + normalizePageViewCount(row.seen_page),
        0
      );
      const profileViewCount = Array.from(
        profileViewCountByCandidateId.values()
      ).reduce((sum, count) => sum + count, 0);
      const linkClickCount = Array.from(linkClickCountByCandidateId.values())
        .reduce((sum, count) => sum + count, 0);
      const searchCount = queryIds.length;

      const profiles = candidateIds
        .map((candidId) => {
          const candidate = candidateById.get(candidId) ?? null;
          const linkClicksMap =
            linkClicksByCandidateId.get(candidId) ?? new Map<string, number>();

          return {
            candidId,
            name: candidate?.name ?? null,
            headline: candidate?.headline ?? null,
            linkedinUrl: candidate?.linkedin_url ?? null,
            profileHref: `/my/p/${candidId}`,
            profileViewCount: profileViewCountByCandidateId.get(candidId) ?? 0,
            totalLinkClickCount:
              linkClickCountByCandidateId.get(candidId) ?? 0,
            linkClicks: Array.from(linkClicksMap.entries())
              .map(([host, count]) => ({ host, count }))
              .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.host.localeCompare(b.host);
              }),
          };
        })
        .sort((a, b) => {
          if (b.profileViewCount !== a.profileViewCount) {
            return b.profileViewCount - a.profileViewCount;
          }
          if (b.totalLinkClickCount !== a.totalLinkClickCount) {
            return b.totalLinkClickCount - a.totalLinkClickCount;
          }
          return a.candidId.localeCompare(b.candidId);
        });

      return NextResponse.json({
        user: mapUser(user),
        summary: {
          searchCount,
          runCount: runIds.length,
          pageViewCount,
          profileViewCount,
          linkClickCount,
          uniqueProfilesViewed: profileViewCountByCandidateId.size,
          pageViewsPerSearch:
            searchCount > 0 ? pageViewCount / searchCount : 0,
          profileViewsPerSearch:
            searchCount > 0 ? profileViewCount / searchCount : 0,
        },
        profiles,
      });
    }

    if (!query) {
      return NextResponse.json({ users: [] });
    }

    const { data: users, error: usersError } = await supabaseServer
      .from("company_users")
      .select("user_id, name, email, company")
      .or(
        `name.ilike.%${query}%,email.ilike.%${query}%,company.ilike.%${query}%`
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const userIds = (users ?? [])
      .map((row) => String(row?.user_id ?? "").trim())
      .filter(Boolean);

    const [
      searchCountByUserId,
      profileViewCountByUserId,
      linkClickCountByUserId,
    ] = await Promise.all([
      loadSearchCountsByUserIds(userIds),
      loadUniqueProfileCountsByUserIds(userIds),
      loadLogCountsByUserIds(userIds, "profile_link_click:%"),
    ]);

    return NextResponse.json({
      users: (users ?? []).map((row) => {
        const currentUserId = String(row?.user_id ?? "").trim();
        return {
          ...mapUser(row),
          searchCount: searchCountByUserId.get(currentUserId) ?? 0,
          profileViewCount: profileViewCountByUserId.get(currentUserId) ?? 0,
          linkClickCount: linkClickCountByUserId.get(currentUserId) ?? 0,
        };
      }),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
