// At least 65,536 is supported by every offered company model (provider catalog verified 2026-10-22).
// Keep a generous explicit ceiling because the Responses adapter otherwise defaults to 4,000.
export const NORMAL_TOOL_COMPLETION_MAX_TOKENS = 65_536;
export const LARGE_REWRITE_COMPLETION_MAX_TOKENS = 65_536;

export function getOrgAgentToolCompletionMaxTokens(state: {
  completeLongTextTargets: ReadonlySet<string>;
}) {
  return state.completeLongTextTargets.size > 0
    ? LARGE_REWRITE_COMPLETION_MAX_TOKENS
    : NORMAL_TOOL_COMPLETION_MAX_TOKENS;
}
