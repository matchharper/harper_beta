import { createContext, useContext } from "react";
import type { CareerWorkspaceTab } from "./CareerWorkspaceNav";
import type { CareerComposerPendingAction } from "@/lib/career/pendingActions";
import type { CareerOpportunitySavedStageFilter } from "./types";

export type CareerWorkspaceNavigationOptions = {
  historyTarget?: {
    historyTab: "new" | "saved" | "archived";
    roleId?: string;
    savedStage?: CareerOpportunitySavedStageFilter;
  };
};

// UI navigation only. Durable actions still run through their existing authenticated readers/executors.
export const CareerWorkspaceNavigationContext = createContext<{
  openChat: () => void;
  openChatAction: (action: CareerComposerPendingAction) => void;
  navigate: (
    tab: CareerWorkspaceTab,
    options?: CareerWorkspaceNavigationOptions
  ) => void;
} | null>(null);
export const useCareerWorkspaceNavigation = () =>
  useContext(CareerWorkspaceNavigationContext);
