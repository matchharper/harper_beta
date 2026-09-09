export const OPS_MATCHING_ROLE_OPTION_STATUSES = [
  "active",
  "top_priority",
  "paused",
  "ended",
] as const;

export function getOpsMatchingRoleOptionLabel(args: {
  roleName: string;
  status: string;
}) {
  const statusLabel =
    args.status === "paused"
      ? "중단"
      : args.status === "ended"
        ? "종료"
        : null;

  return `Role: ${args.roleName}${statusLabel ? ` · ${statusLabel}` : ""}`;
}
