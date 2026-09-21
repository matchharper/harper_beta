export const CAREER_REALTIME_MODEL = "gpt-realtime-2.1" as const;
export const CAREER_LIVE_MODEL = "gpt-live-1" as const;
export const CAREER_VOICE_MODEL_EXPERIMENT =
  "career_voice_model_v1" as const;

export type CareerVoiceModel =
  | typeof CAREER_REALTIME_MODEL
  | typeof CAREER_LIVE_MODEL;

export type CareerVoiceModelOverride = CareerVoiceModel | null;

export function resolveCareerVoiceModel(
  modelOverride?: string | null,
  userId?: string | null
): CareerVoiceModel {
  const normalized = modelOverride?.trim().toLowerCase();
  if (normalized === CAREER_LIVE_MODEL) return CAREER_LIVE_MODEL;
  if (normalized === CAREER_REALTIME_MODEL) return CAREER_REALTIME_MODEL;

  return assignCareerVoiceModel(userId);
}

export function assignCareerVoiceModel(
  userId?: string | null
): CareerVoiceModel {
  const normalizedUserId = userId?.trim().toLowerCase();
  if (!normalizedUserId) return CAREER_REALTIME_MODEL;

  // FNV-1a gives each stable user identifier one deterministic experiment
  // bucket without persisting mutable assignment state.
  let hash = 0x811c9dc5;
  const input = `${CAREER_VOICE_MODEL_EXPERIMENT}:${normalizedUserId}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return (hash >>> 0) < 0x80000000
    ? CAREER_REALTIME_MODEL
    : CAREER_LIVE_MODEL;
}

export function isCareerLiveModel(model: CareerVoiceModel) {
  return model === CAREER_LIVE_MODEL;
}
