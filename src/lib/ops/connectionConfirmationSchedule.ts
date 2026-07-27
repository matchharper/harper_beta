const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WORKING_TIME_START_HOUR = 8;
const WORKING_TIME_END_HOUR = 19;

function kstDateAtHour(localDate: Date, hour: number) {
  return new Date(
    Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
      hour
    ) - KST_OFFSET_MS
  );
}

export function isInternalConnectionWorkingTime(value: Date) {
  const local = new Date(value.getTime() + KST_OFFSET_MS);
  const localHour = local.getUTCHours();
  return (
    localHour >= WORKING_TIME_START_HOUR && localHour < WORKING_TIME_END_HOUR
  );
}

export function calculateInternalConnectionConfirmationScheduledAt(args: {
  acceptedAt: Date;
  stageChangedAt: Date;
}) {
  const earliestAcceptedAt = args.acceptedAt.getTime() + DAY_MS;
  const baseAt = new Date(
    Math.max(earliestAcceptedAt, args.stageChangedAt.getTime())
  );
  const local = new Date(baseAt.getTime() + KST_OFFSET_MS);
  const localHour = local.getUTCHours();

  if (localHour < WORKING_TIME_START_HOUR) {
    return kstDateAtHour(local, WORKING_TIME_START_HOUR);
  }
  if (localHour >= WORKING_TIME_END_HOUR) {
    const nextLocalDate = new Date(local.getTime() + DAY_MS);
    return kstDateAtHour(nextLocalDate, WORKING_TIME_START_HOUR);
  }
  return baseAt;
}
