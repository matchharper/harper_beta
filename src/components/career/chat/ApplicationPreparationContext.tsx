import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { toUiMessage } from "@/hooks/career/careerHelpers";
import { useCareerChatPanelContext } from "../CareerChatPanelContext";
import type { CareerMessage } from "../types";
import type { SessionRecord } from "@/lib/career/simulation/sessionStore";
import type { PreparationResponse } from "@/lib/career/simulation/preparation";

// Kept for historical card readers. There is no active preparation mode.
export type PreparationCommand = {
  operation:
    | "clear"
    | "continue"
    | "respond"
    | "navigate"
    | "hide"
    | "show"
    | "generate"
    | "approve"
    | "attach"
    | "resume"
    | "end";
  itemId?: string;
  response?: PreparationResponse;
  documentId?: string;
  draftVersion?: number;
};
type Value = {
  record: SessionRecord | null;
  renderedReviewId?: string;
  onReviewRendered?: (id: string) => void;
  drafts: CareerMessage[];
  pending: boolean;
  error: string;
  command: (input: PreparationCommand) => Promise<boolean>;
};
const inactive: Value = {
  record: null,
  drafts: [],
  pending: false,
  error: "",
  command: async () => false,
};
export const ApplicationPreparationContext = createContext<Value>(inactive);
export const useApplicationPreparation = () =>
  useContext(ApplicationPreparationContext);
export const useApplicationHistory = useApplicationPreparation;

export function ApplicationHistoryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { conversationId } = useCareerChatPanelContext();
  const { fetchWithAuth } = useCareerApi();
  const [drafts, setDrafts] = useState<CareerMessage[]>([]);
  useEffect(() => {
    if (!conversationId) return;
    const controller = new AbortController();
    void fetchWithAuth(
      `/api/talent/simulation?conversationId=${encodeURIComponent(conversationId)}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        if (!controller.signal.aborted)
          setDrafts((result.outputs ?? []).map(toUiMessage));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [conversationId, fetchWithAuth]);
  const value = useMemo(() => ({ ...inactive, drafts }), [drafts]);
  return (
    <ApplicationPreparationContext.Provider value={value}>
      {children}
    </ApplicationPreparationContext.Provider>
  );
}
export const ApplicationPreparationProvider = ApplicationHistoryProvider;
