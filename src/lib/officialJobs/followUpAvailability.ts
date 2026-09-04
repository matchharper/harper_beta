const OFFICIAL_JOB_FOLLOW_UP_ALLOWED_ROLE_STATUSES = new Set([
  "active",
  "paused",
]);

export function isOfficialJobFollowUpRoleAvailable(args: {
  expiresAt: string | null;
  isExpired: boolean;
  nowMs?: number;
  status: string;
}) {
  if (
    !OFFICIAL_JOB_FOLLOW_UP_ALLOWED_ROLE_STATUSES.has(
      args.status.trim().toLowerCase()
    ) ||
    args.isExpired
  ) {
    return false;
  }

  const expiresAt = args.expiresAt?.trim();
  if (!expiresAt) return true;

  const expiresAtMs = Date.parse(expiresAt);
  return (
    !Number.isFinite(expiresAtMs) || expiresAtMs > (args.nowMs ?? Date.now())
  );
}
