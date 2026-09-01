export const GOOGLE_CALENDAR_SYNC_WINDOW_DAYS = 14;
export const GOOGLE_CALENDAR_AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1_000;

export function isFreshGoogleCalendarSync(
  lastSyncedAt: string | null,
  nowMs: number,
  minimumIntervalMs = GOOGLE_CALENDAR_AUTO_SYNC_INTERVAL_MS
) {
  if (!lastSyncedAt) return false;
  const syncedAtMs = Date.parse(lastSyncedAt);
  return Number.isFinite(syncedAtMs) && nowMs - syncedAtMs < minimumIntervalMs;
}

export type GoogleCalendarSyncResponse = {
  addedCount: number;
  lastSyncedAt: string;
  ok: true;
  removedCount: number;
  totalBusyCount: number;
  updatedCount: number;
  windowEnd: string;
};
