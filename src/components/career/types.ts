export type CareerStage = "profile" | "chat" | "completed";
export type MessageRole = "assistant" | "user";
export type CareerInputMode = "text" | "voice";

export type CareerTalentUser = {
  user_id: string;
  name: string | null;
  profile_picture: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
};

export type CareerTalentExperience = {
  id: number;
  talent_id: string;
  role: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  months: number | null;
  company_name: string | null;
  company_location: string | null;
  company_logo: string | null;
  memo: string | null;
};

export type CareerTalentEducation = {
  id: number;
  talent_id: string;
  school: string | null;
  degree: string | null;
  description: string | null;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  memo: string | null;
};

export type CareerTalentExtra = {
  title: string | null;
  description: string | null;
  date: string | null;
  memo: string | null;
};

export type CareerTalentProfile = {
  talentUser: CareerTalentUser | null;
  talentExperiences: CareerTalentExperience[];
  talentEducations: CareerTalentEducation[];
  talentExtras: CareerTalentExtra[];
};

export type CareerNetworkApplication = {
  selectedRole: string | null;
  profileInputTypes: Array<"linkedin" | "github" | "scholar" | "website" | "cv">;
  linkedinProfileUrl: string | null;
  githubProfileUrl: string | null;
  scholarProfileUrl: string | null;
  personalWebsiteUrl: string | null;
  submittedAt: string | null;
};

export type CareerTalentPreferences = {
  engagementTypes: string[];
  preferredLocations: string[];
  careerMoveIntent: string | null;
  careerMoveIntentLabel: string | null;
};

export type CareerTalentInsights = Record<string, string>;

export type CareerRecentOpportunity = {
  id: string;
  kind: "match" | "recommendation";
  title: string;
  companyName: string;
  summary: string | null;
  location: string | null;
  engagementType: string | null;
  matchedAt: string;
  href?: string | null;
};

export type CareerHistoryItem = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  type:
    | "network_submission"
    | "career_workspace_created"
    | "career_conversation_started"
    | "profile_updated";
};

export type CareerMessage = {
  id: string | number;
  role: MessageRole;
  content: string;
  messageType: string;
  createdAt: string;
  typing?: boolean;
};

export type CareerMessagePayload = {
  id: number;
  role: MessageRole;
  content: string;
  messageType: string;
  createdAt: string;
};

export type CareerProfileSettingsMeta = {
  networkApplicationUpdatedAt: string | null;
  talentPreferencesUpdatedAt: string | null;
  talentInsightsUpdatedAt: string | null;
  talentSettingsUpdatedAt: string | null;
  latestUpdatedAt: string | null;
};

export type SessionResponse = {
  conversation: {
    id: string;
    stage: CareerStage;
    title: string | null;
    resumeFileName: string | null;
    resumeStoragePath?: string | null;
    resumeDownloadUrl?: string | null;
    resumeLinks: string[];
    reliefNudgeSent: boolean;
  };
  historyItems?: CareerHistoryItem[];
  networkApplication?: CareerNetworkApplication | null;
  talentPreferences?: CareerTalentPreferences | null;
  talentInsights?: CareerTalentInsights | null;
  recentOpportunities?: CareerRecentOpportunity[];
  profileSettingsMeta?: CareerProfileSettingsMeta;
  talentProfile?: CareerTalentProfile;
  messages: CareerMessagePayload[];
  nextBeforeMessageId: number | null;
};
