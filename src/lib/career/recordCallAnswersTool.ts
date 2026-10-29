import { z } from "zod";
import { formatInternalCallQuestionContext } from "@/lib/talentOnboarding/internalOpportunityCallProgress";
import {
  recordInternalCallAnswers,
  type CallAnswersTransaction,
} from "./internalCallAnswersStore";

export const RECORD_CALL_ANSWERS = "record_call_answers";
export const recordCallAnswersParameters = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_number: {
            type: "integer",
            description:
              "The question number from the current call's question plan.",
          },
          response: {
            type: "string",
            description:
              "What the caller said about this question, including uncertainty, not knowing, declining, or choosing to skip. Preserve their meaning. A correction replaces the previous recorded response.",
          },
        },
        required: ["question_number", "response"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
};
const schema = z.object({
  answers: z.array(
    z.object({ question_number: z.number().int(), response: z.string() })
  ),
});

export async function executeRecordCallAnswers(args: {
  input: Record<string, unknown>;
  callId: string;
  conversationId: string;
  userId: string;
  transaction: CallAnswersTransaction;
}) {
  // These values become UUID parameters in the owner-scoped SQL query.
  if (
    ![args.callId, args.conversationId, args.userId].every(
      (id) => z.string().uuid().safeParse(id).success
    )
  )
    throw Object.assign(new Error("Invalid call or conversation identifier."), {
      status: 400,
    });
  const parsed = schema.safeParse(args.input);
  if (!parsed.success)
    throw Object.assign(
      new Error("Provide question numbers and response text."),
      { status: 400 }
    );
  const call = await recordInternalCallAnswers({
    ...args,
    answers: parsed.data.answers,
  });
  return {
    call,
    modelOutput: [
      "Responses saved for the current call.",
      formatInternalCallQuestionContext(call),
    ].join("\n"),
  };
}
