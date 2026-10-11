// Keep self-serve signup paused until payment testing is complete.
export const COMPANY_SELF_SERVE_SIGNUP_ENABLED = false;

// Use the verified Workspace ID so another company cannot opt in by renaming itself.
export const HARPER_BILLING_WORKSPACE_ID =
  "720254d7-aeb7-4709-a56f-7b822f89eac5";

export function canUseWorkspaceBilling(workspaceId: string) {
  return workspaceId === HARPER_BILLING_WORKSPACE_ID;
}
