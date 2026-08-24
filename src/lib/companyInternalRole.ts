type CompanyInternalRoleRecord = {
  considerations?: unknown;
  criteria?: unknown;
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
