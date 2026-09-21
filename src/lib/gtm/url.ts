// Stable UUID seeded by md5('harper-gtm:creators') in the GTM workspace migration.
export const GTM_CREATOR_DIRECTORY_SHEET_ID =
  "a5511ea1-9e9c-ba95-cd53-a82c60720e25";

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TAB_PATTERN = /^[a-z][a-z0-9_]{0,63}$/i;

export function gtmQueryValue(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim() || null;
  }
  return null;
}

export function isGtmRecordId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function normalizeGtmRecordTab(
  value: unknown,
  fallback = "conversation"
) {
  const tab = gtmQueryValue(value);
  return tab && TAB_PATTERN.test(tab) ? tab : fallback;
}

export function buildGtmCreatorWorkspaceUrl(args: {
  baseUrl: string;
  creatorId: string;
  sheetId?: string;
  tab?: string;
}) {
  const url = new URL(args.baseUrl);
  url.searchParams.set("sheet", args.sheetId ?? GTM_CREATOR_DIRECTORY_SHEET_ID);
  url.searchParams.set("creator", args.creatorId);
  url.searchParams.set(
    "creatorTab",
    normalizeGtmRecordTab(args.tab, "conversation")
  );
  return url.toString();
}
