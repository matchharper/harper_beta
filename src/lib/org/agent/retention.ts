export const RETAINED_MORE_DATA_USER_TURNS = 3;
export const RETAINED_MORE_DATA_MAX_AGE_HOURS = 24;

export function isOrgAgentRetainedDataActivationActive(args: {
  activatedAt: string | Date;
  now?: Date;
  startedUserTurns: number;
}) {
  const activatedAt =
    args.activatedAt instanceof Date
      ? args.activatedAt
      : new Date(args.activatedAt);
  const now = args.now ?? new Date();
  const age = now.getTime() - activatedAt.getTime();
  return (
    Number.isFinite(age) &&
    age >= 0 &&
    age <= RETAINED_MORE_DATA_MAX_AGE_HOURS * 60 * 60 * 1_000 &&
    args.startedUserTurns >= 1 &&
    args.startedUserTurns <= RETAINED_MORE_DATA_USER_TURNS
  );
}
