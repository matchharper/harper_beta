import type { MouseEvent } from "react";

export type CompanyWatchlistTab = "following" | "signals";
type CareerTLike = (key: string, koSource: string) => string;

export type CompanyRolePreview = {
  externalJdUrl: string | null;
  location: string | null;
  name: string;
  postedAt: string | null;
  roleId: string;
  type: string[];
  workMode: string | null;
};

export type CompanySnapshotDossier = {
  fullMarkdown: string;
  investigationDate: string | null;
  snapshotId: string;
  sourceFile: string | null;
  updatedAt: string | null;
};

export type CompanyLeadershipEducation = {
  degree: string | null;
  field: string | null;
  school: string | null;
};

export type CompanyLeadershipPerson = {
  candidId: string;
  education: CompanyLeadershipEducation[];
  headline: string | null;
  isCurrentAtCompany: boolean;
  linkedinUrl: string | null;
  name: string;
  previousCompanies: string[];
  role: string | null;
};

export type CompanyLeadershipPayload = {
  leaders?: CompanyLeadershipPerson[];
};

export type CompanyDataSummary = {
  lastFundingRoundDescription: string | null;
  lastFundingStage: string | null;
  mainInvestors: string | null;
  totalFundingRaised: string | null;
};

export type CompanyWatchlistItem = {
  activeRoleCount: number;
  careerUrl: string | null;
  companyData: CompanyDataSummary | null;
  companyDbId: number;
  companySnapshot: CompanySnapshotDossier | null;
  companyWorkspaceId: string | null;
  crunchbaseInformation: unknown | null;
  description: string | null;
  discoveryChannelSummary: string | null;
  employeeCountRange: unknown | null;
  followedAt: string | null;
  following: boolean;
  foundedYear: number | null;
  fundingUrl: string | null;
  homepageUrl: string | null;
  id: string;
  investors: string | null;
  lastCrunchbaseUpdatedAt: string | null;
  lastUpdatedAt: string | null;
  latestRolePostedAt: string | null;
  linkedinUrl: string | null;
  location: string | null;
  logoUrl: string | null;
  name: string;
  relatedLinks: string[];
  rolePreviews: CompanyRolePreview[];
  shortDescription: string | null;
  specialities: string[];
  trackingSummary: string | null;
  websiteUrl: string | null;
};

export type CompanyWatchlistPage = {
  count: number;
  items: CompanyWatchlistItem[];
  nextOffset: number | null;
};

export type CompanyDetailPayload = {
  item?: CompanyWatchlistItem | null;
};

export type CompanyDetailRow = {
  icon: React.ElementType | null;
  label: string;
  value: string;
};

export type CompanyFollowClickHandler = (
  item: CompanyWatchlistItem,
  event: MouseEvent<HTMLButtonElement>
) => void;

export const WATCHLIST_PAGE_SIZE = 12;
export const WATCHLIST_TAB_QUERY_KEY = "watchlistTab";
export const WATCHLIST_COMPANY_QUERY_KEY = "company";

const fallbackCareerT: CareerTLike = (_key, koSource) => koSource;

export const getWatchlistTabs = (t: CareerTLike) => [
  {
    id: "following" as const,
    label: t("career.company.follow_button.1p6sttz", "팔로우"),
  },
  {
    id: "signals" as const,
    label: t("career.company.watchlist_types.0kgfx63", "시그널"),
  },
];

export const WATCHLIST_TABS: Array<{
  id: CompanyWatchlistTab;
  label: string;
}> = getWatchlistTabs(fallbackCareerT);
