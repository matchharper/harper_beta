import { useCallback, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerTalentPreferences,
  SessionResponse,
} from "@/components/career/types";
import { getTalentCareerMoveIntentLabel } from "@/lib/talentNetworkApplication";
import {
  DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
  DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

type UseCareerTalentPreferencesArgs = {
  fetchWithAuth: FetchWithAuth;
  user: User | null;
};

type TalentPreferencesPayload = {
  preferences?: unknown;
  preferencesUpdatedAt?: string | null;
  error?: string;
};

const emptyPreferences = (): CareerTalentPreferences => ({
  engagementTypes: [],
  preferredLocations: [],
  careerMoveIntent: null,
  careerMoveIntentLabel: null,
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

  const careerMoveIntent =
    typeof record.careerMoveIntent === "string" && record.careerMoveIntent.trim()
      ? record.careerMoveIntent
      : null;

  return {
    engagementTypes: Array.isArray(record.engagementTypes)
      ? record.engagementTypes
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [],
    preferredLocations: Array.isArray(record.preferredLocations)
      ? record.preferredLocations
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [],
    careerMoveIntent,
    careerMoveIntentLabel: getTalentCareerMoveIntentLabel(careerMoveIntent),
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
    sameStringArray(left.preferredLocations, right.preferredLocations) &&
    left.careerMoveIntent === right.careerMoveIntent &&
    left.periodicIntervalDays === right.periodicIntervalDays &&
    left.recommendationBatchSize === right.recommendationBatchSize
  );
};

export const useCareerTalentPreferences = ({
  fetchWithAuth,
  user,
}: UseCareerTalentPreferencesArgs) => {
  const [talentPreferences, setTalentPreferences] =
    useState<CareerTalentPreferences | null>(null);
  const [savedTalentPreferences, setSavedTalentPreferences] =
    useState<CareerTalentPreferences | null>(null);
  const [talentPreferencesUpdatedAt, setTalentPreferencesUpdatedAt] =
    useState<string | null>(null);
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
          preferredLocations: talentPreferences.preferredLocations,
          careerMoveIntent: talentPreferences.careerMoveIntent,
          periodicIntervalDays: talentPreferences.periodicIntervalDays,
          recommendationBatchSize: talentPreferences.recommendationBatchSize,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as TalentPreferencesPayload;
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "프로필 선호 정보 저장에 실패했습니다.")
        );
      }

      applyPersistedTalentPreferences(
        payload.preferences ?? emptyPreferences(),
        payload.preferencesUpdatedAt
      );
      setTalentPreferencesSaveInfo("프로필 설정을 저장했습니다.");
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "프로필 선호 정보 저장에 실패했습니다.";
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
      onTalentPreferencesChange: updateTalentPreferences,
      onSaveTalentPreferences: saveTalentPreferences,
      onResetTalentPreferences: resetTalentPreferencesDraft,
      resetTalentPreferencesState,
    }),
    [
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
