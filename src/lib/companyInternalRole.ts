type CompanyInternalRoleRecord = {
  considerations?: unknown;
  criteria?: unknown;
  is_company_first_search?: boolean | null;
  is_promote?: boolean | null;
  intro_search_date?: string[] | null;
  intro_search_time?: number | null;
  memory?: string | null;
  questions?: unknown;
  request?: string | null;
};

export function getCompanyInternalRoleRecord(
  value:
    | CompanyInternalRoleRecord
    | CompanyInternalRoleRecord[]
    | null
    | undefined
): CompanyInternalRoleRecord | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function getCompanyInternalRoleRequest(
  value:
    | CompanyInternalRoleRecord
    | CompanyInternalRoleRecord[]
    | null
    | undefined
) {
  return getCompanyInternalRoleRecord(value)?.request ?? null;
}
