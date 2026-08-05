import type { CompanyDataKey } from "@/lib/org/agent/companyDataCatalog";

export type OrgAgentLongTextObservation = {
  key: CompanyDataKey;
  roleId: string | null;
  value: string | null;
};

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

export function buildDefaultOrgAgentLongTextObservations(args: {
  companyDbId?: number | null;
  companyDescription: string | null;
  pitch: string | null;
  roleObservations: OrgAgentLongTextObservation[];
  workspaceMemoryAvailable: boolean;
  workspaceRequest: string | null;
}): OrgAgentLongTextObservation[] {
  return [
    // A linked company_db may still contain a mirrored legacy description.
    // company_details performs the authoritative cross-record read first.
    ...(!hasText(args.companyDescription) && !args.companyDbId
      ? [
          {
            key: "company_description" as const,
            roleId: null,
            value: null,
          },
        ]
      : []),
    ...(!hasText(args.pitch)
      ? [{ key: "pitch" as const, roleId: null, value: null }]
      : []),
    ...(!hasText(args.workspaceRequest)
      ? [
          {
            key: "workspace_request" as const,
            roleId: null,
            value: null,
          },
        ]
      : []),
    ...(!args.workspaceMemoryAvailable
      ? [
          {
            key: "workspace_memory" as const,
            roleId: null,
            value: null,
          },
        ]
      : []),
    ...args.roleObservations,
  ];
}
