import type { Json } from "@/types/database.types";

type LinkedRole = {
  role_id: string;
  source_type: string;
  status: string;
  is_expired: boolean;
  expires_at: string | null;
  information: Json;
};

type PromotionSetting = {
  role_id: string;
  is_promote: boolean;
};

/**
 * public: Harper can introduce candidates to this posting's role.
 * closed: an internal, non-test role that ended or expired.
 * hidden: anything else (not internal, not promoted, test-only, missing).
 */
export function classifyOfficialJobLinkedRole(
  role: LinkedRole | undefined,
  setting: PromotionSetting | undefined,
  nowMs = Date.now()
): "public" | "closed" | "hidden" {
  if (!role || role.source_type !== "internal") return "hidden";
  if (
    role.information &&
    typeof role.information === "object" &&
    !Array.isArray(role.information) &&
    role.information.testOnly === true
  ) {
    return "hidden";
  }
  const open =
    (role.status === "active" || role.status === "paused") &&
    !role.is_expired &&
    !(role.expires_at && Date.parse(role.expires_at) <= nowMs);
  // Only a posting that was public can be closed; a role never promoted stays hidden.
  if (!setting?.is_promote) return "hidden";
  return open ? "public" : "closed";
}

export function filterPublicOfficialJobRows<T extends { role_id: string | null }>(
  jobs: T[],
  roles: LinkedRole[],
  settings: PromotionSetting[],
  nowMs = Date.now()
): T[] {
  const rolesById = new Map(roles.map((role) => [role.role_id, role]));
  const settingsById = new Map(
    settings.map((setting) => [setting.role_id, setting])
  );

  return jobs.flatMap((job) => {
    if (!job.role_id) return [job];
    // A public role_id means Harper can introduce candidates to this posting.
    return classifyOfficialJobLinkedRole(
      rolesById.get(job.role_id),
      settingsById.get(job.role_id),
      nowMs
    ) === "public"
      ? [job]
      : [];
  });
}
