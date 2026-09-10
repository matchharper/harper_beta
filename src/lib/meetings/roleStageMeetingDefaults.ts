export type RoleStageMeetingDefaults = {
  candidateMessage: string | null;
  durationMinutes: number | null;
  meetingPurpose: string | null;
};

export type RoleStageMeetingDefaultsPatch = Partial<{
  meeting_candidate_message: string | null;
  meeting_duration_minutes: number | null;
  meeting_purpose: string | null;
}>;

export class RoleStageMeetingDefaultsValidationError extends Error {}

function has(object: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function nullableText(value: unknown, maxLength: number, singleLine: boolean) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replaceAll("\u0000", "").trim();
  const text = singleLine ? normalized.replace(/\s+/g, " ") : normalized;
  if (text.length > maxLength) {
    throw new RoleStageMeetingDefaultsValidationError(
      `Meeting stage text exceeds ${maxLength.toLocaleString()} characters`
    );
  }
  return text || null;
}

function nullableDuration(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 15 ||
    value > 240 ||
    value % 15 !== 0
  ) {
    throw new RoleStageMeetingDefaultsValidationError(
      "Meeting duration must be an integer from 15 to 240 minutes in 15-minute increments"
    );
  }
  return value;
}

export function resolveRoleStageMeetingDefaultsUpdate(args: {
  current: RoleStageMeetingDefaults;
  input: Record<string, unknown>;
}) {
  const purposeProvided = has(args.input, "meetingPurpose");
  const durationProvided = has(args.input, "meetingDurationMinutes");
  const candidateMessageProvided = has(args.input, "meetingCandidateMessage");
  if (!purposeProvided && !durationProvided && !candidateMessageProvided) {
    throw new RoleStageMeetingDefaultsValidationError(
      "At least one meeting default must be provided"
    );
  }

  const meetingPurpose = purposeProvided
    ? nullableText(args.input.meetingPurpose, 600, true)
    : args.current.meetingPurpose;
  const durationMinutes = durationProvided
    ? nullableDuration(args.input.meetingDurationMinutes)
    : args.current.durationMinutes;
  const candidateMessage = candidateMessageProvided
    ? nullableText(args.input.meetingCandidateMessage, 2_000, false)
    : args.current.candidateMessage;

  if (Boolean(meetingPurpose) !== (durationMinutes !== null)) {
    throw new RoleStageMeetingDefaultsValidationError(
      "Meeting purpose and duration must both be set, or both be cleared"
    );
  }

  const patch: RoleStageMeetingDefaultsPatch = {};
  if (purposeProvided) patch.meeting_purpose = meetingPurpose;
  if (durationProvided) patch.meeting_duration_minutes = durationMinutes;
  if (candidateMessageProvided) {
    patch.meeting_candidate_message = candidateMessage;
  }
  const changed =
    (purposeProvided && meetingPurpose !== args.current.meetingPurpose) ||
    (durationProvided && durationMinutes !== args.current.durationMinutes) ||
    (candidateMessageProvided &&
      candidateMessage !== args.current.candidateMessage);

  return {
    changed,
    patch,
    value: {
      candidateMessage,
      durationMinutes,
      meetingPurpose,
    } satisfies RoleStageMeetingDefaults,
  };
}
