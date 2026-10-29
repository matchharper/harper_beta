import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { getCompanyInternalRoleRecord } from "@/lib/companyInternalRole";
import { OrgHttpError } from "@/lib/org/httpError";
import { getOrgPermissions } from "@/lib/org/permissions";
import { memoOrgRequest } from "@/lib/org/requestScope.server";
import { isCompanyVisibleRole } from "@/lib/org/roleVisibility";
import { canAccessOrgRole, readOrgRoleAccess } from "@/lib/org/teamAccess";

/** Current permission + this Role only. Conversation, Slack and company context belong to the LLM loader. */
export function readRoleStartAccess(args: { roleId: string; workspaceId: string; user: User }) {
  return memoOrgRequest(["role-start-access", args.user.id, args.workspaceId, args.roleId], async () => {
    if (!args.workspaceId || !args.roleId) throw new OrgHttpError(400, "workspaceId and roleId are required");
    const admin = getSupabaseAdmin();
    const [access, result] = await Promise.all([
      readOrgRoleAccess({ ...args, admin, fresh: true }),
      admin.from("company_roles")
        .select("role_id, status, name, description, location_text, work_mode, type, salary_range, company_internal_roles(team_id, is_harper_tailored_role), company_role_assignees(company_users(email))")
        .eq("company_workspace_id", args.workspaceId).eq("role_id", args.roleId)
        .eq("source_type", "internal").not("is_expired", "is", true).maybeSingle(),
    ]);
    if (!getOrgPermissions(access.authority, access.scope).canManageCandidates) {
      throw new OrgHttpError(403, "이 작업을 수행할 권한이 없습니다.");
    }
    if (result.error) throw result.error;
    const role = result.data;
    if (!role || !isCompanyVisibleRole(role) ||
      !canAccessOrgRole(access, getCompanyInternalRoleRecord(role.company_internal_roles)?.team_id)) {
      throw new OrgHttpError(404, "Role not found");
    }
    return {
      status: role.status ?? "",
      hasDescription: Boolean(role.description?.trim()),
      name: role.name,
      description: role.description,
      locationText: role.location_text,
      workMode: role.work_mode,
      employmentTypes: role.type ?? [],
      salaryRange: role.salary_range,
    };
  });
}
