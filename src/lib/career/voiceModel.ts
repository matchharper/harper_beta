export const CAREER_REALTIME_MODEL = "gpt-realtime-2.1" as const;
export const CAREER_LIVE_MODEL = "gpt-live-1" as const;

export type CareerVoiceModel =
  | typeof CAREER_REALTIME_MODEL
  | typeof CAREER_LIVE_MODEL;

export type CareerVoiceModelOverride = CareerVoiceModel | null;

export function resolveCareerVoiceModel(
  modelOverride?: string | null
): CareerVoiceModel {
  const normalized = modelOverride?.trim().toLowerCase();
  return normalized === CAREER_LIVE_MODEL
    ? CAREER_LIVE_MODEL
    : CAREER_REALTIME_MODEL;
}

export function isCareerLiveModel(model: CareerVoiceModel) {
  return model === CAREER_LIVE_MODEL;
}
