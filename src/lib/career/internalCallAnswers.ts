import { z } from "zod";

export const internalCallAnswerSchema = z.discriminatedUnion("decision", [
  z.object({
    questionIndex: z.number().int().nonnegative(),
    decision: z.literal("answer"),
    text: z.string(),
  }),
  z.object({
    questionIndex: z.number().int().nonnegative(),
    decision: z.literal("skip"),
  }),
]);
export const internalCallSubmissionSchema = z.object({
  callId: z.string().uuid(),
  conversationId: z.string().uuid(),
  questions: z.array(z.string()),
  responses: z.array(internalCallAnswerSchema),
});
export type InternalCallAnswer = z.infer<typeof internalCallAnswerSchema>;
export type InternalCallSubmission = z.infer<
  typeof internalCallSubmissionSchema
>;
export type InternalCallChatSubmission = Omit<
  InternalCallSubmission,
  "conversationId"
>;
export type InternalCallQuestionForm = {
  id: string;
  companyName: string;
  roleTitle: string;
  questions: string[];
  status: string;
  submitted: boolean;
  replyCompleted?: boolean;
  questionAnswers?: Record<string, string>;
};

// The saved question index is the executor's identifier. No language, length,
// question-count or answer-quality rules are imposed here.
export function validateInternalCallAnswers(
  questions: string[],
  input: InternalCallSubmission
) {
  if (
    questions.length !== input.questions.length ||
    questions.some((q, i) => q !== input.questions[i])
  ) {
    throw Object.assign(
      new Error("Questions changed. Reopen the form before submitting."),
      { status: 409 }
    );
  }
  const indices = new Set<number>();
  for (const answer of input.responses) {
    if (
      answer.questionIndex >= questions.length ||
      indices.has(answer.questionIndex)
    ) {
      throw Object.assign(new Error("Invalid question reference"), {
        status: 400,
      });
    }
    indices.add(answer.questionIndex);
  }
  if (indices.size !== questions.length)
    throw Object.assign(
      new Error("Each question needs an answer or an explicit skip"),
      { status: 400 }
    );
  return [...input.responses].sort((a, b) => a.questionIndex - b.questionIndex);
}
