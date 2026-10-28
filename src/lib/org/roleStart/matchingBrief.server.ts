import "server-only";

import type { User } from "@supabase/supabase-js";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getCompanyInternalRoleRecord } from "@/lib/companyInternalRole";
import { OrgHttpError } from "@/lib/org/httpError";
import { canAccessOrgRole, readOrgRoleAccess, scopeOrgRoleQuery } from "@/lib/org/teamAccess";
import { normalizeRoleStartBrief } from "./brief";
import type { RoleStartProgress } from "./session";
import { chatBriefEdit, roleStartBriefView, visibleBriefHash, type RoleStartBriefView } from "./view";

export type RoleMatchingBrief = {
  structured: boolean;
  rubric: RoleStartBriefView | null;
  briefHash: string | null;
  session: { briefEdit: "running" | "error" | null } | null;
};

type BriefRecord = {
  phase: string;
  brief_source: string;
  brief: unknown;
  progress: RoleStartProgress[];
};

/** Read the displayed Brief without loading or creating a role-start conversation or candidate pool. */
export async function readRoleMatchingBrief(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  user: User;
  workspaceId: string;
  roleId: string;
}): Promise<RoleMatchingBrief> {
  if (!args.workspaceId || !args.roleId) throw new OrgHttpError(400, "workspaceId and roleId are required");
  const access = await readOrgRoleAccess(args);
  const { data: role, error } = await scopeOrgRoleQuery(
    args.admin.from("company_roles")
      .select("status,company_internal_roles(team_id),company_role_start_sessions(phase,brief_source,brief,progress)")
      .eq("company_workspace_id", args.workspaceId)
      .eq("role_id", args.roleId)
      .eq("source_type", "internal")
      .not("is_expired", "is", true),
    access
  ).maybeSingle();
  if (error) throw error;
  // The role-start table is not yet part of the generated database types.
  const row = role as unknown as {
    status: string;
    company_internal_roles: { team_id: string | null } | { team_id: string | null }[] | null;
    company_role_start_sessions: BriefRecord | BriefRecord[] | null;
  } | null;
  if (!row || !canAccessOrgRole(access, getCompanyInternalRoleRecord(row.company_internal_roles)?.team_id)) {
    throw new OrgHttpError(404, "Role을 찾을 수 없습니다.");
  }
  const session = Array.isArray(row.company_role_start_sessions)
    ? row.company_role_start_sessions[0]
    : row.company_role_start_sessions;
  if (row.status === "draft" || !session || session.brief_source !== "onboarding" || session.phase === "superseded") {
    return { structured: false, rubric: null, briefHash: null, session: null };
  }
  const brief = normalizeRoleStartBrief(session.brief);
  return {
    structured: true,
    rubric: roleStartBriefView(brief),
    briefHash: visibleBriefHash(brief),
    session: { briefEdit: chatBriefEdit({ progress: Array.isArray(session.progress) ? session.progress : [] }) },
  };
}
