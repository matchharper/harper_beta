import { isOrgAgentTerminalToolName } from "@/lib/org/agent/tools";

export function shouldRetryOrgAgentTerminalInputError(args: {
  isToolInputError: boolean;
  terminalMutationUsed: boolean;
  toolName: string;
}) {
  return (
    args.isToolInputError &&
    isOrgAgentTerminalToolName(args.toolName) &&
    !args.terminalMutationUsed
  );
}
