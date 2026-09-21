import "server-only";

import type { Json } from "@/types/database.types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  CAREER_VOICE_MODEL_EXPERIMENT,
  type CareerVoiceModel,
} from "@/lib/career/voiceModel";

export const CAREER_VOICE_MODEL_EXPOSURE_EVENT =
  "career_voice_model_exposure" as const;
export const CAREER_VOICE_MODEL_SESSION_ATTEMPT_EVENT =
  "career_voice_model_session_attempt" as const;
export const CAREER_VOICE_MODEL_SESSION_FAILED_EVENT =
  "career_voice_model_session_failed" as const;
export const CAREER_VOICE_MODEL_CALL_COMPLETED_EVENT =
  "career_voice_model_call_completed" as const;

type ExperimentMetadataValue = string | number | boolean | null;

async function insertCareerVoiceExperimentLog(args: {
  admin: TalentAdminClient;
  eventType:
    | typeof CAREER_VOICE_MODEL_SESSION_ATTEMPT_EVENT
    | typeof CAREER_VOICE_MODEL_SESSION_FAILED_EVENT
    | typeof CAREER_VOICE_MODEL_EXPOSURE_EVENT
    | typeof CAREER_VOICE_MODEL_CALL_COMPLETED_EVENT;
  metadata: Record<string, ExperimentMetadataValue>;
  userId: string;
}) {
  try {
    const { error } = await args.admin.from("logs").insert({
      type: args.eventType,
      user_id: args.userId,
      meta_data: {
        experiment: CAREER_VOICE_MODEL_EXPERIMENT,
        ...args.metadata,
      } as Json,
    });

    if (!error) return true;
    console.error("[career-voice-experiment] Failed to save event", {
      error: error.message,
      eventType: args.eventType,
      userId: args.userId,
    });
    return false;
  } catch (error) {
    console.error("[career-voice-experiment] Failed to save event", {
      error: error instanceof Error ? error.message : String(error),
      eventType: args.eventType,
      userId: args.userId,
    });
    return false;
  }
}

export function logCareerVoiceModelSessionAttempt(args: {
  admin: TalentAdminClient;
  callSessionId?: string | null;
  conversationId: string;
  model: CareerVoiceModel;
  userId: string;
}) {
  return insertCareerVoiceExperimentLog({
    admin: args.admin,
    eventType: CAREER_VOICE_MODEL_SESSION_ATTEMPT_EVENT,
    metadata: {
      callSessionId: args.callSessionId?.trim() || null,
      conversationId: args.conversationId,
      model: args.model,
    },
    userId: args.userId,
  });
}

export function logCareerVoiceModelSessionFailed(args: {
  admin: TalentAdminClient;
  callSessionId?: string | null;
  conversationId: string;
  failureType: "invalid_response" | "network_error" | "provider_error";
  model: CareerVoiceModel;
  status?: number | null;
  userId: string;
}) {
  return insertCareerVoiceExperimentLog({
    admin: args.admin,
    eventType: CAREER_VOICE_MODEL_SESSION_FAILED_EVENT,
    metadata: {
      callSessionId: args.callSessionId?.trim() || null,
      conversationId: args.conversationId,
      failureType: args.failureType,
      model: args.model,
      status: args.status ?? null,
    },
    userId: args.userId,
  });
}

export function logCareerVoiceModelExposure(args: {
  admin: TalentAdminClient;
  callSessionId?: string | null;
  conversationId: string;
  model: CareerVoiceModel;
  userId: string;
}) {
  return insertCareerVoiceExperimentLog({
    admin: args.admin,
    eventType: CAREER_VOICE_MODEL_EXPOSURE_EVENT,
    metadata: {
      callSessionId: args.callSessionId?.trim() || null,
      conversationId: args.conversationId,
      model: args.model,
    },
    userId: args.userId,
  });
}

export function logCareerVoiceModelCallCompleted(args: {
  admin: TalentAdminClient;
  callKind: string;
  callSessionId: string;
  conversationId: string;
  durationSeconds: number;
  totalTurns: number;
  userId: string;
  userTurns: number;
}) {
  return insertCareerVoiceExperimentLog({
    admin: args.admin,
    eventType: CAREER_VOICE_MODEL_CALL_COMPLETED_EVENT,
    metadata: {
      callKind: args.callKind,
      callSessionId: args.callSessionId,
      conversationId: args.conversationId,
      durationSeconds: args.durationSeconds,
      totalTurns: args.totalTurns,
      userTurns: args.userTurns,
    },
    userId: args.userId,
  });
}
