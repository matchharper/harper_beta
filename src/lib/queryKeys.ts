// Central Query Key Factory
// New hooks should use these keys. Existing hooks migrate opportunistically.
import { OPS_OPPORTUNITY_COMPANY_PAGE_SIZE } from "@/lib/ops/opportunityConstants";

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
      roleId?: string | null;
      sourceType?: string | null;
      workspaceId?: string | null;
    }) =>
      [
        "opsOpportunity",
        "roles",
        filters?.workspaceId ?? "all",
        filters?.query ?? "",
        filters?.roleId ?? "all",
        filters?.sourceType ?? "all",
        Boolean(filters?.internalOnly),
        filters?.limit ?? 25,
      ] as const,
  },
  opsCompany: {
    all: ["opsCompany"] as const,
    waiting: ["opsCompany", "waiting"] as const,
    members: (filters?: {
      query?: string | null;
      workspaceId?: string | null;
    }) =>
      [
        "opsCompany",
        "members",
        filters?.workspaceId ?? "",
        filters?.query ?? "",
      ] as const,
    activity: (filters?: {
      limit?: number | null;
      offset?: number | null;
      workspaceId?: string | null;
    }) =>
      [
        "opsCompany",
        "activity",
        filters?.workspaceId ?? "",
        filters?.limit ?? 20,
        filters?.offset ?? 0,
      ] as const,
  },
  org: {
    all: ["org"] as const,
    acceptedAll: ["org", "acceptedTalents"] as const,
    bootstrapAll: ["org", "bootstrap"] as const,
    boardAll: ["org", "board"] as const,
    detailAll: ["org", "detail"] as const,
    slackAll: ["org", "slack"] as const,
    bootstrap: (orgId?: string | null) =>
      ["org", "bootstrap", orgId ?? ""] as const,
    invitePreview: (orgId?: string | null) =>
      ["org", "invitePreview", orgId ?? ""] as const,
    acceptedTalents: ["org", "acceptedTalents"] as const,
    board: (filters?: {
      query?: string | null;
      recommendedDate?: string | null;
      recommendedFromDate?: string | null;
      recommendedToDate?: string | null;
      roleId?: string | null;
      workspaceId?: string | null;
    }) =>
      [
        "org",
        "board",
        filters?.workspaceId ?? "",
        filters?.roleId ?? "all",
        filters?.recommendedDate ?? "",
        filters?.recommendedFromDate ?? "",
        filters?.recommendedToDate ?? "",
        filters?.query ?? "",
      ] as const,
    boardProfileLabels: (filters?: {
      recommendationIds?: string[];
      workspaceId?: string | null;
    }) =>
      [
        "org",
        "board",
        "profileLabels",
        filters?.workspaceId ?? "",
        filters?.recommendationIds ?? [],
      ] as const,
    detail: (filters?: {
      recommendationId?: string | null;
      roleId?: string | null;
      talentId?: string | null;
      workspaceId?: string | null;
    }) =>
      [
        "org",
        "detail",
        filters?.workspaceId ?? "",
        filters?.roleId ?? "",
        filters?.talentId ?? "",
        filters?.recommendationId ?? "",
      ] as const,
    slack: (workspaceId?: string | null) =>
      ["org", "slack", workspaceId ?? ""] as const,
    internalTalent: (filters?: {
      talentId?: string | null;
      workspaceId?: string | null;
    }) =>
      [
        "org",
        "internalTalent",
        filters?.workspaceId ?? "",
        filters?.talentId ?? "",
      ] as const,
    agentMessages: (filters?: {
      roleId?: string | null;
      workspaceId?: string | null;
    }) =>
      [
        "org",
        "agentMessages",
        filters?.workspaceId ?? "",
        filters?.roleId ?? "",
      ] as const,
    agentMentions: (filters?: {
      query?: string | null;
      roleId?: string | null;
      workspaceId?: string | null;
    }) =>
      [
        "org",
        "agentMentions",
        filters?.workspaceId ?? "",
        filters?.roleId ?? "",
        filters?.query ?? "",
      ] as const,
  },
  opsMatching: {
    all: ["opsMatching"] as const,
    allRoles: (filters: {
      limit?: number | null;
      query?: string | null;
      selfServeOnly?: boolean | null;
    }) =>
      [
        "opsMatching",
        "allRoles",
        filters.limit ?? 20,
        filters.query ?? "",
        Boolean(filters.selfServeOnly),
      ] as const,
    companies: (query?: string | null) =>
      ["opsMatching", "companies", query ?? ""] as const,
    roles: (companyWorkspaceId?: string | null) =>
      ["opsMatching", "roles", companyWorkspaceId ?? ""] as const,
    fits: (filters: {
      humanLabels?: readonly string[] | null;
      limit?: number | null;
      offset?: number | null;
      llmLabels?: readonly string[] | null;
      query?: string | null;
    }) =>
      [
        "opsMatching",
        "fits",
        filters.limit ?? 20,
        filters.offset ?? 0,
        filters.query ?? "",
        (filters.llmLabels ?? []).join("|"),
        (filters.humanLabels ?? []).join("|"),
      ] as const,
    talents: (filters: {
      createdFrom?: string | null;
      createdTo?: string | null;
      excludeRecommended?: boolean | null;
      humanLabels?: readonly string[] | null;
      limit?: number | null;
      llmLabels?: readonly string[] | null;
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
        Boolean(filters.excludeRecommended),
        (filters.llmLabels ?? []).join("|"),
        (filters.humanLabels ?? []).join("|"),
        (filters.tags ?? []).join("|"),
      ] as const,
    talentHistory: (filters: {
      sections?: readonly string[] | null;
      talentIds?: readonly string[] | null;
    }) =>
      [
        "opsMatching",
        "talentHistory",
        (filters.talentIds ?? []).join("|"),
        (filters.sections ?? []).join("|"),
      ] as const,
    talentFits: (talentId?: string | null) =>
      ["opsMatching", "talentFits", talentId ?? ""] as const,
    tagOptions: ["opsMatching", "tagOptions"] as const,
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
