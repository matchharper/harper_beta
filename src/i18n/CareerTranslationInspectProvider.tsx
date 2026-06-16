"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRouter } from "next/router";
import { useQueryClient } from "@tanstack/react-query";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";
import { canInspectCareerTranslations } from "@/lib/internalAccess";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import {
  MessagesProvider,
  useMessages,
  type Locale,
  type MessageDictionary,
} from "@/i18n/useMessage";

const namespace = "career";
const INSPECT_STORAGE_KEY = "harper:careerTranslationInspect";
const INSPECT_STORAGE_CHANGE_EVENT = "harper:careerTranslationInspectChange";
const translationEntryQueryKey = "careerTranslationInspectEntries";

export type CareerTranslationMatchConfidence = "exact" | "partial" | "template";

export type CareerTranslationMatchKind = "attribute" | "text";

export type CareerTranslationMatchRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type CareerTranslationMatch = {
  attr?: string;
  candidateKeys?: string[];
  confidence: CareerTranslationMatchConfidence;
  currentText: string;
  id: string;
  key: string;
  kind: CareerTranslationMatchKind;
  rects: CareerTranslationMatchRect[];
  scrollTargetId?: string;
  sourceKo: string;
};

export type CareerTranslationEntry = {
  description: string;
  en: string;
  key: string;
  ko: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

type CareerTranslationInspectContextValue = {
  canInspect: boolean;
  clearSelectedMatch: () => void;
  dirtyKeys: Set<string>;
  ensureEntries: (keys: string[]) => Promise<void>;
  error: string;
  getEntry: (key: string) => CareerTranslationEntry;
  inspectEnabled: boolean;
  isEntryDirty: (key: string) => boolean;
  isEntryLoading: (key: string) => boolean;
  isEntrySaving: (key: string) => boolean;
  matches: CareerTranslationMatch[];
  registerMatches: (matches: CareerTranslationMatch[]) => void;
  revertEntry: (key: string) => void;
  saveEntry: (key: string) => Promise<void>;
  saveInfo: string;
  selectedMatch: CareerTranslationMatch | null;
  selectMatch: (match: CareerTranslationMatch) => void;
  setInspectEnabled: (enabled: boolean) => void;
  updateEntryValue: (key: string, locale: Locale, value: string) => void;
};

const CareerTranslationInspectContext =
  createContext<CareerTranslationInspectContextValue | null>(null);

function normalizeEntry(row: Partial<CareerTranslationEntry>) {
  return {
    description: row.description ?? "",
    en: row.en ?? "",
    key: row.key ?? "",
    ko: row.ko ?? "",
    updatedAt: row.updatedAt ?? null,
    updatedBy: row.updatedBy ?? null,
  } satisfies CareerTranslationEntry;
}

function fallbackEntry(key: string) {
  return normalizeEntry({
    en: ((en.career ?? {}) as Record<string, string>)[key] ?? "",
    key,
    ko: ((ko.career ?? {}) as Record<string, string>)[key] ?? "",
  });
}

function entriesEqual(
  left: CareerTranslationEntry | undefined,
  right: CareerTranslationEntry | undefined
) {
  if (!left || !right) return false;
  return (
    left.description === right.description &&
    left.en === right.en &&
    left.ko === right.ko
  );
}

function mergeCareerMessages(
  base: MessageDictionary,
  entries: Map<string, CareerTranslationEntry>,
  locale: Locale
) {
  const career: Record<string, string> = {
    ...((base.career ?? {}) as Record<string, string>),
  };

  entries.forEach((entry, key) => {
    const value = locale === "ko" ? entry.ko : entry.en;
    if (value) {
      career[key] = value;
    }
  });

  return {
    ...base,
    career,
  } as MessageDictionary;
}

function buildApiEntries(entry: CareerTranslationEntry) {
  return [
    {
      key: entry.key,
      locale: "ko",
      status: "reviewed",
      value: entry.ko,
    },
    {
      key: entry.key,
      locale: "en",
      status: "draft",
      value: entry.en,
    },
  ];
}

function readStoredInspectEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INSPECT_STORAGE_KEY) === "1";
}

function writeStoredInspectEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.setItem(INSPECT_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(INSPECT_STORAGE_KEY);
  }
  window.dispatchEvent(new Event(INSPECT_STORAGE_CHANGE_EVENT));
}

function subscribeStoredInspectEnabled(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  window.addEventListener("storage", onChange);
  window.addEventListener(INSPECT_STORAGE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(INSPECT_STORAGE_CHANGE_EVENT, onChange);
  };
}

function readServerInspectEnabledSnapshot() {
  return false;
}

