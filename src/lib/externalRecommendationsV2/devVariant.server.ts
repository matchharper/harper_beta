import { cookies } from "next/headers";
import { canUseCareerDevControls } from "../internalAccess";
import type { TalentAdminClient } from "../talentOnboarding/admin";
import { externalVariant } from "./contract";
import {
  DEV_EXTERNAL_VARIANT_COOKIE,
  readDevExternalVariant,
  type DevExternalVariant,
  type DevExternalVariantSnapshot,
} from "./devVariant";

export function devExternalVariantSnapshot(
  userId: string,
  selection: DevExternalVariant
): DevExternalVariantSnapshot {
  const automaticVariant = externalVariant(userId);
  const experimentEnabled = process.env.EXTERNAL_RECOMMENDATION_EXPERIMENT !== "off";
  return {
    selection,
    automaticVariant,
    effectiveVariant: !experimentEnabled
      ? "control"
      : selection === "auto" ? automaticVariant : selection,
    experimentEnabled,
  };
}

export async function resolveWebExternalVariant(admin: TalentAdminClient, userId: string) {
  const fallback = devExternalVariantSnapshot(userId, "auto").effectiveVariant;
  let cookieValue: string | undefined;
  try {
    cookieValue = (await cookies()).get(DEV_EXTERNAL_VARIANT_COOKIE)?.value;
  } catch {
    // Scheduled and standalone callers have no browser request context.
    return fallback;
  }
  const selection = readDevExternalVariant(cookieValue, userId);
  if (selection === "auto") return fallback;
  // Cookies are client-controlled. Recheck the account's developer access.
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user || !canUseCareerDevControls(data.user.email)) return fallback;
  return devExternalVariantSnapshot(userId, selection).effectiveVariant;
}
