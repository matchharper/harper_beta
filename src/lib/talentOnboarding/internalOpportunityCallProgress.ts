export type InternalOpportunityCallQuestionProgress = {
  candidateQuestionsAsked: boolean;
  nextQuestionIndex: number;
};

export type InternalOpportunityCallCompletionDisposition =
  | "full"
  | "partial_answered"
  | "unanswered";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeQuestionText = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const QUESTION_MATCH_STOP_WORDS = new Set([
  "경험이",
  "경험을",
  "있다면",
  "있나요",
  "있으신가요",
  "하나",
  "소개해",
  "주세요",
]);

function assistantAskedStoredQuestion(
  assistantText: string,
  storedQuestion: string
) {
  const normalizedAssistant = normalizeQuestionText(assistantText);
  const normalizedQuestion = normalizeQuestionText(storedQuestion);
  if (!normalizedAssistant || !normalizedQuestion) return false;
  if (normalizedAssistant.includes(normalizedQuestion)) return true;

  const questionTokens = Array.from(
    new Set(
      normalizedQuestion
        .split(" ")
        .filter(
          (token) => token.length >= 2 && !QUESTION_MATCH_STOP_WORDS.has(token)
        )
    )
  );
  if (questionTokens.length < 3) return false;

  const matchedTokenCount = questionTokens.filter((token) =>
    normalizedAssistant.includes(token)
  ).length;
  return (
    matchedTokenCount >= 3 && matchedTokenCount / questionTokens.length >= 0.6
  );
}

function assistantAskedCandidateQuestion(assistantText: string) {
  return /궁금(?:하신|한)?\s*(?:점|내용)|질문(?:이|은|을|하실)?|다음\s*(?:진행|과정|절차|프로세스)|추가로\s*(?:확인|알고)|\bquestions?\b|\bnext\s*steps?\b|anything\s+you(?:'d|\s+would)?\s+like\s+to\s+ask/i.test(
    assistantText
  );
}

function isLikelyNonAnswerUserTurn(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return true;

  return [
    /^(?:네[,.! ]*)?(?:안녕하세요|안녕|여보세요|들리세요)[?.! ]*$/i,
    /(?:잘\s*)?못\s*(?:들었|들었어|이해했|알아들었)/,
    /다시\s*(?:말|질문|설명|얘기)/,
    /무슨\s*(?:말|뜻|질문)/,
    /(?:통화|대화).*(?:그만|종료|끝|끊)/,
    /(?:그만할게|종료할게|끊을게|나중에\s*(?:할게|하자))/,
    /\b(?:could you|please)\s+(?:repeat|say that again)\b/i,
    /\b(?:i (?:didn['’]?t|couldn['’]?t) (?:hear|understand)|what do you mean)\b/i,
    /\b(?:end|stop)\s+(?:the\s+)?call\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function isLikelyUserQuestionInsteadOfAnswer(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return [
    /(?:무엇|뭐|어떤|어디|언제|왜|어떻게).*(?:요|까|\?)[?.! ]*$/,
    /(?:인가요|있나요|되나요|하나요|궁금해요|알려주세요)[?.! ]*$/,
    /^(?:what|which|where|when|why|how|can|could|would|is|are|do|does)\b.*\?*$/i,
  ].some((pattern) => pattern.test(normalized));
}

export function normalizeInternalOpportunityCallQuestionProgress(
  value: unknown,
  questionCount: number
): InternalOpportunityCallQuestionProgress {
  const record = isRecord(value) ? value : {};
  const rawNextQuestionIndex = Number(record.nextQuestionIndex);
  const nextQuestionIndex = Number.isInteger(rawNextQuestionIndex)
    ? Math.min(Math.max(rawNextQuestionIndex, 0), Math.max(questionCount, 0))
    : 0;

  return {
    candidateQuestionsAsked: record.candidateQuestionsAsked === true,
    nextQuestionIndex,
  };
}

export function advanceInternalOpportunityCallQuestionProgress(
  progress: InternalOpportunityCallQuestionProgress,
  questionCount: number
): InternalOpportunityCallQuestionProgress {
  const normalized = normalizeInternalOpportunityCallQuestionProgress(
    progress,
    questionCount
  );
  if (normalized.nextQuestionIndex >= questionCount) {
    return {
      candidateQuestionsAsked: true,
      nextQuestionIndex: questionCount,
    };
  }

  const nextQuestionIndex = normalized.nextQuestionIndex + 1;
  return {
    candidateQuestionsAsked:
      normalized.candidateQuestionsAsked || nextQuestionIndex >= questionCount,
    nextQuestionIndex,
  };
}

export function shouldAdvanceInternalOpportunityCallQuestion(args: {
  assistantText: string;
  progress: InternalOpportunityCallQuestionProgress;
  questions: string[];
  userText: string;
}) {
  if (!args.userText.trim() || !args.assistantText.trim()) return false;

  const progress = normalizeInternalOpportunityCallQuestionProgress(
    args.progress,
    args.questions.length
  );
  if (progress.nextQuestionIndex >= args.questions.length) return false;

  const followingQuestion = args.questions[progress.nextQuestionIndex + 1];
  return followingQuestion
    ? assistantAskedStoredQuestion(args.assistantText, followingQuestion)
    : assistantAskedCandidateQuestion(args.assistantText);
}

export function isInternalOpportunityCallQuestionPlanComplete(
  progress: InternalOpportunityCallQuestionProgress,
  questionCount: number
) {
  const normalized = normalizeInternalOpportunityCallQuestionProgress(
    progress,
    questionCount
  );
  return (
    normalized.nextQuestionIndex >= questionCount &&
    normalized.candidateQuestionsAsked
  );
}

export function hasAnsweredAtLeastOneInternalOpportunityCallQuestion(args: {
  progress: InternalOpportunityCallQuestionProgress;
  questions: string[];
  transcript: Array<{ role: "assistant" | "user"; text: string }>;
}) {
  if (args.questions.length <= 0) return false;
  const progress = normalizeInternalOpportunityCallQuestionProgress(
    args.progress,
    args.questions.length
  );
  if (progress.nextQuestionIndex > 0 || progress.candidateQuestionsAsked) {
    return true;
  }

  let assistantAskedPlannedQuestion = false;
  for (const entry of args.transcript) {
    if (entry.role === "assistant") {
      assistantAskedPlannedQuestion ||= args.questions.some((question) =>
        assistantAskedStoredQuestion(entry.text, question)
      );
      continue;
    }

    if (
      assistantAskedPlannedQuestion &&
      !isLikelyNonAnswerUserTurn(entry.text) &&
      !isLikelyUserQuestionInsteadOfAnswer(entry.text)
    ) {
      return true;
    }
  }

  return false;
}

export function getInternalOpportunityCallCompletionDisposition(args: {
  answeredAtLeastOneQuestion: boolean;
  questionPlanComplete: boolean;
}): InternalOpportunityCallCompletionDisposition {
  if (args.questionPlanComplete) return "full";
  return args.answeredAtLeastOneQuestion ? "partial_answered" : "unanswered";
}
