import { revalidateTag, unstable_cache } from "next/cache";
import { canCacheOrgPermissions, memoOrgRequest } from "./requestScope.server";
import type { OrgRoleAccess } from "./teamAccess.shared";

const PERMISSION_TTL_SECONDS = 30 * 60;
const workspaceTag = (workspaceId: string) => `org-permission:${workspaceId}`;

/** Only server-verified identity and DB-derived access may enter this cache. */
export async function readCachedOrgPermission(
  identity: { workspaceId: string; userId: string; internalAccess: boolean },
  readCurrent: () => Promise<OrgRoleAccess>,
): Promise<OrgRoleAccess> {
  if (!canCacheOrgPermissions()) return readCurrent();
  // A new key forces a blocking read at each half-hour boundary. TTL alone uses
  // stale-while-revalidate and could authorize the first request after expiry.
  const bucket = Math.floor(Date.now() / (PERMISSION_TTL_SECONDS * 1000));
  const keys = [
    "org-permission-v1", process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    identity.workspaceId, identity.userId, String(identity.internalAccess), String(bucket),
  ];
  return memoOrgRequest(keys, () => unstable_cache(readCurrent, keys, {
    tags: [workspaceTag(identity.workspaceId)], revalidate: PERMISSION_TTL_SECONDS,
  })());
}

/** Call after a successful membership/team write, within a Next route/action. */
export function invalidateOrgPermissions(workspaceId: string) {
  revalidateTag(workspaceTag(workspaceId), { expire: 0 });
}
