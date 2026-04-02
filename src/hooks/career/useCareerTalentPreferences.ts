import { useCallback, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerTalentPreferences,
  SessionResponse,
} from "@/components/career/types";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

type UseCareerTalentPreferencesArgs = {
  fetchWithAuth: FetchWithAuth;
  user: User | null;
};

const emptyPreferences = (): CareerTalentPreferences => ({
  engagementTypes: [],
  preferredLocations: [],
  careerMoveIntent: null,
  careerMoveIntentLabel: null,
  technicalStrengths: null,
  desiredTeams: null,
});

export const useCareerTalentPreferences = ({
  fetchWithAuth,
  user,
}: UseCareerTalentPreferencesArgs) => {
  const [talentPreferences, setTalentPreferences] =
    useState<CareerTalentPreferences | null>(null);
  const [talentPreferencesSavePending, setTalentPreferencesSavePending] =
    useState(false);
  const [talentPreferencesSaveError, setTalentPreferencesSaveError] =
    useState("");
  const [talentPreferencesSaveInfo, setTalentPreferencesSaveInfo] =
    useState("");

  const applySessionTalentPreferences = useCallback(
    (payload: SessionResponse) => {
      setTalentPreferences(payload.talentPreferences ?? emptyPreferences());
    },
    []
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
          technicalStrengths: talentPreferences.technicalStrengths,
          desiredTeams: talentPreferences.desiredTeams,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "프로필 선호 정보 저장에 실패했습니다.")
        );
      }

      setTalentPreferences(payload.preferences ?? emptyPreferences());
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
  }, [fetchWithAuth, talentPreferences, talentPreferencesSavePending, user]);

  const resetTalentPreferencesState = useCallback(() => {
    setTalentPreferences(null);
    setTalentPreferencesSavePending(false);
    setTalentPreferencesSaveError("");
    setTalentPreferencesSaveInfo("");
  }, []);

  return useMemo(
    () => ({
      talentPreferences,
      talentPreferencesSavePending,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      applySessionTalentPreferences,
      onTalentPreferencesChange: updateTalentPreferences,
      onSaveTalentPreferences: saveTalentPreferences,
      resetTalentPreferencesState,
    }),
    [
      applySessionTalentPreferences,
      resetTalentPreferencesState,
      saveTalentPreferences,
      talentPreferences,
      talentPreferencesSaveError,
      talentPreferencesSaveInfo,
      talentPreferencesSavePending,
      updateTalentPreferences,
    ]
  );
};
