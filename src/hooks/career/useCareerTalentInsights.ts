import { useCallback, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerTalentInsights,
  SessionResponse,
} from "@/components/career/types";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

type UseCareerTalentInsightsArgs = {
  fetchWithAuth: FetchWithAuth;
  user: User | null;
};

type TalentInsightsPayload = {
  talentInsights?: unknown;
  insightUpdatedAt?: string | null;
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
  user,
}: UseCareerTalentInsightsArgs) => {
  const [talentInsights, setTalentInsights] =
    useState<CareerTalentInsights | null>(null);
  const [savedTalentInsights, setSavedTalentInsights] =
    useState<CareerTalentInsights | null>(null);
  const [talentInsightsUpdatedAt, setTalentInsightsUpdatedAt] =
    useState<string | null>(null);
  const [talentInsightsSavePending, setTalentInsightsSavePending] =
    useState(false);
  const [talentInsightsSaveError, setTalentInsightsSaveError] = useState("");
  const [talentInsightsSaveInfo, setTalentInsightsSaveInfo] = useState("");

  const applyPersistedTalentInsights = useCallback(
    (next: unknown, updatedAt?: unknown) => {
      const normalized = cloneTalentInsights(next);
      setTalentInsights(normalized);
      setSavedTalentInsights(normalized);
      setTalentInsightsUpdatedAt(normalizeUpdatedAt(updatedAt));
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
        | ((current: CareerTalentInsights | null) => CareerTalentInsights | null)
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
          getErrorMessage(payload, "Harper insight 저장에 실패했습니다.")
        );
      }

      applyPersistedTalentInsights(
        payload.talentInsights ?? {},
        payload.insightUpdatedAt
      );
      setTalentInsightsSaveInfo("Harper insight를 저장했습니다.");
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Harper insight 저장에 실패했습니다.";
      setTalentInsightsSaveError(message);
      return false;
    } finally {
      setTalentInsightsSavePending(false);
    }
  }, [
    applyPersistedTalentInsights,
    fetchWithAuth,
    talentInsights,
    talentInsightsSavePending,
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
      toStableSignature(talentInsights) !== toStableSignature(savedTalentInsights),
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
      onTalentInsightsChange: updateTalentInsights,
      onSaveTalentInsights: saveTalentInsights,
      onResetTalentInsights: resetTalentInsightsDraft,
      resetTalentInsightsState,
    }),
    [
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
