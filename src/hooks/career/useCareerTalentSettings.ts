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
  updatedAt?: string | null;
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

const normalizeUpdatedAt = (value: unknown) => {
  if (typeof value !== "string") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
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
  const [savedProfileVisibility, setSavedProfileVisibility] =
    useState<CareerProfileVisibility>(DEFAULT_PROFILE_VISIBILITY);
  const [blockedCompanies, setBlockedCompanies] = useState<string[]>([]);
  const [savedBlockedCompanies, setSavedBlockedCompanies] = useState<string[]>(
    []
  );
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(
    null
  );

  const applyPersistedSettings = useCallback(
    (
      settings: {
        profileVisibility?: unknown;
        blockedCompanies?: unknown;
      },
      updatedAt?: unknown,
      options?: {
        preserveLocalBlockedCompanies?: boolean;
      }
    ) => {
      const nextVisibility = normalizeProfileVisibility(
        settings.profileVisibility
      );
      const nextBlockedCompanies = normalizeBlockedCompanies(
        settings.blockedCompanies
      );

      setProfileVisibility(nextVisibility);
      setSavedProfileVisibility(nextVisibility);
      if (!options?.preserveLocalBlockedCompanies) {
        setBlockedCompanies(nextBlockedCompanies);
      }
      setSavedBlockedCompanies(nextBlockedCompanies);
      setSettingsUpdatedAt(normalizeUpdatedAt(updatedAt));
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
        throw new Error(
          getErrorMessage(payload, "설정 정보를 불러오지 못했습니다.")
        );
      }

      if (requestId !== fetchRequestIdRef.current) {
        return;
      }
      applyPersistedSettings(payload.settings ?? {}, payload.updatedAt);
    } catch (error) {
      if (requestId !== fetchRequestIdRef.current) {
        return;
      }
      const message =
        error instanceof Error
          ? error.message
          : "설정 정보를 불러오지 못했습니다.";
      setSettingsError(message);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setSettingsLoading(false);
      }
    }
  }, [applyPersistedSettings, fetchWithAuth, userId]);

  useEffect(() => {
    if (authLoading) return;

    if (!userId) {
      fetchRequestIdRef.current += 1;
      saveRequestIdRef.current += 1;
      setSettingsLoading(false);
      setSettingsSaving(false);
      setSettingsError("");
      setProfileVisibility(DEFAULT_PROFILE_VISIBILITY);
      setSavedProfileVisibility(DEFAULT_PROFILE_VISIBILITY);
      setBlockedCompanies([]);
      setSavedBlockedCompanies([]);
      setSettingsUpdatedAt(null);
      return;
    }

    void fetchSettings();
  }, [authLoading, fetchSettings, userId]);

  const persistSettings = useCallback(
    async (nextSettings: {
      profileVisibility: CareerProfileVisibility;
      blockedCompanies?: string[];
      preserveLocalBlockedCompanies?: boolean;
    }) => {
      if (!userId || settingsSaving) return false;

      const requestId = ++saveRequestIdRef.current;
      const requestBody: {
        profileVisibility: CareerProfileVisibility;
        blockedCompanies?: string[];
      } = {
        profileVisibility: nextSettings.profileVisibility,
      };
      if (nextSettings.blockedCompanies !== undefined) {
        requestBody.blockedCompanies = nextSettings.blockedCompanies;
      }

      setSettingsSaving(true);
      setSettingsError("");
      try {
        const response = await fetchWithAuth("/api/talent/settings", {
          method: "POST",
          body: JSON.stringify(requestBody),
        });
        const payload = (await response
          .json()
          .catch(() => ({}))) as SettingsPayload;
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "설정 저장에 실패했습니다.")
          );
        }

        if (requestId !== saveRequestIdRef.current) {
          return false;
        }
        applyPersistedSettings(payload.settings ?? {}, payload.updatedAt, {
          preserveLocalBlockedCompanies:
            nextSettings.preserveLocalBlockedCompanies,
        });
        return true;
      } catch (error) {
        if (requestId !== saveRequestIdRef.current) {
          return false;
        }
        const message =
          error instanceof Error ? error.message : "설정 저장에 실패했습니다.";
        setSettingsError(message);
        return false;
      } finally {
        if (requestId === saveRequestIdRef.current) {
          setSettingsSaving(false);
        }
      }
    },
    [applyPersistedSettings, fetchWithAuth, settingsSaving, userId]
  );

  const saveSettings = useCallback(async () => {
    return persistSettings({
      profileVisibility,
      blockedCompanies,
    });
  }, [blockedCompanies, persistSettings, profileVisibility]);

  const updateProfileVisibility = useCallback(
    async (value: CareerProfileVisibility) => {
      const nextVisibility = normalizeProfileVisibility(value);
      if (
        settingsLoading ||
        settingsSaving ||
        nextVisibility === profileVisibility
      ) {
        return false;
      }

      setProfileVisibility(nextVisibility);
      setSettingsError("");

      const saved = await persistSettings({
        profileVisibility: nextVisibility,
        preserveLocalBlockedCompanies: true,
      });
      if (!saved) {
        setProfileVisibility(savedProfileVisibility);
      }
      return saved;
    },
    [
      persistSettings,
      profileVisibility,
      savedProfileVisibility,
      settingsLoading,
      settingsSaving,
    ]
  );

  const addBlockedCompany = useCallback(
    async (rawName: string) => {
      const nextCompany = String(rawName ?? "").trim();
      if (!nextCompany || settingsLoading || settingsSaving) return false;

      const nextBlockedCompanies = normalizeBlockedCompanies([
        ...blockedCompanies,
        nextCompany,
      ]);
      if (sameStringArray(nextBlockedCompanies, blockedCompanies)) return true;

      setBlockedCompanies(nextBlockedCompanies);
      setSettingsError("");

      const saved = await persistSettings({
        profileVisibility,
        blockedCompanies: nextBlockedCompanies,
      });
      if (!saved) {
        setBlockedCompanies(blockedCompanies);
      }
      return saved;
    },
    [
      blockedCompanies,
      persistSettings,
      profileVisibility,
      settingsLoading,
      settingsSaving,
    ]
  );

  const removeBlockedCompany = useCallback(
    async (companyName: string) => {
      if (settingsLoading || settingsSaving) return false;

      const nextBlockedCompanies = blockedCompanies.filter(
        (company) => company !== companyName
      );
      if (sameStringArray(nextBlockedCompanies, blockedCompanies)) return true;

      setBlockedCompanies(nextBlockedCompanies);
      setSettingsError("");

      const saved = await persistSettings({
        profileVisibility,
        blockedCompanies: nextBlockedCompanies,
      });
      if (!saved) {
        setBlockedCompanies(blockedCompanies);
      }
      return saved;
    },
    [
      blockedCompanies,
      persistSettings,
      profileVisibility,
      settingsLoading,
      settingsSaving,
    ]
  );

  const resetTalentSettings = useCallback(() => {
    setProfileVisibility(savedProfileVisibility);
    setBlockedCompanies(savedBlockedCompanies);
    setSettingsError("");
  }, [savedBlockedCompanies, savedProfileVisibility]);

  const hasUnsavedTalentSettingsChanges = useMemo(
    () =>
      profileVisibility !== savedProfileVisibility ||
      !sameStringArray(blockedCompanies, savedBlockedCompanies),
    [
      blockedCompanies,
      profileVisibility,
      savedBlockedCompanies,
      savedProfileVisibility,
    ]
  );

  return useMemo(
    () => ({
      settingsLoading,
      settingsSaving,
      settingsError,
      settingsUpdatedAt,
      profileVisibility,
      blockedCompanies,
      hasUnsavedTalentSettingsChanges,
      onProfileVisibilityChange: updateProfileVisibility,
      onAddBlockedCompany: addBlockedCompany,
      onRemoveBlockedCompany: removeBlockedCompany,
      onSaveTalentSettings: saveSettings,
      onResetTalentSettings: resetTalentSettings,
      onReloadTalentSettings: fetchSettings,
    }),
    [
      addBlockedCompany,
      blockedCompanies,
      fetchSettings,
      hasUnsavedTalentSettingsChanges,
      profileVisibility,
      removeBlockedCompany,
      resetTalentSettings,
      saveSettings,
      settingsError,
      settingsLoading,
      settingsSaving,
      settingsUpdatedAt,
      updateProfileVisibility,
    ]
  );
};
