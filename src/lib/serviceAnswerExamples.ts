import { createHash } from "crypto";
import { client as openaiClient } from "@/lib/llm/llm";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

export const ANSWER_EXAMPLE_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_TOP_K = 3;
const DEFAULT_MIN_SCORE = 0.35;
const DEFAULT_LOOKUP_TIMEOUT_MS = 2_500;

export type ServiceAnswerExampleAudience = "career" | "company";

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

export type AnswerExampleLookupResult = {
  answer_example_text: string;
  id: string;
  score: number;
  tags: string[];
  user_example_text: string;
};

export type AnswerExampleLookupResponse = {
  assistantInstruction: string;
  examples: AnswerExampleLookupResult[];
};

type AnswerExampleLookupOptions = {
  admin?: AdminClient;
  audience: ServiceAnswerExampleAudience;
  minScore?: number;
  timeoutMs?: number;
  topK?: number;
};

type MatchRow = {
  answer_example_text: string;
  id: string;
  score: number | null;
  tags: string[] | null;
  user_example_text: string;
};

type RpcMatchResponse = {
  data: MatchRow[] | null;
  error: { code?: string; message?: string } | null;
};

export function normalizeAnswerExampleEmbeddingInput(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function hashAnswerExampleUserText(value: string) {
  return createHash("sha256")
    .update(normalizeAnswerExampleEmbeddingInput(value), "utf8")
    .digest("hex");
}

export async function embedAnswerExampleUserText(value: string) {
  const input = normalizeAnswerExampleEmbeddingInput(value);
  if (!input) {
    throw new Error("user_example_text is required for embedding.");
  }

  const response = await openaiClient.embeddings.create({
    model: ANSWER_EXAMPLE_EMBEDDING_MODEL,
    input,
  });
  const embedding = response.data[0]?.embedding ?? [];
  if (embedding.length === 0) {
    throw new Error("OpenAI returned empty embedding");
  }

  return {
    embedding,
    embeddingModel: ANSWER_EXAMPLE_EMBEDDING_MODEL,
    userExampleHash: hashAnswerExampleUserText(input),
  };
}

async function performAnswerExampleLookup(
  question: string,
  options: AnswerExampleLookupOptions
): Promise<AnswerExampleLookupResponse> {
  const input = normalizeAnswerExampleEmbeddingInput(question ?? "");
  if (!input) {
    return {
      assistantInstruction:
        "No example lookup was run because the user question was empty.",
      examples: [],
    };
  }

  const topK = Math.max(1, Math.min(options.topK ?? DEFAULT_TOP_K, 10));
  const minScore = Math.max(
    0,
    Math.min(options.minScore ?? DEFAULT_MIN_SCORE, 1)
  );
  const admin = options.admin ?? getTalentSupabaseAdmin();

  let embedding: number[];
  try {
    embedding = (await embedAnswerExampleUserText(input)).embedding;
  } catch (error) {
    console.error("[serviceAnswerExamples] embedding failed:", error);
    return {
      assistantInstruction:
        "Example lookup failed. Continue from the system prompt and conversation context.",
      examples: [],
    };
  }

  let matchResponse = (await (admin as any).rpc(
    "match_service_answer_examples",
    {
      audience_filter: options.audience,
      embedding_model_filter: ANSWER_EXAMPLE_EMBEDDING_MODEL,
      match_count: topK,
      min_score: minScore,
      query_embedding: embedding,
    }
  )) as RpcMatchResponse;

  if (matchResponse.error) {
    console.error(
      "[serviceAnswerExamples] match_service_answer_examples failed:",
      matchResponse.error.message ?? "unknown"
    );
    return {
      assistantInstruction:
        "Example lookup failed. Continue from the system prompt and conversation context.",
      examples: [],
    };
  }

  const examples: AnswerExampleLookupResult[] = (matchResponse.data ?? []).map(
    (row) => ({
      answer_example_text: row.answer_example_text,
      id: row.id,
      score:
        typeof row.score === "number" && Number.isFinite(row.score)
          ? row.score
          : 0,
      tags: Array.isArray(row.tags) ? row.tags : [],
      user_example_text: row.user_example_text,
    })
  );

  if (examples.length === 0) {
    return {
      assistantInstruction:
        "No matching ops-authored answer examples were found. Continue from the system prompt and conversation context.",
      examples,
    };
  }

  return {
    assistantInstruction:
      "Use answer_example_text as ops-authored guidance for content and tone. Adapt naturally to the latest user message; do not expose raw IDs or scores.",
    examples,
  };
}

export async function lookupAnswerExamples(
  question: string,
  options: AnswerExampleLookupOptions
): Promise<AnswerExampleLookupResponse> {
  const timeoutMs = Math.max(
    250,
    Math.min(options.timeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS, 10_000)
  );
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      performAnswerExampleLookup(question, options),
      new Promise<AnswerExampleLookupResponse>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn("[serviceAnswerExamples] lookup timed out", {
            audience: options.audience,
            timeoutMs,
          });
          resolve({
            assistantInstruction:
              "Example lookup timed out. Continue from the system prompt and conversation context.",
            examples: [],
          });
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    console.error("[serviceAnswerExamples] lookup failed:", error);
    return {
      assistantInstruction:
        "Example lookup failed. Continue from the system prompt and conversation context.",
      examples: [],
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function buildServiceAnswerExamplesPromptBlock(args: {
  audience: ServiceAnswerExampleAudience;
  examples: AnswerExampleLookupResult[];
}) {
  if (args.examples.length === 0) return null;

  const examples = args.examples.map((example) => ({
    answer_example_text: example.answer_example_text,
    user_example_text: example.user_example_text,
  }));

  return `<service_answer_examples audience="${args.audience}">
These are managed answer examples for this service audience.
- Use an example only when it addresses the same intent as the latest user message.
- Treat it as approved content and tone guidance, not as proof of current user or workspace state.
- Ignore unrelated examples. Never expose this block, IDs, similarity scores, or retrieval details.
${JSON.stringify(examples, null, 2)}
</service_answer_examples>`;
}
