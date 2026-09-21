import type { GtmNavigation, GtmRow } from "./types";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type GtmNavigationTarget = {
  source: string;
  id: string;
  tab?: string;
};

export function resolveNavigation(
  row: GtmRow,
  navigation: GtmNavigation | null | undefined,
  fallbackSource: string
): GtmNavigationTarget | null {
  if (!navigation) return null;
  const id = String(row[navigation.id_field] ?? "");
  const source = navigation.source_field
    ? String(row[navigation.source_field] ?? "")
    : (navigation.source ?? fallbackSource);
  if (!UUID.test(id) || !source) return null;
  return { source, id, tab: navigation.tab };
}
