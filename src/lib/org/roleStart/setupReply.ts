import type { OrgAgentMessage } from "@/lib/org/agent/types";

/** The role conversation also contains independently generated discovery cards. */
export function roleSetupReply(
  messages: ReadonlyArray<Pick<OrgAgentMessage, "role" | "status" | "metadata" | "content">>
): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    const view = message.metadata.roleCreationView;
    if (
      message.role === "assistant" &&
      message.status === "completed" &&
      (view === "role_setup" || view === "role_details")
    ) return message.content;
  }
  return "";
}
