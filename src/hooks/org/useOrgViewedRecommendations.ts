import { useCallback, useMemo, useSyncExternalStore } from "react";

const ORG_PROFILE_VIEWED_STORAGE_PREFIX = "harper:org-profile-viewed:v1";
const ORG_PROFILE_VIEWED_STORAGE_EVENT = "harper:org-profile-viewed-change";
const MAX_STORED_VIEWED_RECOMMENDATIONS = 500;

function buildStorageKey(args: {
  currentUserEmail?: string | null;
  workspaceId: string;
}) {
  const userKey = (args.currentUserEmail || "unknown").trim().toLowerCase();
  return `${ORG_PROFILE_VIEWED_STORAGE_PREFIX}:${args.workspaceId}:${userKey}`;
}

function getStorageSnapshot(storageKey: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(storageKey) ?? "[]";
}

function parseIds(rawValue: string | null) {
  if (rawValue === null) return null;
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(
      parsed.filter((value): value is string => typeof value === "string")
    );
  } catch {
    return new Set<string>();
  }
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith(ORG_PROFILE_VIEWED_STORAGE_PREFIX)) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(ORG_PROFILE_VIEWED_STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(ORG_PROFILE_VIEWED_STORAGE_EVENT, onStoreChange);
  };
}

function writeIds(storageKey: string, ids: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...ids]));
    window.dispatchEvent(new Event(ORG_PROFILE_VIEWED_STORAGE_EVENT));
  } catch {
    // Viewed state is a local UI hint, so storage failure does not block work.
  }
}

export function useOrgViewedRecommendations(args: {
  currentUserEmail?: string | null;
  workspaceId: string;
}) {
  const { currentUserEmail, workspaceId } = args;
  const storageKey = useMemo(
    () => buildStorageKey({ currentUserEmail, workspaceId }),
    [currentUserEmail, workspaceId]
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getStorageSnapshot(storageKey),
    () => null
  );
  const viewedRecommendationIds = useMemo(() => parseIds(snapshot), [snapshot]);
  const markViewed = useCallback(
    (recommendationId: string) => {
      const normalizedId = recommendationId.trim();
      if (!normalizedId) return;
      const current =
        viewedRecommendationIds ??
        parseIds(getStorageSnapshot(storageKey)) ??
        new Set<string>();
      if (current.has(normalizedId)) return;
      const next = new Set(current);
      next.add(normalizedId);
      const cappedIds = [...next].slice(-MAX_STORED_VIEWED_RECOMMENDATIONS);
      writeIds(storageKey, new Set(cappedIds));
    },
    [storageKey, viewedRecommendationIds]
  );

  return {
    hasHydrated: viewedRecommendationIds !== null,
    isViewed: (recommendationId: string) =>
      viewedRecommendationIds?.has(recommendationId) ?? true,
    markViewed,
    viewedRecommendationIds,
  };
}
