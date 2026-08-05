export const NORMAL_TOOL_COMPLETION_MAX_TOKENS = 4_000;
export const LARGE_REWRITE_COMPLETION_MAX_TOKENS = 32_000;

export function getOrgAgentToolCompletionMaxTokens(state: {
  completeLongTextTargets: ReadonlySet<string>;
}) {
  return state.completeLongTextTargets.size > 0
    ? LARGE_REWRITE_COMPLETION_MAX_TOKENS
    : NORMAL_TOOL_COMPLETION_MAX_TOKENS;
}
