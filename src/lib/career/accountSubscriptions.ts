import type { TalentProfileVisibility } from "@/lib/talentOnboarding/server";

export type AccountSubscriptionSettings = {
  getExternalRecommendation: boolean;
  harperEnabled: boolean;
};

export type AccountSubscriptionConfirmationKind = "pause_all" | "stop_external";

export function requiresAccountPauseConfirmation(
  settings: AccountSubscriptionSettings
) {
  return !settings.harperEnabled && !settings.getExternalRecommendation;
}

export function getAccountSubscriptionConfirmationKind(args: {
  current: AccountSubscriptionSettings;
  next: AccountSubscriptionSettings;
}): AccountSubscriptionConfirmationKind | null {
  if (requiresAccountPauseConfirmation(args.next)) return "pause_all";
  if (
    args.current.getExternalRecommendation &&
    !args.next.getExternalRecommendation
  ) {
    return "stop_external";
  }
  return null;
}

export function toAccountSubscriptionSettings(args: {
  getExternalRecommendation: boolean;
  profileVisibility: TalentProfileVisibility;
}): AccountSubscriptionSettings {
  return {
    getExternalRecommendation: args.getExternalRecommendation !== false,
    harperEnabled: args.profileVisibility !== "dont_share",
  };
}

export function resolveAccountSubscriptionUpdate(args: {
  currentGetExternalRecommendation: boolean;
  currentProfileVisibility: TalentProfileVisibility;
  getExternalRecommendation?: boolean;
  harperEnabled?: boolean;
}) {
  if (args.harperEnabled === undefined) {
    return {
      getExternalRecommendation:
        args.getExternalRecommendation ?? args.currentGetExternalRecommendation,
      profileVisibility: args.currentProfileVisibility,
    };
  }

  if (!args.harperEnabled) {
    return {
      getExternalRecommendation: false,
      profileVisibility: "dont_share" as const,
    };
  }

  return {
    getExternalRecommendation:
      args.currentProfileVisibility === "dont_share"
        ? true
        : (args.getExternalRecommendation ??
          args.currentGetExternalRecommendation),
    profileVisibility:
      args.currentProfileVisibility === "dont_share"
        ? ("exceptional_only" as const)
        : args.currentProfileVisibility,
  };
}
