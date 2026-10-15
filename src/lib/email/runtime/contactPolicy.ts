import { asObject, type EmailRow } from "./types";

export const INTERNAL_STAGE_TAGS = new Set([
  "내부:추천",
  "내부:연결대기",
  "내부:연결됨",
  "내부:수락",
  "내부:거절",
  "내부:보류",
  "내부:최종오퍼",
  "내부:아카이브",
  "내부:프로세스중단",
]);
export function isInternalStageTag(value: unknown) {
  return (
    INTERNAL_STAGE_TAGS.has(String(value)) ||
    String(value).startsWith("내부단계:")
  );
}
export function nextKstWorkingTime(value: number) {
  const shifted = new Date(value + 9 * 3_600_000);
  const hour = shifted.getUTCHours();
  if (hour < 8) shifted.setUTCHours(8, 0, 0, 0);
  else if (hour >= 19) {
    shifted.setUTCDate(shifted.getUTCDate() + 1);
    shifted.setUTCHours(8, 0, 0, 0);
  }
  return new Date(shifted.getTime() - 9 * 3_600_000).toISOString();
}
export function connectionNoticeWaitUntil(
  job: EmailRow,
  recommendation: EmailRow,
  now = Date.now()
) {
  const override = asObject(asObject(job.payload).manualOverride);
  if (
    override.bypassAcceptanceDelay === true &&
    override.bypassWorkingTime === true
  )
    return null;
  const accepted = Date.parse(
    recommendation.feedback_at ?? recommendation.created_at
  );
  if (!Number.isFinite(accepted)) throw new Error("invalid_acceptance_time");
  const earliest = accepted + 24 * 3_600_000;
  const eligible = nextKstWorkingTime(Math.max(earliest, now));
  return Date.parse(eligible) > now ? eligible : null;
}
export function companyRequestWaitUntil(
  job: EmailRow,
  request: EmailRow,
  now = Date.now()
) {
  if (asObject(job.payload).deliveryMode === "immediate") return null;
  const created = Date.parse(request.created_at);
  if (!Number.isFinite(created))
    throw new Error("company_request_created_at_missing");
  return created + 300_000 > now
    ? new Date(created + 300_000).toISOString()
    : null;
}
export function meetingDeliveryBlock(
  job: EmailRow,
  round: EmailRow | null,
  schedule: EmailRow | null,
  profile: EmailRow | null,
  now = Date.now()
) {
  const payload = asObject(job.payload);
  if (
    !round ||
    !schedule ||
    round.delivery_queue_id !== job.id ||
    schedule.talent_id !== job.user_id ||
    round.schedule_id !== schedule.id ||
    payload.meetingScheduleId !== schedule.id ||
    payload.meetingScheduleRoundId !== round.id
  )
    return "meeting_invitation_schedule_mismatch";
  if (
    schedule.active_round_id !== round.id ||
    schedule.status !== "awaiting_talent" ||
    round.status !== "queued"
  )
    return "meeting_invitation_not_sendable";
  if (
    !Number.isFinite(Date.parse(round.invitation_expires_at)) ||
    Date.parse(round.invitation_expires_at) <= now
  )
    return "meeting_invitation_expired";
  if (!profile || profile.deleted_at) return "talent_account_deleted";
  if (!profile.email) return "missing_talent_email";
  if (
    String(profile.email).trim().toLowerCase() !==
    String(payload.to).trim().toLowerCase()
  )
    return "candidate_email_changed";
  return null;
}
export function crmRecipientBlock(
  broadcast: EmailRow | null,
  profile: EmailRow | null,
  setting: EmailRow | null,
  recipient: string
) {
  if (!broadcast || !profile || !setting)
    return "broadcast_or_recipient_not_found";
  if (profile.deleted_at) return "talent_account_deleted";
  if (!profile.email) return "missing_talent_email";
  if (String(profile.email).trim().toLowerCase() !== recipient.toLowerCase())
    return "talent_email_changed";
  if (
    setting.profile_visibility === "dont_share" ||
    (!setting.get_external_recommendation &&
      !setting.get_internal_recommendation)
  )
    return "all_harper_contact_stopped";
  return null;
}
