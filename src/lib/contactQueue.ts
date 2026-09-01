import type { Json } from "@/types/database.types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export const CONTACT_QUEUE_TYPE_SIGNUP_NO_PROFILE_SUBMIT =
  "career_signup_no_profile_submit";
export const CONTACT_QUEUE_TYPE_PROFILE_SUBMITTED_NO_ANSWER =
  "career_profile_submitted_no_answer";
export const CONTACT_QUEUE_TYPE_INTERNAL_CONNECTION_CONFIRMED =
  "internal_connection_confirmed";
export const CONTACT_QUEUE_TYPE_INTERNAL_CANDIDATE_ROLE_CHANGED =
  "internal_candidate_role_changed";
export const CONTACT_QUEUE_TYPE_COMPANY_REQUEST_CANDIDATE_DELIVERY =
  "company_request_candidate_delivery";
export const CONTACT_QUEUE_TYPE_COMPANY_REQUEST_COMPANY_DELIVERY =
  "company_request_company_delivery";
export const CONTACT_QUEUE_TYPE_MEETING_SCHEDULE_CANDIDATE_INVITATION =
  "meeting_schedule_candidate_invitation";

export type ContactQueueType =
  | typeof CONTACT_QUEUE_TYPE_SIGNUP_NO_PROFILE_SUBMIT
  | typeof CONTACT_QUEUE_TYPE_PROFILE_SUBMITTED_NO_ANSWER
  | typeof CONTACT_QUEUE_TYPE_INTERNAL_CONNECTION_CONFIRMED
  | typeof CONTACT_QUEUE_TYPE_INTERNAL_CANDIDATE_ROLE_CHANGED
  | typeof CONTACT_QUEUE_TYPE_COMPANY_REQUEST_CANDIDATE_DELIVERY
  | typeof CONTACT_QUEUE_TYPE_COMPANY_REQUEST_COMPANY_DELIVERY
  | typeof CONTACT_QUEUE_TYPE_MEETING_SCHEDULE_CANDIDATE_INVITATION
  | "internal_recommendation_call_abandoned";

const RESCHEDULABLE_STATUSES = ["queued", "processing", "failed"] as const;

function isReschedulableStatus(status: string) {
  return RESCHEDULABLE_STATUSES.some((item) => item === status);
}

function randomDelayHours() {
  return Math.floor(Math.random() * 3) + 1;
}

function scheduledAtAfterRandomDelay() {
  return new Date(
    Date.now() + randomDelayHours() * 60 * 60 * 1000
  ).toISOString();
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key value violates unique constraint/i.test(error.message ?? "")
  );
}

async function isOnboardingDone(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_setting")
    .select("is_onboarding_done")
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read talent_setting");
  }

  return Boolean(data?.is_onboarding_done);
}

export async function enqueueSignupNoProfileSubmit(args: {
  admin: TalentAdminClient;
  payload?: Json;
  userId: string;
}) {
  if (await isOnboardingDone(args)) return;

  // Production enforces this legacy reminder with a partial unique index.
  // PostgREST cannot infer that index from `onConflict=user_id,type`, so an
  // upsert fails before it can apply ignoreDuplicates. A plain insert plus
  // duplicate-key handling preserves the intended idempotency and works with
  // the partial index.
  const { error } = await args.admin.from("contact_queue").insert({
    payload: args.payload ?? {},
    scheduled_at: scheduledAtAfterRandomDelay(),
    status: "queued",
    type: CONTACT_QUEUE_TYPE_SIGNUP_NO_PROFILE_SUBMIT,
    user_id: args.userId,
  });

  if (error && !isUniqueViolation(error)) {
    throw new Error(error.message ?? "Failed to enqueue signup contact");
  }
}

export async function cancelContactQueue(args: {
  admin: TalentAdminClient;
  types: readonly ContactQueueType[];
  userId: string;
}) {
  if (args.types.length === 0) return;

  const now = new Date().toISOString();
  const { error } = await args.admin
    .from("contact_queue")
    .update({
      cancelled_at: now,
      last_error: null,
      locked_at: null,
      locked_by: null,
      status: "cancelled",
    })
    .eq("user_id", args.userId)
    .in("type", [...args.types])
    .in("status", RESCHEDULABLE_STATUSES);

  if (error) {
    throw new Error(error.message ?? "Failed to cancel contact queue");
  }
}

export async function cancelSignupNoProfileSubmit(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  await cancelContactQueue({
    admin: args.admin,
    types: [CONTACT_QUEUE_TYPE_SIGNUP_NO_PROFILE_SUBMIT],
    userId: args.userId,
  });
}

export async function enqueueProfileSubmittedNoAnswer(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  payload?: Json;
  userId: string;
}) {
  if (await isOnboardingDone(args)) return;

  const payload =
    args.payload &&
    typeof args.payload === "object" &&
    !Array.isArray(args.payload)
      ? args.payload
      : {};
  const nextPayload: Json = {
    ...payload,
    conversationId: args.conversationId ?? null,
  };

  const { data: existing, error: existingError } = await args.admin
    .from("contact_queue")
    .select("id,status")
    .eq("user_id", args.userId)
    .eq("type", CONTACT_QUEUE_TYPE_PROFILE_SUBMITTED_NO_ANSWER)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message ?? "Failed to read contact queue");
  }

  if (existing) {
    if (!isReschedulableStatus(existing.status)) {
      return;
    }

    const { error } = await args.admin
      .from("contact_queue")
      .update({
        attempts: 0,
        cancelled_at: null,
        last_error: null,
        locked_at: null,
        locked_by: null,
        payload: nextPayload,
        scheduled_at: scheduledAtAfterRandomDelay(),
        status: "queued",
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message ?? "Failed to reschedule profile contact");
    }
    return;
  }

  const { error } = await args.admin.from("contact_queue").insert({
    payload: nextPayload,
    scheduled_at: scheduledAtAfterRandomDelay(),
    status: "queued",
    type: CONTACT_QUEUE_TYPE_PROFILE_SUBMITTED_NO_ANSWER,
    user_id: args.userId,
  });

  if (error && !isUniqueViolation(error)) {
    throw new Error(error.message ?? "Failed to enqueue profile contact");
  }
}

export async function cancelProfileSubmittedNoAnswer(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  await cancelContactQueue({
    admin: args.admin,
    types: [CONTACT_QUEUE_TYPE_PROFILE_SUBMITTED_NO_ANSWER],
    userId: args.userId,
  });
}

export async function cancelCareerOnboardingContactQueue(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  await cancelContactQueue({
    admin: args.admin,
    types: [
      CONTACT_QUEUE_TYPE_SIGNUP_NO_PROFILE_SUBMIT,
      CONTACT_QUEUE_TYPE_PROFILE_SUBMITTED_NO_ANSWER,
    ],
    userId: args.userId,
  });
}
