export type AutoIntroLlmToolCallTrace = {
  arguments: string;
  id: string;
  name: string;
};

export type AutoIntroLlmTraceEvent =
  | {
      model: string;
      systemPrompt: string;
      type: "prompt";
      userPrompt: string;
    }
  | {
      iteration: number;
      messageCount: number;
      model: string;
      type: "llm_request";
      webToolsAvailable: boolean;
    }
  | {
      content: string;
      iteration: number;
      model: string;
      toolCalls: AutoIntroLlmToolCallTrace[];
      type: "llm_response";
      usage: Record<string, unknown> | null;
    }
  | {
      arguments: string;
      callId: string;
      input: Record<string, unknown> | null;
      iteration: number;
      name: string;
      type: "tool_start";
    }
  | {
      callId: string;
      content: string;
      iteration: number;
      name: string;
      type: "tool_result";
    }
  | {
      model: string;
      output: Record<string, unknown>;
      type: "submission";
      webToolCallCount: number;
    };

export type AutoIntroManualTraceEvent =
  | AutoIntroLlmTraceEvent
  | {
      message: string;
      stage: "loading_context" | "generating" | "delivering";
      type: "status";
    }
  | {
      body: string;
      idempotencyKey: string;
      slackConnected: boolean;
      slackError: string | null;
      slackSent: boolean;
      type: "delivery";
    }
  | {
      message: string;
      type: "error";
    };

export type AutoIntroManualDoneEvent = {
  companyName: string;
  model: string;
  ok: boolean;
  roleTitle: string;
  slackSent: boolean;
  type: "done";
  webToolCallCount: number;
};
