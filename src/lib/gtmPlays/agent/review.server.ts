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
 * person's facts and each posting's own text only. Never throws: a failed or late call gives no grades (what it cost
 * so far is still returned, for the spend log).
 */
export async function reviewAgentPostings(args: {
  person: AgentPersonInput;
  postings: readonly AgentPosting[];
  /** Each posting's own text, in order (match.server.ts postingTexts); null: none. */
  texts: ReadonlyArray<string | null>;
  now?: Date;
}): Promise<{ reviews: Array<AgentPostingReview | null>; costUsd: number }> {
  const none = () => args.postings.map(() => null);
  if (!args.postings.length) return { reviews: [], costUsd: 0 };
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
        maxTokens: 1_200,
        signal: AbortSignal.timeout(REVIEW_TIMEOUT_MS),
      }),
    );
    return { reviews: parseReviews(value, args.postings.length, (args.now ?? new Date()).toISOString()), costUsd: cost() };
  } catch (error) {
    console.warn("[gtm-agent] posting review", error instanceof Error ? error.message : String(error));
    return { reviews: none(), costUsd: cost() };
  }
}
