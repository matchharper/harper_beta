export type LandingLog = {
  id: string;
  local_id: string;
  type: string;
  abtest_type: string | null;
  created_at: string;
  is_mobile: boolean | null;
  country_lang: string | null;
};

export type GroupedLogs = {
  local_id: string;
  entryTime: string;
  country_lang: string;
  abtest_type: string;
  logs: LandingLog[];
};

export type LandingSummary = {
  totalUsers: number;
  scrolledUsers: number;
  startClickedUsers: number;
  loggedInUsers: number;
};

export type AbtestSummary = {
  abtestType: string;
  totalUsers: number;
  scrolledUsers: number;
  startClickedUsers: number;
  pricingClickedUsers: number;
  loggedInUsers: number;
};

export type SectionProgressSummary = {
  abtestType: string;
  totalUsers: number;
  sections: Array<{
    sectionName: string;
    userCount: number;
  }>;
};

export type TalentNetworkFunnelSummary = {
  totalUsers: number;
  onboardingStartUsers: number;
  submittedUsers: number;
  steps: Array<{
    key: string;
    step: number;
    label: string;
    eventType: string;
    userCount: number;
  }>;
};

export type TalentNetworkButtonSummary = {
  eventType: string;
  totalClicks: number;
  uniqueUsers: number;
  variantBreakdown: Array<{
    abtestType: string;
    label: string;
    totalClicks: number;
    uniqueUsers: number;
  }>;
};

export type TalentNetworkVariantFunnelSummary = TalentNetworkFunnelSummary & {
  abtestType: string;
  label: string;
};

export type TalentNetworkVariantColumn = {
  abtestType: string;
  label: string;
};

export type WaitlistCompany = {
  additional: string | null;
  company: string | null;
  company_link: string | null;
  created_at: string;
  email: string;
  is_mobile: boolean | null;
  is_submit: boolean;
  main: string | null;
  name: string | null;
  needs: string[] | null;
  role: string | null;
  size: string | null;
};

export type BlogMetricRow = {
  slug: string;
  viewCount: number;
  conversionCount: number;
};

export type BlogMetricsSummary = {
  totalPosts: number;
  totalViews: number;
  totalConversions: number;
};

export type AdminBookmarkUser = {
  userId: string;
  name: string | null;
  email: string | null;
  company: string | null;
  folderCount: number;
  bookmarkCount: number;
};

export type AdminBookmarkFolder = {
  id: number;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
};

export type AdminBookmarkFolderItem = {
  folderItemId: number;
  candidId: string;
  name: string | null;
  headline: string | null;
  memo: string;
  memoUpdatedAt: string | null;
  linkedinUrl: string | null;
  profileHref: string;
  createdAt: string | null;
};

export type AdminUserAnalyticsUser = {
  userId: string;
  name: string | null;
  email: string | null;
  company: string | null;
  searchCount: number;
  profileViewCount: number;
  linkClickCount: number;
};

export type AdminUserAnalyticsSummary = {
  searchCount: number;
  runCount: number;
  pageViewCount: number;
  profileViewCount: number;
  linkClickCount: number;
  uniqueProfilesViewed: number;
  chatMessageCount: number;
  markedCandidateCount: number;
  bookmarkedCandidateCount: number;
  memoCount: number;
  pageViewsPerSearch: number;
  profileViewsPerSearch: number;
};

export type AdminUserAnalyticsProfile = {
  candidId: string;
  name: string | null;
  headline: string | null;
  linkedinUrl: string | null;
  profileHref: string;
  profileViewCount: number;
  totalLinkClickCount: number;
  linkClicks: Array<{
    host: string;
    count: number;
  }>;
};

export type AdminTab =
  | "landingLogs"
  | "networkAnalytics"
  | "waitlistCompany"
  | "blogMetrics"
  | "bookmarkFolders"
  | "userAnalytics"
  | "metrics";
