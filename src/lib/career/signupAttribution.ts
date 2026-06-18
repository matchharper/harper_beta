import {
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  normalizeCareerUtmSource,
} from "@/lib/career/utm";

export type CareerSignupAttributionPayload = {
  landingLocalId?: string;
  landingPath?: string;
  landingSource?: string;
};

const normalizeOptionalText = (value: unknown, maxLength: number) => {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

export function getCareerSignupAttributionPayload(overrides?: {
  localId?: unknown;
  path?: unknown;
  source?: unknown;
}): CareerSignupAttributionPayload {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  let storedSource: string | null = null;
  let storedLocalId: string | null = null;

  try {
    storedSource = window.localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY);
    storedLocalId = window.localStorage.getItem(
      CAREER_LANDING_LOCAL_ID_STORAGE_KEY
    );
  } catch {
    storedSource = null;
    storedLocalId = null;
  }

  const landingSource = normalizeCareerUtmSource(
    overrides?.source ?? params.get("source") ?? storedSource
  );
  const landingLocalId = normalizeOptionalText(
    overrides?.localId ?? params.get("lid") ?? storedLocalId,
    120
  );
  const landingPath = normalizeOptionalText(
    overrides?.path ?? `${window.location.pathname}${window.location.search}`,
    500
  );

  return {
    ...(landingLocalId ? { landingLocalId } : {}),
    ...(landingPath ? { landingPath } : {}),
    ...(landingSource ? { landingSource } : {}),
  };
}
