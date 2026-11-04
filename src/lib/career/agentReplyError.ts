import { TOOL_RUNTIME_CONTROL } from "@/lib/llm/toolError";

export class CareerAgentReplyUnavailable extends Error {
  readonly [TOOL_RUNTIME_CONTROL] = true;
  constructor(readonly replyId: string, readonly completed: boolean) {
    super(completed ? "Career reply already completed" : "Career conversation has an active reply");
    this.name = "CareerAgentReplyUnavailable";
  }
}
