import type { MouseEvent } from "react";
import { careerT } from "@/lib/career/translatedCareerMessage";

export type CompanyWatchlistTab = "recommended" | "following" | "signals";

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

export type CompanyWatchlistItem = {
  activeRoleCount: number;
  careerUrl: string | null;
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
  latestSignal: string | null;
  linkedinUrl: string | null;
  location: string | null;
  logoUrl: string | null;
  name: string;
  nextSignal: string | null;
  rank: number | null;
  reasonSummary: string | null;
  recommendationReasons: string[];
  recommendedAt: string | null;
  relatedLinks: string[];
  rolePreviews: CompanyRolePreview[];
  shortDescription: string | null;
  signalSummary: string | null;
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

export const WATCHLIST_TABS: Array<{
  id: CompanyWatchlistTab;
  label: string;
}> = [
  {
    id: "recommended",
    label: careerT("ko", "career.company.watchlist_types.0dpjqlp", "추천회사"),
  },
  {
    id: "following",
    label: careerT("ko", "career.company.follow_button.1p6sttz", "팔로우"),
  },
  {
    id: "signals",
    label: careerT("ko", "career.company.watchlist_types.0kgfx63", "시그널"),
  },
];
