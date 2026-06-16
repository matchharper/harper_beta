import { useCallback, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerTalentPreferences,
  SessionResponse,
} from "@/components/career/types";
import {
  DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION,
  DEFAULT_TALENT_GET_INTERNAL_RECOMMENDATION,
  DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
  DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
  normalizeTalentRecommendationToggle,
} from "@/lib/talentOnboarding/recommendationSettings";
import { getErrorMessage } from "./careerHelpers";
import { showOpportunityDiscoveryStartedToast } from "./opportunityDiscoveryToast";
import type { FetchWithAuth } from "./useCareerApi";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

type UseCareerTalentPreferencesArgs = {
  fetchWithAuth: FetchWithAuth;
  user: User | null;
};

type TalentPreferencesPayload = {
  opportunityDiscoveryQueued?: boolean;
  opportunityRunId?: string | null;
  preferences?: unknown;
  preferencesUpdatedAt?: string | null;
  error?: string;
};

const emptyPreferences = (): CareerTalentPreferences => ({
  engagementTypes: [],
  getExternalRecommendation: DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION,
  getInternalRecommendation: DEFAULT_TALENT_GET_INTERNAL_RECOMMENDATION,
  isOnboardingDone: false,
  periodicIntervalDays: DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
  recommendationBatchSize: DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
});

const normalizeUpdatedAt = (value: unknown) => {
  if (typeof value !== "string") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
};

const cloneTalentPreferences = (value: unknown): CareerTalentPreferences => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<CareerTalentPreferences>)
      : null;
  if (!record) return emptyPreferences();

  return {
    engagementTypes: Array.isArray(record.engagementTypes)
      ? record.engagementTypes
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [],
    getExternalRecommendation: normalizeTalentRecommendationToggle(
      record.getExternalRecommendation
    ),
    getInternalRecommendation: normalizeTalentRecommendationToggle(
      record.getInternalRecommendation
    ),
    isOnboardingDone: Boolean(record.isOnboardingDone),
    periodicIntervalDays: normalizeTalentPeriodicIntervalDays(
      record.periodicIntervalDays
    ),
    recommendationBatchSize: normalizeTalentRecommendationBatchSize(
      record.recommendationBatchSize
    ),
  };
};

const sameStringArray = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const sameTalentPreferences = (
  left: CareerTalentPreferences | null,
  right: CareerTalentPreferences | null
) => {
  if (left === right) return true;
  if (!left || !right) return false;

  return (
    sameStringArray(left.engagementTypes, right.engagementTypes) &&
    left.getExternalRecommendation === right.getExternalRecommendation &&
    left.getInternalRecommendation === right.getInternalRecommendation &&
    left.isOnboardingDone === right.isOnboardingDone &&
    left.periodicIntervalDays === right.periodicIntervalDays &&
    left.recommendationBatchSize === right.recommendationBatchSize
  );
};

