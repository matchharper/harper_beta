import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { hasReachedTalentFirstCapacity } from "./talentFirstCapacity";

// Read the same current stage and slot eligibility used by role matching.
// Board filters and recommendation pagination must not affect this count.
export async function readTalentFirstCapacityBlockedRoleIds(
  admin: ReturnType<typeof getSupabaseAdmin>,
  roleIds: string[],
  now = new Date()
): Promise<string[]> {
  const blocked: string[] = [];
  for (let offset = 0; offset < roleIds.length; offset += 80) {
    const ids = roleIds.slice(offset, offset + 80);
    const { data: roles, error } = await (admin.from("company_roles") as any)
      .select(
        "role_id, expires_at, information, company_internal_roles!inner(request, max_pending_talents)"
      )
      .in("role_id", ids)
      .eq("source_type", "internal")
      .eq("status", "active")
      .not("is_expired", "is", true);
    if (error) throw error;
    for (const role of roles ?? []) {
      const internal = Array.isArray(role.company_internal_roles)
        ? role.company_internal_roles[0]
        : role.company_internal_roles;
      if (
        !internal?.request?.trim() ||
        internal.max_pending_talents == null ||
        (role.expires_at && new Date(role.expires_at) <= now) ||
        ["true", "1", "yes", "on"].includes(
          String(role.information?.testOnly ?? "")
            .trim()
            .toLowerCase()
        )
      )
        continue;
      const seen = new Set<string>();
      let pendingCount = 0;
      for (let from = 0; ; from += 1000) {
        const { data: tags, error: tagError } = await admin
          .from("talent_opportunity_tag")
          .select("talent_id, tag")
          .eq("opportunity_id", role.role_id)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + 999);
        if (tagError) throw tagError;
        for (const tag of tags ?? []) {
          if (seen.has(tag.talent_id)) continue;
          seen.add(tag.talent_id);
          if (tag.tag === "내부:연결대기") pendingCount += 1;
        }
        if (
          (tags?.length ?? 0) < 1000 ||
          hasReachedTalentFirstCapacity(
            pendingCount,
            internal.max_pending_talents
          )
        )
          break;
      }
      if (
        !hasReachedTalentFirstCapacity(
          pendingCount,
          internal.max_pending_talents
        )
      )
        continue;
      const { data: slotType, error: slotError } = await admin.rpc(
        "role_matching_slot_type_v1",
        {
          p_role_id: role.role_id,
          p_at: now.toISOString(),
        }
      );
      if (slotError) throw slotError;
      if (slotType === "free" || slotType === "paid") blocked.push(role.role_id);
    }
  }
  return blocked;
}
