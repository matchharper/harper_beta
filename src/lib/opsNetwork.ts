import type { NetworkLead } from "@/lib/networkOps";
import type {
  TalentStructuredProfile,
  TalentUserProfileRow,
} from "@/lib/talentOnboarding/server";
import type { Database } from "@/types/database.types";
import { v5 as uuidv5 } from "uuid";

const NETWORK_TALENT_NAMESPACE = "8be1d393-baf3-4cb2-bb85-1f111ab7291b";

export type TalentInternalEntry =
  Database["public"]["Tables"]["talent_internal"]["Row"];
export type TalentInternalType = TalentInternalEntry["type"];

export type NetworkLeadSummary = NetworkLead & {
  hasStructuredProfile: boolean;
  lastInternalActivityAt: string | null;
  talentId: string;
};

export type NetworkLeadListResponse = {
  allowedDomain: string;
  hasMore: boolean;
  leads: NetworkLeadSummary[];
  limit: number;
  loadedCount: number;
  nextOffset: number | null;
  offset: number;
  totalCount: number;
  userEmail: string | null;
};

export type NetworkLeadDetailResponse = {
  hasStructuredProfile: boolean;
  ingestionState: {
    hasLinkedin: boolean;
    hasResume: boolean;
    lastInternalActivityAt: string | null;
    resumeTextAvailable: boolean;
  };
  internalEntries: TalentInternalEntry[];
  lead: NetworkLeadSummary;
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
