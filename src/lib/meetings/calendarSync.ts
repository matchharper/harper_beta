export const GOOGLE_CALENDAR_SYNC_WINDOW_DAYS = 14;

export type GoogleCalendarSyncResponse = {
  addedCount: number;
  lastSyncedAt: string;
  ok: true;
  removedCount: number;
  totalBusyCount: number;
  updatedCount: number;
  windowEnd: string;
};
