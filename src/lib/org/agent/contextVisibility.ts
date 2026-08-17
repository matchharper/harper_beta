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
  pitch: string | null;
  roleObservations: OrgAgentLongTextObservation[];
  workspaceMemoryAvailable: boolean;
  workspaceRequest: string | null;
}): OrgAgentLongTextObservation[] {
  return [
    // pitch is injected in full on every call, including an authoritative
    // empty value, so it is always safe to use as the base for an edit.
    { key: "pitch" as const, roleId: null, value: args.pitch },
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
