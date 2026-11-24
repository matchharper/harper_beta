import { TOOL_RUNTIME_CONTROL } from "@/lib/llm/toolError";

export class CareerAgentReplyUnavailable extends Error {
  readonly [TOOL_RUNTIME_CONTROL] = true;
  constructor(readonly replyId: string, readonly completed: boolean) {
    super(completed ? "Career reply already completed" : "Career conversation has an active reply");
    this.name = "CareerAgentReplyUnavailable";
  }
}

/**
 * A Career invocation failed and will be attempted again after a wait. The
 * queue handler uses `retryAfterSeconds` instead of its fixed redelivery.
 */
export class CareerInvocationRetryLater extends Error {
  constructor(readonly retryAfterSeconds: number, cause?: unknown) {
    super(cause instanceof Error ? cause.message : "Career invocation will retry later", { cause });
    this.name = "CareerInvocationRetryLater";
  }
}
