export function shouldExposeConnectedGmailTool(args: {
  allowedToolNames?: readonly string[] | null;
  channel?: "chat" | "voice" | null;
  hasActiveGmailIntegration?: boolean | null;
  isOnboardingDone?: boolean | null;
}) {
  if (
    args.channel === "voice" ||
    args.isOnboardingDone !== true
  ) {
    return false;
  }

  return Array.isArray(args.allowedToolNames)
    ? args.allowedToolNames.includes("search_connected_gmail")
    : true;
}

export const GMAIL_DISCONNECTED_TOOL_DESCRIPTION = "Gmail 미연결으로 사용할 수 없음";

export function withCareerGmailConnectionDescription<
  T extends { function: { name: string; description: string } },
>(tool: T, hasActiveGmailIntegration?: boolean | null): T {
  if (!["search_connected_gmail", "write_email"].includes(tool.function.name))
    return tool;
  const suffix = `\n\n${GMAIL_DISCONNECTED_TOOL_DESCRIPTION}`;
  const description = tool.function.description.endsWith(suffix)
    ? tool.function.description.slice(0, -suffix.length)
    : tool.function.description;
  return {
    ...tool,
    function: {
      ...tool.function,
      description: hasActiveGmailIntegration === true
        ? description
        : `${description}${suffix}`,
    },
  };
}
