type InternalOpportunityCallDecision = {
  doRequest: boolean;
  questions: string[];
  reasoning: string | null;
  resumePromptNeeded: boolean;
  userFacingReason: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const optionalString = (value: unknown) =>
  typeof value === "string" ? value.trim() || null : null;
export const normalizeQuestionList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const text = optionalString(item);
        return text ? [text] : [];
      })
    : [];

export function parseDecision(raw: string): InternalOpportunityCallDecision {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {
        doRequest: false,
        questions: [],
        reasoning: "LLM returned non-object JSON.",
        resumePromptNeeded: false,
        userFacingReason: null,
      };
    }

    const questions = normalizeQuestionList(parsed.questions);
    const doRequest = parsed.do_request === true || parsed.doRequest === true;

    return {
      doRequest,
      questions,
      reasoning: optionalString(parsed.reasoning),
      resumePromptNeeded:
        parsed.resume_prompt_needed === true ||
        parsed.resumePromptNeeded === true,
      userFacingReason: optionalString(
        parsed.user_facing_reason ?? parsed.userFacingReason
      ),
    };
  } catch {
    return {
      doRequest: false,
      questions: [],
      reasoning: "LLM response was not parseable JSON.",
      resumePromptNeeded: false,
      userFacingReason: null,
    };
  }
}
