import { isEmailExcluded } from "@/lib/adminEmailExclusions";
import { normalizeEmail } from "@/lib/adminMetrics/utils";
import { extractEmailFromLandingLoginType } from "@/lib/landingLogTypes";
import { isTalentNetworkReferralVisitLogType } from "@/lib/talentNetworkReferralTracking";
import type { Database } from "@/types/database.types";

type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  "created_at" | "email" | "user_id"
>;
type LogRow = Pick<
  Database["public"]["Tables"]["logs"]["Row"],
  "created_at" | "type" | "user_id"
>;
type TalentMessageRow = Pick<
  Database["public"]["Tables"]["talent_messages"]["Row"],
  "created_at" | "message_type" | "user_id"
>;
type TalentActivityEventRow = Pick<
  Database["public"]["Tables"]["talent_activity_events"]["Row"],
  "created_at" | "event_type" | "talent_id"
>;
type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "created_at" | "local_id" | "type"
>;
type EmailOnboardingLeadRow = Pick<
  Database["public"]["Tables"]["career_email_onboarding_leads"]["Row"],
  | "converted_user_id"
  | "created_at"
  | "email"
  | "local_id"
  | "normalized_email"
  | "profile_ingested_at"
  | "profile_received_at"
  | "talent_id"
>;

export type DailyUserStatsReferralFunnelStats = {
  onboardingCompletedCount: number;
  onboardingCompletedRateFromVisit: number | null;
  signupCount: number;
  signupRateFromVisit: number | null;
  submittedCount: number;
  submittedRateFromVisit: number | null;
  visitCount: number;
};

function minIso(
  current: string | null | undefined,
  candidate: string | null | undefined
) {
  if (!candidate) return current ?? null;
  if (!current) return candidate;
  return candidate < current ? candidate : current;
}

function addFirstOccurredAt(
  map: Map<string, string>,
  userId: string | null | undefined,
  occurredAt: string | null | undefined
) {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId || !occurredAt) return;

  const nextValue = minIso(map.get(normalizedUserId), occurredAt);
  if (nextValue) map.set(normalizedUserId, nextValue);
}

function addSetValue(
  map: Map<string, Set<string>>,
  key: string | null | undefined,
  value: string | null | undefined
) {
  const normalizedKey = String(key ?? "").trim();
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedKey || !normalizedValue) return;

  const set = map.get(normalizedKey) ?? new Set<string>();
  set.add(normalizedValue);
  map.set(normalizedKey, set);
}

function hasEventAfterEntry(args: {
  entryAt: string;
  eventAtByUserId: Map<string, string>;
  userIds: Set<string> | undefined;
}) {
  if (!args.userIds?.size) return false;
  for (const userId of args.userIds) {
    const eventAt = args.eventAtByUserId.get(userId);
    if (eventAt && eventAt >= args.entryAt) return true;
  }
  return false;
}

function countRate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

