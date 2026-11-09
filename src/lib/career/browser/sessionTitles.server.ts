import { z } from "zod";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { ExternalOperation } from "../externalOperations/store";

/** Display exact role names from this user's recommendations, never task prose. */
export async function browserSessionTitles(
  context: { admin: TalentAdminClient; userId: string },
  sessions: ExternalOperation[]
) {
  const refs = new Map(sessions.map(session => [session.id,
    (Array.isArray(session.request.role_refs) ? session.request.role_refs : [])
      .flatMap(ref => {
        const parsed = z.string().uuid().safeParse(typeof ref === "string" ? ref.replace(/^(role|external):/, "") : ref);
        return parsed.success ? [parsed.data] : [];
      }),
  ]));
  const ids = [...new Set([...refs.values()].flat())];
  if (!ids.length) return new Map<string, string>();
  const { data, error } = await context.admin.from("talent_opportunity_recommendation")
    .select("role_id,role:company_roles(name,company_workspace(company_name))")
    .eq("talent_id", context.userId).in("role_id", ids);
  if (error) return new Map<string, string>();
  const labels = new Map((data ?? []).map(row => {
    const role = row.role;
    return [row.role_id, role ? [role.company_workspace?.company_name, role.name].filter(Boolean).join(" · ") : ""];
  }));
  return new Map([...refs].map(([id, roleIds]) => [id,
    [...new Set(roleIds.map(roleId => labels.get(roleId)).filter(Boolean))].join(" / "),
  ]));
}
