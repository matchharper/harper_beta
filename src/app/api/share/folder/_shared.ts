import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export type FolderShareRow = {
  id: string;
  folder_id: number;
  created_by: string;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Server misconfigured: missing Supabase admin credentials");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function makeFolderShareToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export function getBaseUrl(req: Request) {
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    url.host;
  return `${proto}://${host}`;
}

export function getFolderShareState(share: FolderShareRow | null) {
  if (!share) return "missing";
  if (share.revoked_at) return "revoked";
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return "expired";
  }
  return "active";
}

export async function loadFolderShareByToken(token: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await ((supabaseAdmin.from(
    "bookmark_folder_share" as any
  ) as any)
    .select("id, folder_id, created_by, token, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle());

  if (error) throw error;

  return (data ?? null) as FolderShareRow | null;
}

export async function fetchScholarPreviewByCandidateIds(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  ids: string[]
) {
  if (ids.length === 0) {
    return new Map<string, any>();
  }

  const { data: profiles, error: profileError } = await ((supabaseAdmin.from(
    "scholar_profile" as any
  ) as any)
    .select("id, candid_id, affiliation, topics, h_index, total_citations_num")
    .in("candid_id", ids));

  if (profileError) throw profileError;

  const profileRows = Array.isArray(profiles) ? profiles : [];
  if (profileRows.length === 0) {
    return new Map<string, any>();
  }

  const profileIds = profileRows.map((row) => row.id);
  const { data: contributions, error: contributionError } = await (
    (supabaseAdmin.from("scholar_contributions" as any) as any)
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

  return new Map(
    profileRows
      .filter((row) => Boolean(row.candid_id))
      .map((row) => [
        row.candid_id as string,
        {
          scholarProfileId: row.id,
          affiliation: row.affiliation,
          topics: row.topics,
          hIndex: row.h_index,
          paperCount: paperCountByProfileId.get(row.id) ?? 0,
          citationCount: row.total_citations_num ?? 0,
        },
      ])
  );
}
