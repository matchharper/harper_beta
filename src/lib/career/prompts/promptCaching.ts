type PromptCacheBlock = {
  key?: string;
  text: string;
  cacheable?: boolean;
};

// These blocks depend on the currently offered capabilities or tool-loop step.
// Their cacheable metadata must not put them ahead of the saved user context.
const TOOL_DEPENDENT_BLOCK_KEYS = new Set([
  "default_conversation_guidance",
  "capability_catalog",
  "tool_policy",
]);

/** Reorder whole blocks only; preserve every instruction and data value. */
export function orderCareerPromptBlocksForCaching<T extends PromptCacheBlock>(
  blocks: readonly T[]
): T[] {
  if (!blocks.some((block) => block.key === "profile_context")) {
    return [...blocks];
  }

  const instructions: T[] = [];
  const profiles: T[] = [];
  const talentContexts: T[] = [];
  const runtime: T[] = [];
  for (const block of blocks) {
    if (block.key === "profile_context") profiles.push(block);
    else if (block.key === "future_matching_insights") {
      talentContexts.push(block);
    } else if (
      block.cacheable &&
      !TOOL_DEPENDENT_BLOCK_KEYS.has(block.key ?? "")
    ) {
      instructions.push(block);
    } else runtime.push(block);
  }

  return [...instructions, ...profiles, ...talentContexts, ...runtime];
}
