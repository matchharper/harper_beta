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

export const useCareerNetworkApplication = ({
  fetchWithAuth,
  user,
}: UseCareerNetworkApplicationArgs) => {
  const [networkApplication, setNetworkApplication] =
    useState<CareerNetworkApplication | null>(null);
  const [networkApplicationSavePending, setNetworkApplicationSavePending] =
    useState(false);
  const [networkApplicationSaveError, setNetworkApplicationSaveError] =
    useState("");
  const [networkApplicationSaveInfo, setNetworkApplicationSaveInfo] =
    useState("");

  const applySessionNetworkState = useCallback((payload: SessionResponse) => {
    setNetworkApplication(payload.networkApplication ?? null);
  }, []);

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
        typeof updater === "function"
          ? updater(current)
          : updater
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
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "지원 정보 저장에 실패했습니다.")
        );
      }

      const normalized =
        normalizeTalentNetworkApplication(payload?.networkApplication) ?? null;
      setNetworkApplication(normalized as CareerNetworkApplication | null);
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
  }, [fetchWithAuth, networkApplication, networkApplicationSavePending, user]);

  const resetNetworkApplicationState = useCallback(() => {
    setNetworkApplication(null);
    setNetworkApplicationSavePending(false);
    setNetworkApplicationSaveError("");
    setNetworkApplicationSaveInfo("");
  }, []);

  return useMemo(
    () => ({
      networkApplication,
      networkApplicationSavePending,
      networkApplicationSaveError,
      networkApplicationSaveInfo,
      applySessionNetworkState,
      onNetworkApplicationChange: updateNetworkApplication,
      onSaveNetworkApplication: saveNetworkApplication,
      resetNetworkApplicationState,
    }),
    [
      applySessionNetworkState,
      networkApplication,
      networkApplicationSaveError,
      networkApplicationSaveInfo,
      networkApplicationSavePending,
      resetNetworkApplicationState,
      saveNetworkApplication,
      updateNetworkApplication,
    ]
  );
};
