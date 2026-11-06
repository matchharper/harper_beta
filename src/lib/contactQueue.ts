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

async function ensureCareerDiscovery(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { error } = await (args.admin.rpc as any)("ensure_career_check_in", { p_user_id: args.userId });
  if (error) throw new Error(error.message ?? "Failed to initialize Career discovery");
}

export async function enqueueSignupNoProfileSubmit(args: {
  admin: TalentAdminClient;
  payload?: Json;
  userId: string;
}) {
  await ensureCareerDiscovery(args);
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
  await ensureCareerDiscovery(args);
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
