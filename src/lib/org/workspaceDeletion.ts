export const WORKSPACE_DELETION_ERRORS = {
  workspace_delete_owner_required: 403,
  workspace_delete_not_found: 404,
  workspace_delete_name_mismatch: 409,
  workspace_delete_subscription_active: 409,
  workspace_delete_billing_pending: 409,
  workspace_delete_billing_changed: 409,
  workspace_delete_billing_unavailable: 503,
} as const;

export type WorkspaceDeletionError = keyof typeof WORKSPACE_DELETION_ERRORS;

export function workspaceDeletionErrorCode(
  error: unknown
): WorkspaceDeletionError | null {
  const message =
    error instanceof Error
      ? error.message
      : (error as { message?: unknown } | null)?.message;
  return typeof message === "string" &&
    Object.hasOwn(WORKSPACE_DELETION_ERRORS, message)
    ? (message as WorkspaceDeletionError)
    : null;
}
