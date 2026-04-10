import type { NetworkLead } from "@/lib/networkOps";
import type {
  TalentInsightContent,
  TalentSettingRow,
  TalentStructuredProfile,
  TalentUserProfileRow,
} from "@/lib/talentOnboarding/server";
import type { TalentNetworkApplication } from "@/lib/talentNetworkApplication";
import type { Database } from "@/types/database.types";
import { v5 as uuidv5 } from "uuid";

const NETWORK_TALENT_NAMESPACE = "8be1d393-baf3-4cb2-bb85-1f111ab7291b";

export type TalentInternalEntry =
  Database["public"]["Tables"]["talent_internal"]["Row"];
export type TalentInternalType = TalentInternalEntry["type"];

export type NetworkLeadLatestExperience = {
  companyLocation: string | null;
  companyName: string | null;
  endDate: string | null;
  role: string | null;
  startDate: string | null;
};

export type NetworkLeadRecentMemo = {
  content: string;
  createdAt: string;
  id: number;
};

export type NetworkLeadSummary = NetworkLead & {
  hasStructuredProfile: boolean;
  lastInternalActivityAt: string | null;
  latestExperience: NetworkLeadLatestExperience | null;
  recentMemos: NetworkLeadRecentMemo[];
  talentId: string;
};

export type NetworkLeadListStats = {
  readyNowCount: number;
  recentCount: number;
  totalCount: number;
  withCvCount: number;
};

export type NetworkLeadListFilters = {
  moveOptions: string[];
  roleOptions: string[];
};

export type NetworkLeadListResponse = {
  allowedDomain: string;
  allCount: number;
  filters: NetworkLeadListFilters;
  filteredCount: number;
  hasMore: boolean;
  leads: NetworkLeadSummary[];
  limit: number;
  loadedCount: number;
  nextOffset: number | null;
  offset: number;
  page: number;
  totalPages: number;
  totalCount: number;
  userEmail: string | null;
  stats: NetworkLeadListStats;
};

export type NetworkLeadDetailResponse = {
  claimedTalentId: string | null;
  hasStructuredProfile: boolean;
  ingestionState: {
    hasLinkedin: boolean;
    hasResume: boolean;
    lastInternalActivityAt: string | null;
    resumeTextAvailable: boolean;
  };
  internalEntries: TalentInternalEntry[];
  lead: NetworkLeadSummary;
  latestNetworkApplication: TalentNetworkApplication | null;
  latestTalentInsights: TalentInsightContent | null;
  latestTalentSetting: Pick<
    TalentSettingRow,
    "engagement_types" | "preferred_locations" | "career_move_intent"
  > | null;
  sourceTalentId: string;
  structuredProfile: TalentStructuredProfile | null;
  talentId: string;
  talentProfile: TalentUserProfileRow | null;
};

export function getNetworkTalentId(leadId: number) {
  return uuidv5(`harper_waitlist:${leadId}`, NETWORK_TALENT_NAMESPACE);
}

export function hasStructuredTalentProfile(args: {
  profile: TalentUserProfileRow | null;
  structuredProfile: TalentStructuredProfile | null;
}) {
  const { profile, structuredProfile } = args;

  if (
    (structuredProfile?.talentExperiences?.length ?? 0) > 0 ||
    (structuredProfile?.talentEducations?.length ?? 0) > 0 ||
    (structuredProfile?.talentExtras?.length ?? 0) > 0
  ) {
    return true;
  }

  const talentUser = structuredProfile?.talentUser ?? profile;

  return Boolean(
    talentUser?.headline ||
    talentUser?.bio ||
    talentUser?.location ||
    profile?.resume_text
  );
}
