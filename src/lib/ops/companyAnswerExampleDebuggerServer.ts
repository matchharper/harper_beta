import {
  ANSWER_EXAMPLE_DEFAULT_LOOKUP_TIMEOUT_MS,
  ANSWER_EXAMPLE_DEFAULT_MIN_SCORE,
  ANSWER_EXAMPLE_DEFAULT_TOP_K,
  ANSWER_EXAMPLE_EMBEDDING_MODEL,
  buildServiceAnswerExamplesPromptBlock,
  lookupAnswerExamples,
  normalizeAnswerExampleEmbeddingInput,
  type AnswerExampleLookupResponse,
} from "@/lib/serviceAnswerExamples";
import type {
  OpsCompanyAnswerExampleDebugInput,
  OpsCompanyAnswerExampleDebugResponse,
} from "@/lib/ops/companyAnswerExampleDebugger";

const MAX_MESSAGE_LENGTH = 8_000;

export class OpsCompanyAnswerExampleDebugInputError extends Error {}

type LookupAnswerExamples = (
  question: string,
  options: { audience: "company"; minScore: number; topK: number }
) => Promise<AnswerExampleLookupResponse>;

function parseMinScore(value: unknown) {
  if (value === undefined) return ANSWER_EXAMPLE_DEFAULT_MIN_SCORE;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new OpsCompanyAnswerExampleDebugInputError(
      "minScore must be a number"
    );
  }
  if (value < 0 || value > 1) {
    throw new OpsCompanyAnswerExampleDebugInputError(
      "minScore must be between 0 and 1"
    );
  }
  return value;
}

function parseTopK(value: unknown) {
  if (value === undefined) return ANSWER_EXAMPLE_DEFAULT_TOP_K;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 10) {
    throw new OpsCompanyAnswerExampleDebugInputError(
      "topK must be an integer between 1 and 10"
    );
  }
  return Number(value);
}

export async function runOpsCompanyAnswerExampleDebug(
  input: OpsCompanyAnswerExampleDebugInput,
  dependencies?: { lookup?: LookupAnswerExamples }
): Promise<OpsCompanyAnswerExampleDebugResponse> {
  if (typeof input.message !== "string") {
    throw new OpsCompanyAnswerExampleDebugInputError("message is required");
  }
  const normalizedInput = normalizeAnswerExampleEmbeddingInput(input.message);
  if (!normalizedInput) {
    throw new OpsCompanyAnswerExampleDebugInputError("message is required");
  }
  if (normalizedInput.length > MAX_MESSAGE_LENGTH) {
    throw new OpsCompanyAnswerExampleDebugInputError("message is too long");
  }
  const minScore = parseMinScore(input.minScore);
  const topK = parseTopK(input.topK);

  const startedAt = performance.now();
  const result = await (dependencies?.lookup ?? lookupAnswerExamples)(
    input.message,
    { audience: "company", minScore, topK }
  );

  return {
    configuration: {
      audience: "company",
      embeddingModel: ANSWER_EXAMPLE_EMBEDDING_MODEL,
      minScore,
      timeoutMs: ANSWER_EXAMPLE_DEFAULT_LOOKUP_TIMEOUT_MS,
      topK,
    },
    durationMs: Math.round(performance.now() - startedAt),
    lookupInstruction: result.assistantInstruction,
    matches: result.examples,
    normalizedInput,
    promptBlock: buildServiceAnswerExamplesPromptBlock({
      audience: "company",
      examples: result.examples,
    }),
  };
}
