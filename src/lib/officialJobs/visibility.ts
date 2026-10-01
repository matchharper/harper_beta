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
  is_anonymous: boolean;
};

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

    const role = rolesById.get(job.role_id);
    const setting = settingsById.get(job.role_id);
    if (!role || !setting) return [];
    if (role.source_type !== "internal" || !setting.is_promote) return [];
    if (role.status !== "active" && role.status !== "paused") return [];
    if (role.is_expired) return [];
    if (role.expires_at && Date.parse(role.expires_at) <= nowMs) return [];
    if (
      role.information &&
      typeof role.information === "object" &&
      !Array.isArray(role.information) &&
      role.information.testOnly === true
    ) {
      return [];
    }

    // The slug is enough to resolve the role server-side after onboarding.
    // Do not expose an anonymous company's internal role identifier publicly.
    return [setting.is_anonymous ? { ...job, role_id: null } : job];
  });
}
