import "server-only";

import {
  createChatCompletionWithFallback,
  usesMaxCompletionTokensForModel,
} from "@/lib/llm/llm";
import { ORG_AGENT_TERRA_MODEL } from "@/lib/org/agent/modelConfig";
import {
  buildRoleCalibrationFeedbackSystemPrompt,
  buildRoleCalibrationFeedbackUserPrompt,
  parseRoleCalibrationFeedbackDraft,
  ROLE_CALIBRATION_FEEDBACK_JSON_SCHEMA,
} from "@/lib/org/agent/roleCalibrationFeedbackPrompt";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assistantContent(response: unknown) {
  const choices = Array.isArray(object(response).choices)
    ? (object(response).choices as unknown[])
    : [];
  const content = object(object(choices[0]).message).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      const part = object(item);
      return typeof part.text === "string" ? part.text : "";
    })
    .join("");
}

export async function generateRoleCalibrationFeedback(args: {
  calibration: unknown;
  companyContext: string;
  companySideContext: string;
  currentHiringBrief: string | null;
  roleDescription: string | null;
  roleName: string;
  signal?: AbortSignal;
  userMessage: string;
}) {
  const signal = args.signal
    ? AbortSignal.any([args.signal, AbortSignal.timeout(120_000)])
    : AbortSignal.timeout(120_000);
  const completion = await createChatCompletionWithFallback({
    buildRequest: (model) => ({
      ...(usesMaxCompletionTokensForModel(model)
        ? { max_completion_tokens: 8_000 }
        : { max_tokens: 8_000 }),
      messages: [
        {
          content: buildRoleCalibrationFeedbackSystemPrompt(),
          role: "system" as const,
        },
        {
          content: buildRoleCalibrationFeedbackUserPrompt(args),
          role: "user" as const,
        },
      ],
      response_format: {
        json_schema: {
          name: "role_calibration_profile_feedback",
          schema: ROLE_CALIBRATION_FEEDBACK_JSON_SCHEMA,
          strict: true,
        },
        type: "json_schema" as const,
      },
    }),
    debugLabel: "org/agent:role-calibration-profile-feedback",
    model: ORG_AGENT_TERRA_MODEL,
    openAIResponses: { reasoningEffort: "high" },
    signal,
  });
  return {
    ...parseRoleCalibrationFeedbackDraft(assistantContent(completion.response)),
    model: completion.model,
    reasoningEffort: "high" as const,
  };
}
