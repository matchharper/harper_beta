import type { Json } from "@/types/database.types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

export const TALENT_CALL_KIND_CAREER_CHECK_IN = "career_check_in";
export const TALENT_CALL_STATUS_PENDING = "pending";
export const TALENT_CALL_STATUS_ACTIVE = "active";
export const TALENT_CALL_STATUS_COMPLETED = "completed";

type CareerCheckInCallRow = {
  completed_at: string | null;
  conversation_id: string | null;
  created_at: string;
  id: string;
  kind: string;
  last_active_at: string;
  started_at: string;
  state: Json;
  status: string;
  updated_at: string;
  user_id: string;
};

export type CareerCheckInCallRequest = {
  createdAt: string;
  id: string;
  status: string;
  updatedAt: string;
};

const serializeCareerCheckInCallRequest = (
  row: CareerCheckInCallRow | null
): CareerCheckInCallRequest | null =>
  row
    ? {
        createdAt: row.created_at,
        id: row.id,
        status: row.status,
        updatedAt: row.updated_at,
      }
    : null;

export async function fetchOpenCareerCheckInCall(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_calls")
    .select("*")
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_CAREER_CHECK_IN)
    .in("status", [TALENT_CALL_STATUS_PENDING, TALENT_CALL_STATUS_ACTIVE])
    .order("last_active_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to read career check-in call");
  }

  return serializeCareerCheckInCallRequest(
    (data ?? null) as CareerCheckInCallRow | null
  );
}

export async function touchOpenCareerCheckInCall(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  userId: string;
}) {
  const pendingCall = await fetchOpenCareerCheckInCall(args);
  if (!pendingCall) return null;

  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("talent_calls")
    .update({
      conversation_id: args.conversationId ?? null,
      last_active_at: now,
      started_at: now,
      status: TALENT_CALL_STATUS_ACTIVE,
      updated_at: now,
    })
    .eq("id", pendingCall.id)
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_CAREER_CHECK_IN)
    .in("status", [TALENT_CALL_STATUS_PENDING, TALENT_CALL_STATUS_ACTIVE])
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to start career check-in call");
  }

  return serializeCareerCheckInCallRequest(
    (data ?? null) as CareerCheckInCallRow | null
  );
}

export async function completeOpenCareerCheckInCalls(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("talent_calls")
    .update({
      completed_at: now,
      last_active_at: now,
      status: TALENT_CALL_STATUS_COMPLETED,
      updated_at: now,
    })
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_CAREER_CHECK_IN)
    .in("status", [TALENT_CALL_STATUS_PENDING, TALENT_CALL_STATUS_ACTIVE])
    .select("id");

  if (error) {
    throw new Error(error.message ?? "Failed to complete career check-in call");
  }

  return (data ?? []).map((row) => row.id);
}
