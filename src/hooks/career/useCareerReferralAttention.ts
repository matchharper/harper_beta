"use client";

import { useCallback, useSyncExternalStore } from "react";

const CAREER_REFERRAL_ATTENTION_STORAGE_PREFIX =
  "harper:career-referral-attention-seen:v2:";

type ReferralAttentionStorage = Pick<Storage, "getItem" | "setItem">;

const seenByUserId = new Map<string, boolean>();
const listeners = new Set<() => void>();
let listeningForStorageChanges = false;

const getStorage = (): ReferralAttentionStorage | null => {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const getCareerReferralAttentionStorageKey = (userId: string) =>
  `${CAREER_REFERRAL_ATTENTION_STORAGE_PREFIX}${encodeURIComponent(userId)}`;

export const hasSeenCareerReferral = (
  userId: string | null | undefined,
  storage: ReferralAttentionStorage | null = getStorage()
) => {
  if (!userId) return true;
  const cached = seenByUserId.get(userId);
  if (cached !== undefined) return cached;

  try {
    const seen =
      storage?.getItem(getCareerReferralAttentionStorageKey(userId)) === "1";
    seenByUserId.set(userId, seen);
    return seen;
  } catch {
    return false;
  }
};

export const markCareerReferralSeen = (
  userId: string | null | undefined,
  storage: ReferralAttentionStorage | null = getStorage()
) => {
  if (!userId) return;

  seenByUserId.set(userId, true);
  try {
    storage?.setItem(getCareerReferralAttentionStorageKey(userId), "1");
  } catch {
    // Keep the in-memory marker so the dot still disappears in this session.
  }

  for (const listener of listeners) {
    listener();
  }
};

const handleStorageChange = (event: StorageEvent) => {
  if (!event.key?.startsWith(CAREER_REFERRAL_ATTENTION_STORAGE_PREFIX)) return;

  const encodedUserId = event.key.slice(
    CAREER_REFERRAL_ATTENTION_STORAGE_PREFIX.length
  );
  try {
    seenByUserId.set(decodeURIComponent(encodedUserId), event.newValue === "1");
  } catch {
    seenByUserId.clear();
  }

  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (typeof window !== "undefined" && !listeningForStorageChanges) {
    window.addEventListener("storage", handleStorageChange);
    listeningForStorageChanges = true;
  }

  return () => {
    listeners.delete(listener);
    if (
      typeof window !== "undefined" &&
      listeningForStorageChanges &&
      listeners.size === 0
    ) {
      window.removeEventListener("storage", handleStorageChange);
      listeningForStorageChanges = false;
    }
  };
};

export function useCareerReferralAttention(userId: string | null | undefined) {
  const getSnapshot = useCallback(
    () => Boolean(userId) && !hasSeenCareerReferral(userId),
    [userId]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
