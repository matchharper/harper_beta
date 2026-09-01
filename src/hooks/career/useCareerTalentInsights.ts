import { useCallback, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerTalentInsights,
  SessionResponse,
} from "@/components/career/types";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

type UseCareerTalentInsightsArgs = {
  fetchWithAuth: FetchWithAuth;
  onOnboardingChecklistProgressRefreshed?: (progress: unknown) => void;
  user: User | null;
};

type TalentInsightsPayload = {
  talentInsights?: unknown;
  insightUpdatedAt?: string | null;
  onboardingChecklistProgress?: unknown;
  error?: string;
};

const normalizeUpdatedAt = (value: unknown) => {
  if (typeof value !== "string") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
};

const cloneTalentInsights = (value: unknown): CareerTalentInsights => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: CareerTalentInsights = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = String(rawKey ?? "").trim();
    const nextValue = String(rawValue ?? "").trim();
    if (!key || !nextValue) continue;
    normalized[key] = nextValue;
  }

  return normalized;
};

const toStableSignature = (insights: CareerTalentInsights | null) =>
  Object.entries(insights ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("\n");

export const useCareerTalentInsights = ({
  fetchWithAuth,
  onOnboardingChecklistProgressRefreshed,
  user,
}: UseCareerTalentInsightsArgs) => {
  const tCareer = useCareerMessageFormatter();
  const [talentInsights, setTalentInsights] =
    useState<CareerTalentInsights | null>(null);
  const [savedTalentInsights, setSavedTalentInsights] =
    useState<CareerTalentInsights | null>(null);
  const [talentInsightsUpdatedAt, setTalentInsightsUpdatedAt] = useState<
    string | null
  >(null);
  const [talentInsightsSavePending, setTalentInsightsSavePending] =
    useState(false);
  const [talentInsightsSaveError, setTalentInsightsSaveError] = useState("");
  const [talentInsightsSaveInfo, setTalentInsightsSaveInfo] = useState("");

  const applyPersistedTalentInsights = useCallback(
    (next: unknown, updatedAt?: unknown) => {
      const normalized = cloneTalentInsights(next);
      const nextSignature = toStableSignature(normalized);
      const nextUpdatedAt = normalizeUpdatedAt(updatedAt);
      setTalentInsights((current) =>
        current !== null && toStableSignature(current) === nextSignature
          ? current
          : normalized
      );
      setSavedTalentInsights((current) =>
        current !== null && toStableSignature(current) === nextSignature
          ? current
          : normalized
      );
      setTalentInsightsUpdatedAt((current) =>
        current === nextUpdatedAt ? current : nextUpdatedAt
      );
    },
    []
  );

  const applySessionTalentInsights = useCallback(
    (payload: SessionResponse) => {
      applyPersistedTalentInsights(
        payload.talentInsights ?? {},
        payload.profileSettingsMeta?.talentInsightsUpdatedAt
      );
      setTalentInsightsSaveError("");
      setTalentInsightsSaveInfo("");
    },
    [applyPersistedTalentInsights]
  );

  const updateTalentInsights = useCallback(
    (
      updater:
        | CareerTalentInsights
        | null
        | ((
            current: CareerTalentInsights | null
          ) => CareerTalentInsights | null)
    ) => {
      setTalentInsights((current) =>
        typeof updater === "function" ? updater(current) : updater
      );
      setTalentInsightsSaveError("");
      setTalentInsightsSaveInfo("");
    },
    []
  );

  const saveTalentInsights = useCallback(async () => {
    if (!user || !talentInsights || talentInsightsSavePending) {
      return false;
    }

    setTalentInsightsSavePending(true);
    setTalentInsightsSaveError("");
    setTalentInsightsSaveInfo("");

    try {
      const response = await fetchWithAuth("/api/talent/preferences", {
        method: "POST",
        body: JSON.stringify({
          insightContent: talentInsights,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as TalentInsightsPayload;
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, tCareer(H.harperInsightSaveFailed))
        );
      }

      applyPersistedTalentInsights(
        payload.talentInsights ?? {},
        payload.insightUpdatedAt
      );
      if ("onboardingChecklistProgress" in payload) {
        onOnboardingChecklistProgressRefreshed?.(
          payload.onboardingChecklistProgress
        );
      }
      setTalentInsightsSaveInfo(tCareer(H.harperInsightSaved));
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : tCareer(H.harperInsightSaveFailed);
      setTalentInsightsSaveError(message);
      return false;
    } finally {
      setTalentInsightsSavePending(false);
    }
  }, [
    applyPersistedTalentInsights,
    fetchWithAuth,
    onOnboardingChecklistProgressRefreshed,
    talentInsights,
    talentInsightsSavePending,
    tCareer,
    user,
  ]);

  const resetTalentInsightsDraft = useCallback(() => {
    setTalentInsights(cloneTalentInsights(savedTalentInsights));
    setTalentInsightsSaveError("");
    setTalentInsightsSaveInfo("");
  }, [savedTalentInsights]);

  const resetTalentInsightsState = useCallback(() => {
    setTalentInsights(null);
    setSavedTalentInsights(null);
    setTalentInsightsUpdatedAt(null);
    setTalentInsightsSavePending(false);
    setTalentInsightsSaveError("");
    setTalentInsightsSaveInfo("");
  }, []);

  const hasUnsavedTalentInsightsChanges = useMemo(
    () =>
      toStableSignature(talentInsights) !==
      toStableSignature(savedTalentInsights),
    [savedTalentInsights, talentInsights]
  );

  return useMemo(
    () => ({
      talentInsights,
      talentInsightsUpdatedAt,
      talentInsightsSavePending,
      talentInsightsSaveError,
      talentInsightsSaveInfo,
      hasUnsavedTalentInsightsChanges,
      applySessionTalentInsights,
      applyPersistedTalentInsights,
      onTalentInsightsChange: updateTalentInsights,
      onSaveTalentInsights: saveTalentInsights,
      onResetTalentInsights: resetTalentInsightsDraft,
      resetTalentInsightsState,
    }),
    [
      applyPersistedTalentInsights,
      applySessionTalentInsights,
      hasUnsavedTalentInsightsChanges,
      resetTalentInsightsDraft,
      resetTalentInsightsState,
      saveTalentInsights,
      talentInsights,
      talentInsightsSaveError,
      talentInsightsSaveInfo,
      talentInsightsSavePending,
      talentInsightsUpdatedAt,
      updateTalentInsights,
    ]
  );
};
