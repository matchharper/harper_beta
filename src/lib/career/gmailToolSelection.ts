export function shouldExposeConnectedGmailTool(args: {
  allowedToolNames?: readonly string[] | null;
  channel?: "chat" | "voice" | null;
  hasActiveGmailIntegration?: boolean | null;
  isOnboardingDone?: boolean | null;
}) {
  if (
    args.channel === "voice" ||
    args.hasActiveGmailIntegration !== true ||
    args.isOnboardingDone !== true
  ) {
    return false;
  }

  return Array.isArray(args.allowedToolNames)
    ? args.allowedToolNames.includes("search_connected_gmail")
    : true;
}