export const useCareerTalentPreferences = ({
  fetchWithAuth,
  user,
}: UseCareerTalentPreferencesArgs) => {
  const tCareer = useCareerMessageFormatter();
  const [talentPreferences, setTalentPreferences] =
    useState<CareerTalentPreferences | null>(null);
  const [savedTalentPreferences, setSavedTalentPreferences] =
    useState<CareerTalentPreferences | null>(null);
  const [talentPreferencesUpdatedAt, setTalentPreferencesUpdatedAt] = useState<
    string | null
  >(null);
  const [talentPreferencesSavePending, setTalentPreferencesSavePending] =
    useState(false);
  const [talentPreferencesSaveError, setTalentPreferencesSaveError] =
    useState("");
  const [talentPreferencesSaveInfo, setTalentPreferencesSaveInfo] =
    useState("");

  const applyPersistedTalentPreferences = useCallback(
    (next: unknown, updatedAt?: unknown) => {
      const normalized = cloneTalentPreferences(next);
      setTalentPreferences(normalized);
      setSavedTalentPreferences(normalized);
      setTalentPreferencesUpdatedAt(normalizeUpdatedAt(updatedAt));
    },
    []
  );

  const applySessionTalentPreferences = useCallback(
    (payload: SessionResponse) => {
      applyPersistedTalentPreferences(
        payload.talentPreferences ?? emptyPreferences(),
        payload.profileSettingsMeta?.talentPreferencesUpdatedAt
      );
      setTalentPreferencesSaveError("");
      setTalentPreferencesSaveInfo("");
    },
    [applyPersistedTalentPreferences]
  );

  const updateTalentPreferences = useCallback(
    (
      updater:
        | CareerTalentPreferences
        | null
        | ((
            current: CareerTalentPreferences | null
          ) => CareerTalentPreferences | null)
    ) => {
      setTalentPreferences((current) =>
        typeof updater === "function" ? updater(current) : updater
      );
      setTalentPreferencesSaveError("");
      setTalentPreferencesSaveInfo("");
    },
    []
  );

  const saveTalentPreferences = useCallback(async () => {
    if (!user || !talentPreferences || talentPreferencesSavePending) {
      return false;
    }

    setTalentPreferencesSavePending(true);
    setTalentPreferencesSaveError("");
    setTalentPreferencesSaveInfo("");

    try {
      const response = await fetchWithAuth("/api/talent/preferences", {
        method: "POST",
        body: JSON.stringify({
          engagementTypes: talentPreferences.engagementTypes,
          getExternalRecommendation:
            talentPreferences.getExternalRecommendation,
          getInternalRecommendation:
            talentPreferences.getInternalRecommendation,
          periodicIntervalDays: talentPreferences.periodicIntervalDays,
          recommendationBatchSize: talentPreferences.recommendationBatchSize,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as TalentPreferencesPayload;
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, tCareer(H.talentPreferencesSaveFailed))
        );
      }

      applyPersistedTalentPreferences(
        payload.preferences ?? emptyPreferences(),
        payload.preferencesUpdatedAt
      );
      if (payload.opportunityDiscoveryQueued) {
        showOpportunityDiscoveryStartedToast(
          tCareer(H.opportunityDiscoveryStarted)
        );
      }
      setTalentPreferencesSaveInfo(tCareer(H.talentPreferencesSaved));
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : tCareer(H.talentPreferencesSaveFailed);
      setTalentPreferencesSaveError(message);
      return false;
    } finally {
      setTalentPreferencesSavePending(false);
    }
  }, [
    applyPersistedTalentPreferences,
    fetchWithAuth,
    talentPreferences,
    talentPreferencesSavePending,
    tCareer,
    user,
  ]);

  const resetTalentPreferencesDraft = useCallback(() => {
    setTalentPreferences(cloneTalentPreferences(savedTalentPreferences));
    setTalentPreferencesSaveError("");
    setTalentPreferencesSaveInfo("");
  }, [savedTalentPreferences]);

  const resetTalentPreferencesState = useCallback(() => {
    setTalentPreferences(null);
    setSavedTalentPreferences(null);
    setTalentPreferencesUpdatedAt(null);
    setTalentPreferencesSavePending(false);
    setTalentPreferencesSaveError("");
    setTalentPreferencesSaveInfo("");
  }, []);

  const hasUnsavedTalentPreferencesChanges = useMemo(
    () => !sameTalentPreferences(talentPreferences, savedTalentPreferences),
    [savedTalentPreferences, talentPreferences]
  );

  return useMemo(
    () => ({
      talentPreferences,
      talentPreferencesUpdatedAt,
      talentPreferencesSavePending,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      hasUnsavedTalentPreferencesChanges,
      applySessionTalentPreferences,
      applyPersistedTalentPreferences,
      onTalentPreferencesChange: updateTalentPreferences,
      onSaveTalentPreferences: saveTalentPreferences,
      onResetTalentPreferences: resetTalentPreferencesDraft,
      resetTalentPreferencesState,
    }),
    [
      applyPersistedTalentPreferences,
      applySessionTalentPreferences,
      hasUnsavedTalentPreferencesChanges,
      resetTalentPreferencesDraft,
      resetTalentPreferencesState,
      saveTalentPreferences,
      talentPreferences,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      talentPreferencesSavePending,
      talentPreferencesUpdatedAt,
      updateTalentPreferences,
    ]
  );
};
