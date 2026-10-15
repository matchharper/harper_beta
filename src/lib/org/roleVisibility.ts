import { isInternalDomainEmail } from "@/lib/internalAccess";

type Relation<T> = T | T[] | null | undefined;
type RoleVisibilityRow = {
  company_internal_roles?: Relation<{ is_harper_tailored_role?: boolean | null }>;
  company_role_assignees?: Array<{
    company_users?: Relation<{ email?: string | null }>;
  }> | null;
};

function first<T>(value: Relation<T>): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

// A default company-facing read filter, not a database or authorization policy.
export function isCompanyVisibleRole(row: RoleVisibilityRow): boolean {
  if (first(row.company_internal_roles)?.is_harper_tailored_role !== false) {
    return true;
  }
  return !(row.company_role_assignees ?? []).some((assignee) =>
    isInternalDomainEmail(first(assignee.company_users)?.email)
  );
}