export function buildReferralFunnelStats(args: {
  emailOnboardingLeads: EmailOnboardingLeadRow[];
  excludedEmailSet: Set<string>;
  landingLoginLogs: LandingLogRow[];
  onboardingEvents: TalentActivityEventRow[];
  profileSubmitMessages: TalentMessageRow[];
  referralVisitLogs: LandingLogRow[];
  signupAndSubmitLogs: LogRow[];
  talentUsers: TalentUserRow[];
}): DailyUserStatsReferralFunnelStats {
  const entryAtByLocalId = new Map<string, string>();
  for (const log of args.referralVisitLogs) {
    if (!isTalentNetworkReferralVisitLogType(log.type)) continue;
    const localId = String(log.local_id ?? "").trim();
    if (!localId) continue;

    const firstEntryAt = minIso(entryAtByLocalId.get(localId), log.created_at);
    if (firstEntryAt) entryAtByLocalId.set(localId, firstEntryAt);
  }

  const cohortLocalIds = new Set(entryAtByLocalId.keys());
  const excludedLocalIds = new Set<string>();
  const includedTalentUsers = args.talentUsers.filter(
    (user) => !isEmailExcluded(user.email, args.excludedEmailSet)
  );
  const includedUserIds = new Set(
    includedTalentUsers.map((user) => user.user_id).filter(Boolean)
  );
  const isIncludedUserId = (userId: string | null | undefined) => {
    const normalized = String(userId ?? "").trim();
    return Boolean(normalized && includedUserIds.has(normalized));
  };

  const emailToUserIds = new Map<string, Set<string>>();
  const signupAtByUserId = new Map<string, string>();
  for (const user of includedTalentUsers) {
    const email = normalizeEmail(user.email);
    if (email) addSetValue(emailToUserIds, email, user.user_id);
    addFirstOccurredAt(signupAtByUserId, user.user_id, user.created_at);
  }

  const userIdsByLocalId = new Map<string, Set<string>>();
  for (const log of args.landingLoginLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId || !cohortLocalIds.has(localId)) continue;

    const email = normalizeEmail(extractEmailFromLandingLoginType(log.type));
    if (!email) continue;
    if (isEmailExcluded(email, args.excludedEmailSet)) {
      excludedLocalIds.add(localId);
      continue;
    }

    for (const userId of emailToUserIds.get(email) ?? []) {
      addSetValue(userIdsByLocalId, localId, userId);
    }
  }

  const submittedAtByUserId = new Map<string, string>();
  for (const lead of args.emailOnboardingLeads) {
    const localId = String(lead.local_id ?? "").trim();
    if (!localId || !cohortLocalIds.has(localId)) continue;

    const email = normalizeEmail(lead.normalized_email || lead.email);
    if (email && isEmailExcluded(email, args.excludedEmailSet)) {
      excludedLocalIds.add(localId);
      continue;
    }

    for (const userId of [lead.talent_id, lead.converted_user_id]) {
      if (userId) addSetValue(userIdsByLocalId, localId, userId);
    }
    if (email) {
      for (const userId of emailToUserIds.get(email) ?? []) {
        addSetValue(userIdsByLocalId, localId, userId);
      }
    }

    addFirstOccurredAt(signupAtByUserId, lead.talent_id, lead.created_at);
    addFirstOccurredAt(
      submittedAtByUserId,
      lead.talent_id,
      minIso(lead.profile_received_at, lead.profile_ingested_at)
    );
  }

  for (const log of args.signupAndSubmitLogs) {
    if (!isIncludedUserId(log.user_id)) continue;
    if (log.type === "career_signup_completed") {
      addFirstOccurredAt(signupAtByUserId, log.user_id, log.created_at);
    } else if (log.type === "career_onboarding_submitted") {
      addFirstOccurredAt(submittedAtByUserId, log.user_id, log.created_at);
    }
  }
  for (const message of args.profileSubmitMessages) {
    if (!isIncludedUserId(message.user_id)) continue;
    addFirstOccurredAt(
      submittedAtByUserId,
      message.user_id,
      message.created_at
    );
  }

  const completedAtByUserId = new Map<string, string>();
  for (const event of args.onboardingEvents) {
    if (event.event_type !== "onboarding_completed") continue;
    if (!isIncludedUserId(event.talent_id)) continue;
    addFirstOccurredAt(completedAtByUserId, event.talent_id, event.created_at);
  }

  const entries = Array.from(entryAtByLocalId.entries()).filter(
    ([localId]) => !excludedLocalIds.has(localId)
  );
  let signupCount = 0;
  let submittedCount = 0;
  let onboardingCompletedCount = 0;

  for (const [localId, entryAt] of entries) {
    const userIds = userIdsByLocalId.get(localId);
    const hasSignup = hasEventAfterEntry({
      entryAt,
      eventAtByUserId: signupAtByUserId,
      userIds,
    });
    if (hasSignup) signupCount += 1;

    const hasSubmitted = hasEventAfterEntry({
      entryAt,
      eventAtByUserId: submittedAtByUserId,
      userIds,
    });
    if (hasSignup && hasSubmitted) submittedCount += 1;

    const hasCompleted = hasEventAfterEntry({
      entryAt,
      eventAtByUserId: completedAtByUserId,
      userIds,
    });
    if (hasSignup && hasSubmitted && hasCompleted) {
      onboardingCompletedCount += 1;
    }
  }

  const visitCount = entries.length;
  return {
    onboardingCompletedCount,
    onboardingCompletedRateFromVisit: countRate(
      onboardingCompletedCount,
      visitCount
    ),
    signupCount,
    signupRateFromVisit: countRate(signupCount, visitCount),
    submittedCount,
    submittedRateFromVisit: countRate(submittedCount, visitCount),
    visitCount,
  };
}
