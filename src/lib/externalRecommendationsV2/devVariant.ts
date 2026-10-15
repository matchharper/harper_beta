export const DEV_EXTERNAL_VARIANT_COOKIE = "career-dev-external-variant";
export type ExternalVariant = "control" | "v2";
export type DevExternalVariant = "auto" | ExternalVariant;
export type DevExternalVariantSnapshot = {
  selection: DevExternalVariant;
  automaticVariant: ExternalVariant;
  effectiveVariant: ExternalVariant;
  experimentEnabled: boolean;
};

export function isDevExternalVariant(value: unknown): value is DevExternalVariant {
  return value === "auto" || value === "control" || value === "v2";
}

export function readDevExternalVariant(
  cookieValue: string | undefined,
  userId: string
): DevExternalVariant {
  if (cookieValue === `${userId}:control`) return "control";
  if (cookieValue === `${userId}:v2`) return "v2";
  return "auto";
}
