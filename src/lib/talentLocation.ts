export type TalentLocationSource = {
  current_location?: string | null;
  currentLocation?: string | null;
  location?: string | null;
};

function normalizeLocation(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

/**
 * `location` is the candidate-maintained current base. `current_location` is
 * legacy signup context and is only a fallback when the maintained field is
 * empty.
 */
export function resolveTalentLocation(source: TalentLocationSource) {
  return (
    normalizeLocation(source.location) ??
    normalizeLocation(source.current_location) ??
    normalizeLocation(source.currentLocation)
  );
}
