import type { Json } from "@/types/database.types";

export const MATCH_ROLE_STATUS_VALUES = [
  "top_priority",
  "active",
  "ended",
  "paused",
] as const;

export const MATCH_DECISION_STATUS_VALUES = [
  "pending",
  "requested",
  "rejected",
  "hold",
] as const;

export const MATCH_EMPLOYMENT_TYPE_VALUES = [
  "full_time",
  "part_time",
] as const;

export type MatchRoleStatus = (typeof MATCH_ROLE_STATUS_VALUES)[number];
export type MatchDecisionStatus = (typeof MATCH_DECISION_STATUS_VALUES)[number];
export type MatchEmploymentType = (typeof MATCH_EMPLOYMENT_TYPE_VALUES)[number];

export type MatchWorkspaceRecord = {
  companyDescription: string | null;
  companyName: string;
  companyWorkspaceId: string;
  createdAt: string;
  homepageUrl: string | null;
  linkedinUrl: string | null;
  logoStoragePath: string | null;
  logoUrl: string | null;
  memberRole: string | null;
  updatedAt: string;
};

export type MatchRoleRecord = {
  companyWorkspaceId: string;
  createdAt: string;
  description: string | null;
  employmentTypes: MatchEmploymentType[];
  externalJdUrl: string | null;
  information: Json | null;
  matchedCandidateCount: number;
  name: string;
  roleId: string;
  status: MatchRoleStatus;
  updatedAt: string;
};

export type MatchCandidateRecord = {
  candidId: string;
  feedbackText: string | null;
  harperMemo: string | null;
  matchId: string;
  relatedRoleIds: string[];
  relatedRoleNames: string[];
  roleId: string;
  roleName: string;
  status: MatchDecisionStatus;
  updatedAt: string;
};

export type MatchWorkspaceResponse = {
  bookingUrl: string;
  roles: MatchRoleRecord[];
  workspace: MatchWorkspaceRecord | null;
  workspaces: MatchWorkspaceRecord[];
};

export type MatchCandidateDetailResponse = {
  match: MatchCandidateRecord;
  relatedRoles: MatchRoleRecord[];
  role: MatchRoleRecord | null;
  roles: MatchRoleRecord[];
  workspace: MatchWorkspaceRecord;
};

export function isMatchRoleStatus(value: unknown): value is MatchRoleStatus {
  return MATCH_ROLE_STATUS_VALUES.includes(value as MatchRoleStatus);
}

export function isMatchDecisionStatus(
  value: unknown
): value is MatchDecisionStatus {
  return MATCH_DECISION_STATUS_VALUES.includes(value as MatchDecisionStatus);
}

export function isMatchEmploymentType(
  value: unknown
): value is MatchEmploymentType {
  return MATCH_EMPLOYMENT_TYPE_VALUES.includes(value as MatchEmploymentType);
}

export function normalizeMatchRoleStatus(value: unknown): MatchRoleStatus {
  return isMatchRoleStatus(value) ? value : "active";
}

export function normalizeMatchDecisionStatus(
  value: unknown
): MatchDecisionStatus {
  return isMatchDecisionStatus(value) ? value : "pending";
}

export function normalizeMatchEmploymentTypes(
  value: unknown
): MatchEmploymentType[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<MatchEmploymentType>();
  const items: MatchEmploymentType[] = [];

  for (const item of value) {
    if (!isMatchEmploymentType(item) || seen.has(item)) continue;
    seen.add(item);
    items.push(item);
  }

  return items;
}
