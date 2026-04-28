import { useCallback, useMemo, useState } from "react";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityFeedback,
  CareerOpportunitySavedStage,
} from "@/components/career/types";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import {
  getDefaultSavedStage,
  normalizeHistoryOpportunities,
} from "@/hooks/career/careerSessionData";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";

export function useCareerHistoryState(args: {
  fetchWithAuth: FetchWithAuth;
}) {
  const { fetchWithAuth } = args;
  const [historyOpportunities, setHistoryOpportunities] = useState<
    CareerHistoryOpportunity[]
  >([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyUpdatingOpportunityIds, setHistoryUpdatingOpportunityIds] =
    useState<string[]>([]);
  const [historyUpdateError, setHistoryUpdateError] = useState("");

  const historyOpportunityById = useMemo(
    () =>
      new Map(
        historyOpportunities.map((opportunity) => [opportunity.id, opportunity])
      ),
    [historyOpportunities]
  );

  const updateHistoryOpportunityLocally = useCallback(
    (
      opportunityId: string,
      updater: (current: CareerHistoryOpportunity) => CareerHistoryOpportunity
    ) => {
      setHistoryOpportunities((current) =>
        current.map((item) =>
          item.id === opportunityId ? updater(item) : item
        )
      );
    },
    []
  );

  const restoreHistoryOpportunity = useCallback(
    (opportunityId: string, previousItem: CareerHistoryOpportunity) => {
      setHistoryOpportunities((current) =>
        current.map((item) => (item.id === opportunityId ? previousItem : item))
      );
    },
    []
  );

  const beginHistoryUpdate = useCallback((opportunityId: string) => {
    setHistoryUpdateError("");
    setHistoryUpdatingOpportunityIds((current) =>
      current.includes(opportunityId) ? current : [...current, opportunityId]
    );
  }, []);

  const endHistoryUpdate = useCallback((opportunityId: string) => {
    setHistoryUpdatingOpportunityIds((current) =>
      current.filter((item) => item !== opportunityId)
    );
  }, []);

  const patchHistoryOpportunity = useCallback(
    async (body: {
      action: "feedback" | "saved_stage" | "view" | "click";
      feedback?: CareerHistoryOpportunityFeedback | null;
      feedbackReason?: string | null;
      opportunityId: string;
      savedStage?: CareerOpportunitySavedStage | null;
    }) => {
      const response = await fetchWithAuth("/api/talent/opportunities", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "기회 상태를 업데이트하지 못했습니다.")
        );
      }
    },
    [fetchWithAuth]
  );

  const onUpdateHistoryOpportunityFeedback = useCallback(
    async (
      opportunityId: string,
      feedback: CareerHistoryOpportunityFeedback | null,
      options?: {
        feedbackReason?: string | null;
        savedStage?: CareerOpportunitySavedStage | null;
      }
    ) => {
      const normalizedOpportunityId = opportunityId.trim();
      if (!normalizedOpportunityId) return;

      const previousItem = historyOpportunityById.get(normalizedOpportunityId);
      if (!previousItem) return;
      const now = new Date().toISOString();
      const nextSavedStage =
        feedback === "positive"
          ? (options?.savedStage ??
            previousItem.savedStage ??
            getDefaultSavedStage(previousItem))
          : null;

      beginHistoryUpdate(normalizedOpportunityId);
      updateHistoryOpportunityLocally(normalizedOpportunityId, (item) => ({
        ...item,
        dismissedAt: feedback === "negative" ? now : null,
        feedback,
        feedbackAt: feedback ? now : null,
        feedbackReason: feedback ? (options?.feedbackReason ?? null) : null,
        savedStage: nextSavedStage,
      }));

      try {
        await patchHistoryOpportunity({
          action: "feedback",
          feedback,
          feedbackReason: options?.feedbackReason ?? null,
          opportunityId: normalizedOpportunityId,
          savedStage: nextSavedStage,
        });
      } catch (error) {
        restoreHistoryOpportunity(normalizedOpportunityId, previousItem);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : "기회 상태를 업데이트하지 못했습니다."
        );
      } finally {
        endHistoryUpdate(normalizedOpportunityId);
      }
    },
    [
      beginHistoryUpdate,
      endHistoryUpdate,
      historyOpportunityById,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      updateHistoryOpportunityLocally,
    ]
  );

  const onUpdateHistoryOpportunitySavedStage = useCallback(
    async (opportunityId: string, savedStage: CareerOpportunitySavedStage) => {
      const normalizedOpportunityId = opportunityId.trim();
      if (!normalizedOpportunityId) return;

      const previousItem = historyOpportunityById.get(normalizedOpportunityId);
      if (!previousItem) return;

      beginHistoryUpdate(normalizedOpportunityId);
      updateHistoryOpportunityLocally(normalizedOpportunityId, (item) => ({
        ...item,
        feedback: "positive",
        savedStage,
      }));

      try {
        await patchHistoryOpportunity({
          action: "saved_stage",
          opportunityId: normalizedOpportunityId,
          savedStage,
        });
      } catch (error) {
        restoreHistoryOpportunity(normalizedOpportunityId, previousItem);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : "기회 상태를 업데이트하지 못했습니다."
        );
      } finally {
        endHistoryUpdate(normalizedOpportunityId);
      }
    },
    [
      beginHistoryUpdate,
      endHistoryUpdate,
      historyOpportunityById,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      updateHistoryOpportunityLocally,
    ]
  );

  const onMarkHistoryOpportunityViewed = useCallback(
    async (opportunityId: string) => {
      const normalizedOpportunityId = opportunityId.trim();
      if (!normalizedOpportunityId) return;

      const currentItem = historyOpportunityById.get(normalizedOpportunityId);
      if (!currentItem || currentItem.viewedAt) return;
      const now = new Date().toISOString();

      updateHistoryOpportunityLocally(normalizedOpportunityId, (item) => ({
        ...item,
        viewedAt: now,
      }));

      try {
        await patchHistoryOpportunity({
          action: "view",
          opportunityId: normalizedOpportunityId,
        });
      } catch (error) {
        restoreHistoryOpportunity(normalizedOpportunityId, currentItem);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : "기회 상태를 업데이트하지 못했습니다."
        );
      }
    },
    [
      historyOpportunityById,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      updateHistoryOpportunityLocally,
    ]
  );

  const onMarkHistoryOpportunityClicked = useCallback(
    async (opportunityId: string) => {
      const normalizedOpportunityId = opportunityId.trim();
      if (!normalizedOpportunityId) return;

      const currentItem = historyOpportunityById.get(normalizedOpportunityId);
      if (!currentItem || currentItem.clickedAt) return;
      const now = new Date().toISOString();

      updateHistoryOpportunityLocally(normalizedOpportunityId, (item) => ({
        ...item,
        clickedAt: now,
      }));

      try {
        await patchHistoryOpportunity({
          action: "click",
          opportunityId: normalizedOpportunityId,
        });
      } catch (error) {
        restoreHistoryOpportunity(normalizedOpportunityId, currentItem);
        setHistoryUpdateError(
          error instanceof Error
            ? error.message
            : "기회 상태를 업데이트하지 못했습니다."
        );
      }
    },
    [
      historyOpportunityById,
      patchHistoryOpportunity,
      restoreHistoryOpportunity,
      updateHistoryOpportunityLocally,
    ]
  );

  const onSendHistoryOpportunityQuestion = useCallback(
    async (opportunityId: string, question: string) => {
      const normalizedOpportunityId = opportunityId.trim();
      const normalizedQuestion = question.trim();

      if (!normalizedOpportunityId || !normalizedQuestion) {
        return false;
      }

      const currentItem = historyOpportunityById.get(normalizedOpportunityId);
      if (!currentItem) return false;

      beginHistoryUpdate(normalizedOpportunityId);

      try {
        const response = await fetchWithAuth(
          "/api/talent/opportunities/question",
          {
            method: "POST",
            body: JSON.stringify({
              opportunityId: normalizedOpportunityId,
              question: normalizedQuestion,
            }),
          }
        );
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "질문을 전송하지 못했습니다.")
          );
        }

        return true;
      } catch (error) {
        setHistoryUpdateError(
          error instanceof Error ? error.message : "질문을 전송하지 못했습니다."
        );
        return false;
      } finally {
        endHistoryUpdate(normalizedOpportunityId);
      }
    },
    [
      beginHistoryUpdate,
      endHistoryUpdate,
      fetchWithAuth,
      historyOpportunityById,
    ]
  );

  const hydrateHistoryOpportunities = useCallback(
    (value: unknown) => {
      setHistoryOpportunities(
        normalizeHistoryOpportunities(
          value as Parameters<typeof normalizeHistoryOpportunities>[0]
        )
      );
      setHistoryUpdatingOpportunityIds([]);
      setHistoryUpdateError("");
    },
    []
  );

  const resetHistoryState = useCallback(() => {
    setHistoryOpportunities([]);
    setHistoryLoaded(false);
    setHistoryUpdatingOpportunityIds([]);
    setHistoryUpdateError("");
  }, []);

  return {
    historyLoaded,
    setHistoryLoaded,
    historyOpportunities,
    historyOpportunityById,
    historyUpdateError,
    historyUpdatingOpportunityIds,
    hydrateHistoryOpportunities,
    onMarkHistoryOpportunityClicked,
    onMarkHistoryOpportunityViewed,
    onSendHistoryOpportunityQuestion,
    onUpdateHistoryOpportunityFeedback,
    onUpdateHistoryOpportunitySavedStage,
    resetHistoryState,
  };
}