function buildMatchSignature(matches: CareerTranslationMatch[]) {
  return JSON.stringify(
    matches.map((match) => [
      match.id,
      match.key,
      match.kind,
      match.attr ?? "",
      match.currentText,
      match.scrollTargetId ?? "",
      match.rects.map((rect) => [
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      ]),
    ])
  );
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return fallback;
}

function readLookupRows(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("rows" in payload)) {
    return [];
  }

  const rows = payload.rows;
  if (!Array.isArray(rows)) return [];

  return rows
    .filter(
      (row): row is Partial<CareerTranslationEntry> =>
        Boolean(row) && typeof row === "object"
    )
    .map(normalizeEntry);
}

export function CareerTranslationInspectProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locale, m, setLocale } = useMessages();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const manualInspectEnabled = useSyncExternalStore(
    subscribeStoredInspectEnabled,
    readStoredInspectEnabled,
    readServerInspectEnabledSnapshot
  );
  const [matches, setMatches] = useState<CareerTranslationMatch[]>([]);
  const [selectedMatch, setSelectedMatch] =
    useState<CareerTranslationMatch | null>(null);
  const [entriesByKey, setEntriesByKey] = useState<
    Map<string, CareerTranslationEntry>
  >(() => new Map());
  const [savedEntriesByKey, setSavedEntriesByKey] = useState<
    Map<string, CareerTranslationEntry>
  >(() => new Map());
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(() => new Set());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [saveInfo, setSaveInfo] = useState("");
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const matchSignatureRef = useRef("");
  const canInspect = !authLoading && canInspectCareerTranslations(user?.email);
  const focusedTranslationKey =
    router.isReady && typeof router.query.focusTranslationKey === "string"
      ? router.query.focusTranslationKey.trim()
      : "";
  const inspectEnabled = canInspect && manualInspectEnabled;

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getAccessToken();
      if (!token) throw new Error("로그인 세션을 확인할 수 없습니다.");

      return fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {}),
        },
      });
    },
    [getAccessToken]
  );

  const setInspectEnabled = useCallback((enabled: boolean) => {
    writeStoredInspectEnabled(enabled);

    if (!enabled) {
      setSelectedMatch(null);
      setError("");
      setSaveInfo("");
    }
  }, []);

  const registerMatches = useCallback(
    (nextMatches: CareerTranslationMatch[]) => {
      const nextSignature = buildMatchSignature(nextMatches);
      if (matchSignatureRef.current === nextSignature) return;

      matchSignatureRef.current = nextSignature;
      setMatches(nextMatches);
    },
    []
  );

  const selectMatch = useCallback((match: CareerTranslationMatch) => {
    setSelectedMatch(match);
    setError("");
    setSaveInfo("");
  }, []);

  const clearSelectedMatch = useCallback(() => {
    setSelectedMatch(null);
    setError("");
    setSaveInfo("");
  }, []);

  const getEntry = useCallback(
    (key: string) => entriesByKey.get(key) ?? fallbackEntry(key),
    [entriesByKey]
  );

  const fetchEntriesForKeys = useCallback(
    async (keys: string[]) => {
      const params = new URLSearchParams({
        keys: keys.join(","),
        namespace,
      });
      const response = await fetchWithAuth(
        `/api/internal/translations?${params.toString()}`
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          readErrorMessage(payload, "번역 데이터를 불러오지 못했습니다.")
        );
      }

      return readLookupRows(payload);
    },
    [fetchWithAuth]
  );

  const ensureEntries = useCallback(
    async (keys: string[]) => {
      if (!canInspect) return;

      const uniqueKeys = Array.from(
        new Set(keys.map((key) => key.trim()).filter(Boolean))
      );
      const missingKeys = uniqueKeys.filter(
        (key) => !entriesByKey.has(key) && !inFlightKeysRef.current.has(key)
      );
      if (missingKeys.length === 0) return;

      missingKeys.forEach((key) => inFlightKeysRef.current.add(key));
      setLoadingKeys((current) => new Set([...current, ...missingKeys]));
      setError("");

      try {
        const rows = await queryClient.fetchQuery({
          queryFn: () => fetchEntriesForKeys(missingKeys),
          queryKey: [translationEntryQueryKey, namespace, missingKeys],
          staleTime: 30_000,
        });

        setEntriesByKey((current) => {
          const next = new Map(current);
          rows.forEach((row) => {
            if (!dirtyKeys.has(row.key)) next.set(row.key, row);
          });
          missingKeys.forEach((key) => {
            if (!next.has(key)) next.set(key, fallbackEntry(key));
          });
          return next;
        });
        setSavedEntriesByKey((current) => {
          const next = new Map(current);
          rows.forEach((row) => next.set(row.key, row));
          missingKeys.forEach((key) => {
            if (!next.has(key)) next.set(key, fallbackEntry(key));
          });
          return next;
        });
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "번역 데이터를 불러오지 못했습니다."
        );
      } finally {
        missingKeys.forEach((key) => inFlightKeysRef.current.delete(key));
        setLoadingKeys((current) => {
          const next = new Set(current);
          missingKeys.forEach((key) => next.delete(key));
          return next;
        });
      }
    },
    [canInspect, dirtyKeys, entriesByKey, fetchEntriesForKeys, queryClient]
  );

  useEffect(() => {
    if (!inspectEnabled || !focusedTranslationKey) return;
    void ensureEntries([focusedTranslationKey]);
  }, [ensureEntries, focusedTranslationKey, inspectEnabled]);

  const updateEntryValue = useCallback(
    (key: string, entryLocale: Locale, value: string) => {
      setSaveInfo("");
      setError("");
      setEntriesByKey((current) => {
        const base = current.get(key) ?? fallbackEntry(key);
        const nextEntry =
          entryLocale === "ko"
            ? { ...base, ko: value }
            : { ...base, en: value };
        const next = new Map(current);
        next.set(key, nextEntry);
        return next;
      });
      setDirtyKeys((current) => {
        const next = new Set(current);
        next.add(key);
        return next;
      });
    },
    []
  );

  const revertEntry = useCallback(
    (key: string) => {
      const savedEntry = savedEntriesByKey.get(key) ?? fallbackEntry(key);
      setEntriesByKey((current) => {
        const next = new Map(current);
        next.set(key, savedEntry);
        return next;
      });
      setDirtyKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setSaveInfo("");
      setError("");
    },
    [savedEntriesByKey]
  );

  const saveEntry = useCallback(
    async (key: string) => {
      if (!canInspect || savingKeys.has(key)) return;

      const entry = entriesByKey.get(key);
      if (!entry) return;

      setSavingKeys((current) => new Set([...current, key]));
      setError("");
      setSaveInfo("");

      try {
        const response = await fetchWithAuth(
          `/api/internal/translations?namespace=${namespace}`,
          {
            body: JSON.stringify({ entries: buildApiEntries(entry) }),
            method: "PUT",
          }
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            readErrorMessage(payload, "번역 데이터를 저장하지 못했습니다.")
          );
        }

        queryClient.invalidateQueries({
          queryKey: [translationEntryQueryKey, namespace],
        });
        setSavedEntriesByKey((current) => {
          const next = new Map(current);
          next.set(key, entry);
          return next;
        });
        setDirtyKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        setSaveInfo(
          "저장했습니다. 로컬 파일 반영은 pnpm translation:pull로 진행합니다."
        );
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "번역 데이터를 저장하지 못했습니다."
        );
      } finally {
        setSavingKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    },
    [canInspect, entriesByKey, fetchWithAuth, queryClient, savingKeys]
  );

  const isEntryDirty = useCallback(
    (key: string) => {
      const entry = entriesByKey.get(key);
      const savedEntry = savedEntriesByKey.get(key);
      return dirtyKeys.has(key) || !entriesEqual(entry, savedEntry);
    },
    [dirtyKeys, entriesByKey, savedEntriesByKey]
  );

  const value = useMemo<CareerTranslationInspectContextValue>(
    () => ({
      canInspect,
      clearSelectedMatch,
      dirtyKeys,
      ensureEntries,
      error,
      getEntry,
      inspectEnabled,
      isEntryDirty,
      isEntryLoading: (key) => loadingKeys.has(key),
      isEntrySaving: (key) => savingKeys.has(key),
      matches,
      registerMatches,
      revertEntry,
      saveEntry,
      saveInfo,
      selectedMatch,
      selectMatch,
      setInspectEnabled,
      updateEntryValue,
    }),
    [
      canInspect,
      clearSelectedMatch,
      dirtyKeys,
      ensureEntries,
      error,
      getEntry,
      inspectEnabled,
      isEntryDirty,
      loadingKeys,
      matches,
      registerMatches,
      revertEntry,
      saveEntry,
      saveInfo,
      savingKeys,
      selectMatch,
      selectedMatch,
      setInspectEnabled,
      updateEntryValue,
    ]
  );

  const mergedMessages = useMemo(
    () => mergeCareerMessages(m, entriesByKey, locale),
    [entriesByKey, locale, m]
  );

  return (
    <CareerTranslationInspectContext.Provider value={value}>
      <MessagesProvider
        locale={locale}
        messages={mergedMessages}
        onLocaleChange={setLocale}
      >
        {children}
      </MessagesProvider>
    </CareerTranslationInspectContext.Provider>
  );
}

export function useCareerTranslationInspect() {
  return useContext(CareerTranslationInspectContext);
}

export function useCareerTranslationInspectRuntime() {
  const context = useCareerTranslationInspect();

  return {
    inspectEnabled: context?.inspectEnabled ?? false,
    registerMatches: context?.registerMatches ?? (() => undefined),
  };
}
