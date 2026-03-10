import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

export type CareerProfileVisibility =
  | "open_to_matches"
  | "exceptional_only"
  | "dont_share";

const DEFAULT_PROFILE_VISIBILITY: CareerProfileVisibility = "exceptional_only";

type SettingsPayload = {
  settings?: {
    profileVisibility?: string;
    blockedCompanies?: string[];
  };
  error?: string;
};

type UseCareerTalentSettingsArgs = {
  userId: string | null;
  authLoading: boolean;
  fetchWithAuth: FetchWithAuth;
};

const normalizeProfileVisibility = (
  value: unknown
): CareerProfileVisibility => {
  const candidate = String(value ?? "").trim();
  if (
    candidate === "open_to_matches" ||
    candidate === "exceptional_only" ||
    candidate === "dont_share"
  ) {
    return candidate;
  }
  return DEFAULT_PROFILE_VISIBILITY;
};

const normalizeBlockedCompanies = (companies: unknown): string[] => {
  if (!Array.isArray(companies)) return [];

  const unique = new Map<string, string>();
  for (const raw of companies) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (unique.has(lower)) continue;
    unique.set(lower, name.slice(0, 120));
  }
  return Array.from(unique.values());
};

const sameStringArray = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

export const useCareerTalentSettings = ({
  userId,
  authLoading,
  fetchWithAuth,
}: UseCareerTalentSettingsArgs) => {
  const fetchRequestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [profileVisibility, setProfileVisibility] =
    useState<CareerProfileVisibility>(DEFAULT_PROFILE_VISIBILITY);
  const [blockedCompanies, setBlockedCompanies] = useState<string[]>([]);

  const applySettings = useCallback(
    (settings: { profileVisibility?: unknown; blockedCompanies?: unknown }) => {
      setProfileVisibility(normalizeProfileVisibility(settings.profileVisibility));
      setBlockedCompanies(normalizeBlockedCompanies(settings.blockedCompanies));
    },
    []
  );

  const fetchSettings = useCallback(async () => {
    if (!userId) return;

    const requestId = ++fetchRequestIdRef.current;
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const response = await fetchWithAuth("/api/talent/settings");
      const payload = (await response
        .json()
        .catch(() => ({}))) as SettingsPayload;
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "설정 정보를 불러오지 못했습니다."));
      }

      if (requestId !== fetchRequestIdRef.current) {
        return;
      }
      applySettings(payload.settings ?? {});
    } catch (error) {
      if (requestId !== fetchRequestIdRef.current) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "설정 정보를 불러오지 못했습니다.";
      setSettingsError(message);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setSettingsLoading(false);
      }
    }
  }, [applySettings, fetchWithAuth, userId]);

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      fetchRequestIdRef.current += 1;
      saveRequestIdRef.current += 1;
      setSettingsLoading(false);
      setSettingsSaving(false);
      setSettingsError("");
      setProfileVisibility(DEFAULT_PROFILE_VISIBILITY);
      setBlockedCompanies([]);
      return;
    }

    void fetchSettings();
  }, [authLoading, fetchSettings, userId]);

  const saveSettings = useCallback(
    async (next: {
      profileVisibility: CareerProfileVisibility;
      blockedCompanies: string[];
    }) => {
      if (!userId) return;

      const requestId = ++saveRequestIdRef.current;
      setSettingsSaving(true);
      setSettingsError("");
      try {
        const response = await fetchWithAuth("/api/talent/settings", {
          method: "POST",
          body: JSON.stringify(next),
        });
        const payload = (await response
          .json()
          .catch(() => ({}))) as SettingsPayload;
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "설정 저장에 실패했습니다."));
        }

        if (requestId !== saveRequestIdRef.current) {
          return;
        }
        applySettings(payload.settings ?? next);
      } catch (error) {
        if (requestId !== saveRequestIdRef.current) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "설정 저장에 실패했습니다.";
        setSettingsError(message);
      } finally {
        if (requestId === saveRequestIdRef.current) {
          setSettingsSaving(false);
        }
      }
    },
    [applySettings, fetchWithAuth, userId]
  );

  const updateProfileVisibility = useCallback(
    (value: CareerProfileVisibility) => {
      const nextVisibility = normalizeProfileVisibility(value);
      if (nextVisibility === profileVisibility) return;

      const nextBlockedCompanies = blockedCompanies;
      setProfileVisibility(nextVisibility);
      void saveSettings({
        profileVisibility: nextVisibility,
        blockedCompanies: nextBlockedCompanies,
      });
    },
    [blockedCompanies, profileVisibility, saveSettings]
  );

  const addBlockedCompany = useCallback(
    (rawName: string) => {
      const nextCompany = String(rawName ?? "").trim();
      if (!nextCompany) return;

      const nextBlockedCompanies = normalizeBlockedCompanies([
        ...blockedCompanies,
        nextCompany,
      ]);
      if (sameStringArray(nextBlockedCompanies, blockedCompanies)) return;

      setBlockedCompanies(nextBlockedCompanies);
      void saveSettings({
        profileVisibility,
        blockedCompanies: nextBlockedCompanies,
      });
    },
    [blockedCompanies, profileVisibility, saveSettings]
  );

  const removeBlockedCompany = useCallback(
    (companyName: string) => {
      const nextBlockedCompanies = blockedCompanies.filter(
        (company) => company !== companyName
      );
      if (sameStringArray(nextBlockedCompanies, blockedCompanies)) return;

      setBlockedCompanies(nextBlockedCompanies);
      void saveSettings({
        profileVisibility,
        blockedCompanies: nextBlockedCompanies,
      });
    },
    [blockedCompanies, profileVisibility, saveSettings]
  );

  return useMemo(
    () => ({
      settingsLoading,
      settingsSaving,
      settingsError,
      profileVisibility,
      blockedCompanies,
      onProfileVisibilityChange: updateProfileVisibility,
      onAddBlockedCompany: addBlockedCompany,
      onRemoveBlockedCompany: removeBlockedCompany,
      onReloadTalentSettings: fetchSettings,
    }),
    [
      addBlockedCompany,
      blockedCompanies,
      fetchSettings,
      profileVisibility,
      removeBlockedCompany,
      settingsError,
      settingsLoading,
      settingsSaving,
      updateProfileVisibility,
    ]
  );
};
