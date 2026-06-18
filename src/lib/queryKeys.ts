// Central Query Key Factory
// New hooks should use these keys. Existing hooks migrate opportunistically.
import {
  OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
  OPS_OPPORTUNITY_COMPANY_PAGE_SIZE,
} from "@/lib/ops/opportunityCompanyManagement";

export type QueryKey = readonly unknown[];

export const queryKeys = {
  candidate: {
    all: ["candidate"] as const,
    detail: (candidId: string) => ["candidate", "detail", candidId] as const,
    bookmark: (candidId: string) =>
      ["candidate", "bookmark", candidId] as const,
  },
  run: {
    all: ["run"] as const,
    detail: (runId: string) => ["run", "detail", runId] as const,
    results: (runId: string) => ["run", "results", runId] as const,
  },
  connections: {
    all: ["connections"] as const,
    count: (userId: string) => ["connections", "count", userId] as const,
  },
  bookmarkFolders: {
    all: ["bookmarkFolders"] as const,
    byUser: (userId: string) => ["bookmarkFolders", "byUser", userId] as const,
    detail: (folderId: string) =>
      ["bookmarkFolders", "detail", folderId] as const,
  },
  match: {
    all: ["match"] as const,
    workspace: (workspaceId?: string | null) =>
      ["match", "workspace", workspaceId ?? "active"] as const,
    candidates: (workspaceId?: string | null, roleId?: string | null) =>
      [
        "match",
        "candidates",
        workspaceId ?? "active",
        roleId ?? "all",
      ] as const,
    candidateDetail: (candidId: string, roleId?: string | null) =>
      ["match", "candidate", candidId, roleId ?? "primary"] as const,
  },
  opsOpportunity: {
    all: ["opsOpportunity"] as const,
    catalogAll: ["opsOpportunity", "catalog"] as const,
    catalog: (filters?: {
      internalOnly?: boolean | null;
      limit?: number | null;
      workspaceQuery?: string | null;
    }) =>
      [
        "opsOpportunity",
        "catalog",
        filters?.workspaceQuery ?? "",
        Boolean(filters?.internalOnly),
        filters?.limit ?? OPS_OPPORTUNITY_COMPANY_PAGE_SIZE,
      ] as const,
    roles: (filters?: {
      internalOnly?: boolean | null;
      limit?: number | null;
      query?: string | null;
      sourceType?: string | null;
      workspaceId?: string | null;
    }) =>
      [
        "opsOpportunity",
        "roles",
        filters?.workspaceId ?? "all",
        filters?.query ?? "",
        filters?.sourceType ?? "all",
        Boolean(filters?.internalOnly),
        filters?.limit ?? 25,
      ] as const,
    companiesAll: ["opsOpportunity", "companies"] as const,
    companies: (filters?: {
      companyName?: string | null;
      employeeCountRange?: string | null;
      foundedYearMin?: number | null;
      hasCareerUrlOnly?: boolean | null;
      humanLabelMissingFirst?: boolean | null;
      investors?: string | null;
      limit?: number | null;
      llmQualityLabelFirst?: boolean | null;
      location?: string | null;
      qualityLabel?: string | null;
    }) =>
      [
        "opsOpportunity",
        "companies",
        filters?.companyName ?? "",
        filters?.employeeCountRange ?? "",
        filters?.location ?? "",
        filters?.investors ?? "",
        filters?.foundedYearMin ?? null,
        Boolean(filters?.hasCareerUrlOnly),
        Boolean(filters?.humanLabelMissingFirst),
        Boolean(filters?.llmQualityLabelFirst),
        filters?.qualityLabel ?? "",
        filters?.limit ?? OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
      ] as const,
    candidates: (query?: string | null, roleId?: string | null) =>
      ["opsOpportunity", "candidates", query ?? "", roleId ?? "all"] as const,
    matches: (roleId?: string | null, candidId?: string | null) =>
      [
        "opsOpportunity",
        "matches",
        roleId ?? "all",
        candidId ?? "all",
      ] as const,
    recommendations: (roleId?: string | null, talentId?: string | null) =>
      [
        "opsOpportunity",
        "recommendations",
        roleId ?? "all",
        talentId ?? "all",
      ] as const,
  },
  opsMatching: {
    all: ["opsMatching"] as const,
    companies: (query?: string | null) =>
      ["opsMatching", "companies", query ?? ""] as const,
    roles: (companyWorkspaceId?: string | null) =>
      ["opsMatching", "roles", companyWorkspaceId ?? ""] as const,
    talents: (filters: {
      createdFrom?: string | null;
      createdTo?: string | null;
      limit?: number | null;
      offset?: number | null;
      query?: string | null;
      roleId?: string | null;
      tags?: readonly string[] | null;
    }) =>
      [
        "opsMatching",
        "talents",
        filters.roleId ?? "",
        filters.limit ?? 20,
        filters.offset ?? 0,
        filters.query ?? "",
        filters.createdFrom ?? "",
        filters.createdTo ?? "",
        (filters.tags ?? []).join("|"),
      ] as const,
    talentPool: (filters: {
      createdFrom?: string | null;
      createdTo?: string | null;
      limit?: number | null;
      offset?: number | null;
      query?: string | null;
      tab?: string | null;
      tags?: readonly string[] | null;
    }) =>
      [
        "opsMatching",
        "talentPool",
        filters.tab ?? "tailored",
        filters.limit ?? 20,
        filters.offset ?? 0,
        filters.query ?? "",
        filters.createdFrom ?? "",
        filters.createdTo ?? "",
        (filters.tags ?? []).join("|"),
      ] as const,
    progress: (talentId?: string | null, roleId?: string | null) =>
      ["opsMatching", "progress", talentId ?? "", roleId ?? "all"] as const,
    roleTags: (talentId?: string | null) =>
      ["opsMatching", "roleTags", talentId ?? ""] as const,
    reviewAll: (roleId?: string | null) =>
      ["opsMatching", "review", roleId ?? ""] as const,
    review: (
      roleId?: string | null,
      filters?: {
        recommendedFrom?: string | null;
        recommendedTo?: string | null;
        tags?: readonly string[] | null;
      }
    ) =>
      [
        "opsMatching",
        "review",
        roleId ?? "",
        filters?.recommendedFrom ?? "",
        filters?.recommendedTo ?? "",
        (filters?.tags ?? []).join("|"),
      ] as const,
  },
  searchHistory: {
    all: ["searchHistory"] as const,
    byUser: (userId: string) => ["searchHistory", "byUser", userId] as const,
  },
} as const;
