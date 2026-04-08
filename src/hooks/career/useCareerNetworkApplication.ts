import { useCallback, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerNetworkApplication,
  SessionResponse,
} from "@/components/career/types";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";
import { normalizeTalentNetworkApplication } from "@/lib/talentNetworkApplication";

type UseCareerNetworkApplicationArgs = {
  fetchWithAuth: FetchWithAuth;
  user: User | null;
};

type NetworkApplicationPayload = {
  networkApplication?: unknown;
  updatedAt?: string | null;
  error?: string;
};

const normalizeUpdatedAt = (value: unknown) => {
  if (typeof value !== "string") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
};

const cloneNetworkApplication = (value: unknown): CareerNetworkApplication | null =>
  (normalizeTalentNetworkApplication(value) as CareerNetworkApplication | null) ??
  null;

const sameStringArray = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const sameNetworkApplication = (
  left: CareerNetworkApplication | null,
  right: CareerNetworkApplication | null
) => {
  if (left === right) return true;
  if (!left || !right) return false;

  return (
    left.selectedRole === right.selectedRole &&
    sameStringArray(left.profileInputTypes, right.profileInputTypes) &&
    left.linkedinProfileUrl === right.linkedinProfileUrl &&
    left.githubProfileUrl === right.githubProfileUrl &&
    left.scholarProfileUrl === right.scholarProfileUrl &&
    left.personalWebsiteUrl === right.personalWebsiteUrl &&
    left.submittedAt === right.submittedAt
  );
};

export const useCareerNetworkApplication = ({
  fetchWithAuth,
  user,
}: UseCareerNetworkApplicationArgs) => {
  const [networkApplication, setNetworkApplication] =
    useState<CareerNetworkApplication | null>(null);
  const [savedNetworkApplication, setSavedNetworkApplication] =
    useState<CareerNetworkApplication | null>(null);
  const [networkApplicationUpdatedAt, setNetworkApplicationUpdatedAt] =
    useState<string | null>(null);
  const [networkApplicationSavePending, setNetworkApplicationSavePending] =
    useState(false);
  const [networkApplicationSaveError, setNetworkApplicationSaveError] =
    useState("");
  const [networkApplicationSaveInfo, setNetworkApplicationSaveInfo] =
    useState("");

  const applyPersistedNetworkApplication = useCallback(
    (next: unknown, updatedAt?: unknown) => {
      const normalized = cloneNetworkApplication(next);
      setNetworkApplication(normalized);
      setSavedNetworkApplication(normalized);
      setNetworkApplicationUpdatedAt(normalizeUpdatedAt(updatedAt));
    },
    []
  );

  const applySessionNetworkState = useCallback(
    (payload: SessionResponse) => {
      applyPersistedNetworkApplication(
        payload.networkApplication ?? null,
        payload.profileSettingsMeta?.networkApplicationUpdatedAt
      );
      setNetworkApplicationSaveError("");
      setNetworkApplicationSaveInfo("");
    },
    [applyPersistedNetworkApplication]
  );

  const updateNetworkApplication = useCallback(
    (
      updater:
        | CareerNetworkApplication
        | null
        | ((
            current: CareerNetworkApplication | null
          ) => CareerNetworkApplication | null)
    ) => {
      setNetworkApplication((current) =>
        typeof updater === "function" ? updater(current) : updater
      );
      setNetworkApplicationSaveError("");
      setNetworkApplicationSaveInfo("");
    },
    []
  );

  const saveNetworkApplication = useCallback(async () => {
    if (!user || !networkApplication || networkApplicationSavePending) return false;

    setNetworkApplicationSavePending(true);
    setNetworkApplicationSaveError("");
    setNetworkApplicationSaveInfo("");

    try {
      const response = await fetchWithAuth("/api/talent/network/profile", {
        method: "POST",
        body: JSON.stringify({
          networkApplication,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as NetworkApplicationPayload;
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "지원 정보 저장에 실패했습니다.")
        );
      }

      applyPersistedNetworkApplication(
        payload?.networkApplication ?? networkApplication,
        payload?.updatedAt
      );
      setNetworkApplicationSaveInfo("프로필 설정을 저장했습니다.");
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "지원 정보 저장에 실패했습니다.";
      setNetworkApplicationSaveError(message);
      return false;
    } finally {
      setNetworkApplicationSavePending(false);
    }
  }, [
    applyPersistedNetworkApplication,
    fetchWithAuth,
    networkApplication,
    networkApplicationSavePending,
    user,
  ]);

  const resetNetworkApplicationDraft = useCallback(() => {
    setNetworkApplication(cloneNetworkApplication(savedNetworkApplication));
    setNetworkApplicationSaveError("");
    setNetworkApplicationSaveInfo("");
  }, [savedNetworkApplication]);

  const resetNetworkApplicationState = useCallback(() => {
    setNetworkApplication(null);
    setSavedNetworkApplication(null);
    setNetworkApplicationUpdatedAt(null);
    setNetworkApplicationSavePending(false);
    setNetworkApplicationSaveError("");
    setNetworkApplicationSaveInfo("");
  }, []);

  const hasUnsavedNetworkApplicationChanges = useMemo(
    () => !sameNetworkApplication(networkApplication, savedNetworkApplication),
    [networkApplication, savedNetworkApplication]
  );

  return useMemo(
    () => ({
      networkApplication,
      networkApplicationUpdatedAt,
      networkApplicationSavePending,
      networkApplicationSaveError,
      networkApplicationSaveInfo,
      hasUnsavedNetworkApplicationChanges,
      applySessionNetworkState,
      onNetworkApplicationChange: updateNetworkApplication,
      onSaveNetworkApplication: saveNetworkApplication,
      onResetNetworkApplication: resetNetworkApplicationDraft,
      resetNetworkApplicationState,
    }),
    [
      applySessionNetworkState,
      hasUnsavedNetworkApplicationChanges,
      networkApplication,
      networkApplicationSaveError,
      networkApplicationSaveInfo,
      networkApplicationSavePending,
      networkApplicationUpdatedAt,
      resetNetworkApplicationDraft,
      resetNetworkApplicationState,
      saveNetworkApplication,
      updateNetworkApplication,
    ]
  );
};
