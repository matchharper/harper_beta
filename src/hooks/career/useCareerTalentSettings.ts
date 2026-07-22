import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";
import {
  TALENT_NETWORK_ENGAGEMENT_OPTIONS,
  type TalentNetworkEngagementOptionId,
} from "@/lib/talentNetworkOptions";

export type CareerProfileVisibility =
  | "open_to_matches"
  | "exceptional_only"
  | "dont_share";
export type CareerEngagementType = TalentNetworkEngagementOptionId;

const DEFAULT_PROFILE_VISIBILITY: CareerProfileVisibility = "exceptional_only";
const ALLOWED_ENGAGEMENT_TYPES = new Set<CareerEngagementType>(
  TALENT_NETWORK_ENGAGEMENT_OPTIONS.map((option) => option.id)
);

type SettingsPayload = {
  settings?: {
    engagementTypes?: string[];
    profileVisibility?: string;
    blockedCompanies?: string[];
    preferredLocale?: string | null;
    effectivePreferredLocale?: string | null;
  };
  updatedAt?: string | null;
  error?: string;
};

type UseCareerTalentSettingsArgs = {
  enabled?: boolean;
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

const normalizeEngagementTypes = (values: unknown): CareerEngagementType[] => {
  if (!Array.isArray(values)) return [];

  const selected = new Set<CareerEngagementType>();
  for (const raw of values) {
    const value = String(raw ?? "").trim() as CareerEngagementType;
    if (ALLOWED_ENGAGEMENT_TYPES.has(value)) {
      selected.add(value);
    }
  }

  return TALENT_NETWORK_ENGAGEMENT_OPTIONS.map((option) => option.id).filter(
    (value) => selected.has(value)
  );
};

const normalizePreferredLocale = (value: unknown): string | null => {
  const candidate = String(value ?? "")
    .trim()
    .toLowerCase();
  return candidate === "ko" || candidate === "en" ? candidate : null;
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
  enabled = true,
  userId,
  authLoading,
  fetchWithAuth,
}: UseCareerTalentSettingsArgs) => {
  const tCareer = useCareerMessageFormatter();
  const fetchRequestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [profileVisibility, setProfileVisibility] =
    useState<CareerProfileVisibility>(DEFAULT_PROFILE_VISIBILITY);
  const [savedProfileVisibility, setSavedProfileVisibility] =
    useState<CareerProfileVisibility>(DEFAULT_PROFILE_VISIBILITY);
  const [engagementTypes, setEngagementTypes] = useState<
    CareerEngagementType[]
  >([]);
  const [savedEngagementTypes, setSavedEngagementTypes] = useState<
    CareerEngagementType[]
  >([]);
  const [blockedCompanies, setBlockedCompanies] = useState<string[]>([]);
  const [savedBlockedCompanies, setSavedBlockedCompanies] = useState<string[]>(
    []
  );
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(
    null
  );
  const [preferredLocale, setPreferredLocale] = useState<string | null>(null);

  const applyPersistedSettings = useCallback(
    (
      settings: {
        engagementTypes?: unknown;
        profileVisibility?: unknown;
        blockedCompanies?: unknown;
        preferredLocale?: unknown;
        effectivePreferredLocale?: unknown;
      },
      updatedAt?: unknown,
      options?: {
        preserveLocalBlockedCompanies?: boolean;
      }
    ) => {
      const nextVisibility = normalizeProfileVisibility(
        settings.profileVisibility
      );
      const nextEngagementTypes = normalizeEngagementTypes(
        settings.engagementTypes
      );
      const nextBlockedCompanies = normalizeBlockedCompanies(
        settings.blockedCompanies
      );
      const nextPreferredLocale = normalizePreferredLocale(
        settings.preferredLocale ?? settings.effectivePreferredLocale
      );

      setProfileVisibility(nextVisibility);
      setSavedProfileVisibility(nextVisibility);
      setEngagementTypes(nextEngagementTypes);
      setSavedEngagementTypes(nextEngagementTypes);
      if (!options?.preserveLocalBlockedCompanies) {
        setBlockedCompanies(nextBlockedCompanies);
      }
      setSavedBlockedCompanies(nextBlockedCompanies);
      setPreferredLocale(nextPreferredLocale);
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
          getErrorMessage(payload, tCareer(H.settingsLoadFailed))
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
        error instanceof Error ? error.message : tCareer(H.settingsLoadFailed);
      setSettingsError(message);
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setSettingsLoading(false);
      }
    }
  }, [applyPersistedSettings, fetchWithAuth, tCareer, userId]);

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
      setEngagementTypes([]);
      setSavedEngagementTypes([]);
      setBlockedCompanies([]);
      setSavedBlockedCompanies([]);
      setPreferredLocale(null);
      setSettingsUpdatedAt(null);
      return;
    }

    if (!enabled) return;

    void fetchSettings();
  }, [authLoading, enabled, fetchSettings, userId]);

  const persistSettings = useCallback(
    async (nextSettings: {
      profileVisibility: CareerProfileVisibility;
      engagementTypes?: CareerEngagementType[];
      blockedCompanies?: string[];
      preserveLocalBlockedCompanies?: boolean;
    }) => {
      if (!userId || settingsSaving) return false;

      const requestId = ++saveRequestIdRef.current;
      const requestBody: {
        engagementTypes?: CareerEngagementType[];
        profileVisibility: CareerProfileVisibility;
        profileVisibilitySource: "profile_settings";
        blockedCompanies?: string[];
      } = {
        profileVisibility: nextSettings.profileVisibility,
        profileVisibilitySource: "profile_settings",
      };
      if (nextSettings.blockedCompanies !== undefined) {
        requestBody.blockedCompanies = nextSettings.blockedCompanies;
      }
      if (nextSettings.engagementTypes !== undefined) {
        requestBody.engagementTypes = nextSettings.engagementTypes;
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
            getErrorMessage(payload, tCareer(H.settingsSaveFailed))
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
          error instanceof Error
            ? error.message
            : tCareer(H.settingsSaveFailed);
        setSettingsError(message);
        return false;
      } finally {
        if (requestId === saveRequestIdRef.current) {
          setSettingsSaving(false);
        }
      }
    },
    [applyPersistedSettings, fetchWithAuth, settingsSaving, tCareer, userId]
  );

  const saveSettings = useCallback(async () => {
    return persistSettings({
      profileVisibility,
      engagementTypes,
      blockedCompanies,
    });
  }, [blockedCompanies, engagementTypes, persistSettings, profileVisibility]);

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

  const updateEngagementTypes = useCallback(
    async (values: CareerEngagementType[]) => {
      const nextEngagementTypes = normalizeEngagementTypes(values);
      if (
        settingsLoading ||
        settingsSaving ||
        sameStringArray(nextEngagementTypes, engagementTypes)
      ) {
        return false;
      }

      const previousEngagementTypes = engagementTypes;
      setEngagementTypes(nextEngagementTypes);
      setSettingsError("");

      const saved = await persistSettings({
        profileVisibility,
        engagementTypes: nextEngagementTypes,
        preserveLocalBlockedCompanies: true,
      });
      if (!saved) {
        setEngagementTypes(previousEngagementTypes);
      }
      return saved;
    },
    [
      engagementTypes,
      persistSettings,
      profileVisibility,
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
    setEngagementTypes(savedEngagementTypes);
    setBlockedCompanies(savedBlockedCompanies);
    setSettingsError("");
  }, [savedBlockedCompanies, savedEngagementTypes, savedProfileVisibility]);

  const hasUnsavedTalentSettingsChanges = useMemo(
    () =>
      profileVisibility !== savedProfileVisibility ||
      !sameStringArray(engagementTypes, savedEngagementTypes) ||
      !sameStringArray(blockedCompanies, savedBlockedCompanies),
    [
      blockedCompanies,
      engagementTypes,
      profileVisibility,
      savedBlockedCompanies,
      savedEngagementTypes,
      savedProfileVisibility,
    ]
  );

  return useMemo(
    () => ({
      settingsLoading,
      settingsSaving,
      settingsError,
      settingsUpdatedAt,
      preferredLocale,
      profileVisibility,
      engagementTypes,
      blockedCompanies,
      hasUnsavedTalentSettingsChanges,
      onProfileVisibilityChange: updateProfileVisibility,
      onEngagementTypesChange: updateEngagementTypes,
      onAddBlockedCompany: addBlockedCompany,
      onRemoveBlockedCompany: removeBlockedCompany,
      onSaveTalentSettings: saveSettings,
      onResetTalentSettings: resetTalentSettings,
      onReloadTalentSettings: fetchSettings,
    }),
    [
      addBlockedCompany,
      blockedCompanies,
      engagementTypes,
      fetchSettings,
      hasUnsavedTalentSettingsChanges,
      preferredLocale,
      profileVisibility,
      removeBlockedCompany,
      resetTalentSettings,
      saveSettings,
      settingsError,
      settingsLoading,
      settingsSaving,
      settingsUpdatedAt,
      updateEngagementTypes,
      updateProfileVisibility,
    ]
  );
};
