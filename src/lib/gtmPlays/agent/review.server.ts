import "server-only";

import { randomUUID } from "node:crypto";
import { createCompanyRunUsage } from "@/lib/llm/runUsage";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { gtmStructuredCall } from "../llm.server";
import { personFacts } from "./match";
import { REVIEW_SCHEMA, REVIEW_SYSTEM_PROMPT, parseReviews, reviewUserPrompt } from "./review";
import type { AgentPersonInput, AgentPosting, AgentPostingReview } from "./types";

/** The grader never holds a person up for long: past this, no grade. */
const REVIEW_TIMEOUT_MS = 60_000;

/**
 * 따로 채점 (agent/review.ts): one call grades every posting picked for the person with the stricter rubric, from the
 * person's facts and each posting's own text only. Never throws: a failed or late call gives no grades and `failed`
 * says why (what it cost so far is still returned, for the spend log); the caller tries the person again later.
 */
export async function reviewAgentPostings(args: {
  person: AgentPersonInput;
  postings: readonly AgentPosting[];
  /** Each posting's own text, in order (match.server.ts postingTexts); null: none. */
  texts: ReadonlyArray<string | null>;
  now?: Date;
}): Promise<{ reviews: Array<AgentPostingReview | null>; costUsd: number; failed: string | null }> {
  const none = () => args.postings.map(() => null);
  if (!args.postings.length) return { reviews: [], costUsd: 0, failed: null };
  const totals = createCompanyRunUsage();
  const cost = () => Number(totals.costUsd.toFixed(6));
  try {
    const value = await withLlmUsageContext(
      { requestId: randomUUID(), careerOrigin: "server", careerCapability: { name: "gtm_agent", step: "posting_review" }, companyRunUsage: totals },
      () => gtmStructuredCall<unknown>({
        label: "gtm-agent:posting-review",
        schemaName: "gtm_agent_posting_review",
        schema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
        system: REVIEW_SYSTEM_PROMPT,
        user: reviewUserPrompt(personFacts(args.person), args.postings.map((posting, index) => ({
          companyName: posting.companyName, title: posting.title, location: posting.location, text: args.texts[index] ?? null,
        }))),
        // Up to GRADE_CANDIDATES grades with a reason each (and the model's own reasoning) fit well within this.
        maxTokens: 2_000,
        signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
      }),
    );
    const reviews = parseReviews(value, args.postings.length, (args.now ?? new Date()).toISOString());
    // An answer that grades none of the postings is no grading either.
    return { reviews, costUsd: cost(), failed: reviews.some(Boolean) ? null : "채점 결과가 비어 있어요" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[gtm-agent] posting review", message);
    return { reviews: none(), costUsd: cost(), failed: message.slice(0, 200) || "채점 호출 실패" };
  }
}
