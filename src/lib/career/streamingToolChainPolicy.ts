import type { TalentToolName } from "@/lib/talentOnboarding/tools";

/**
 * Follow-up tools that may be exposed after a streaming Career chat tool call.
 *
 * Keep this dependency-based: a follow-up belongs here only when it consumes an
 * identifier/page/result from the previous call or completes an explicitly
 * ordered workflow. Independent tools can already be requested together in the
 * initial assistant tool-use response.
 */
export const CAREER_STREAMING_TOOL_CHAIN = {
  web_search: ["open_url", "web_search"],
  open_url: ["open_url", "web_search"],
  list_documents: ["list_documents", "read_document", "update_document"],
  read_document: ["read_document", "update_document"],
  read_recommended_opportunities: [
    "get_role_context",
    "update_recommended_opportunity_feedback",
    "internal_role_priority_review",
  ],
  get_internal_roles: [
    "internal_role_priority_review",
    "get_role_context",
    "get_internal_roles",
  ],
  get_role_context: [
    "get_role_context",
    "update_recommended_opportunity_feedback",
  ],
  update_talent_profile: ["recommend_job_postings", "get_internal_roles"],
} as const satisfies Partial<Record<TalentToolName, readonly TalentToolName[]>>;

/**
 * Chat tools that intentionally end the streaming tool chain. Keeping this
 * exhaustive makes a newly added chat tool fail the policy contract test until
 * its continuation behavior is reviewed explicitly.
 */
export const CAREER_STREAMING_TERMINAL_TOOL_NAMES = [
  "recommend_job_postings",
  "research_company",
  "update_document",
  "read_talent_activity_events",
  "internal_role_priority_review",
  "record_internal_fit_reevaluation_information",
  "record_company_request_response",
  "update_recommended_opportunity_feedback",
  "update_setting",
  "update_language_setting",
] as const satisfies readonly TalentToolName[];

type AssertNever<T extends never> = T;
type ClassifiedStreamingToolName =
  | keyof typeof CAREER_STREAMING_TOOL_CHAIN
  | (typeof CAREER_STREAMING_TERMINAL_TOOL_NAMES)[number]
  | "end_call";

/** Compile-time guard: every newly added Talent tool needs a chain decision. */
export type CareerStreamingToolPolicyIsExhaustive = AssertNever<
  Exclude<TalentToolName, ClassifiedStreamingToolName>
>;

export function getCareerStreamingNextToolNames(
  attemptedToolNames: readonly string[]
) {
  const chain = CAREER_STREAMING_TOOL_CHAIN as Partial<
    Record<string, readonly TalentToolName[]>
  >;
  const seen = new Set<TalentToolName>();
  const nextToolNames: TalentToolName[] = [];

  for (const attemptedToolName of attemptedToolNames) {
    for (const nextToolName of chain[attemptedToolName] ?? []) {
      if (seen.has(nextToolName)) continue;
      seen.add(nextToolName);
      nextToolNames.push(nextToolName);
    }
  }

  return nextToolNames;
}
