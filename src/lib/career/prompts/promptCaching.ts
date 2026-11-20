/**
 * Blocks whose text changes between completions of the same turn. Explicit
 * cache transports send them after the conversation, behind the last cache
 * breakpoint; other transports keep them at the end of the system prompt.
 */
export const CAREER_AFTER_CONVERSATION = "after_conversation" as const;

type PromptCacheBlock = {
  key?: string;
  text: string;
  cacheable?: boolean;
  placement?: typeof CAREER_AFTER_CONVERSATION;
};

// These blocks depend on the currently offered capabilities or tool-loop step.
// Their cacheable metadata must not put them ahead of the saved user context.
const TOOL_DEPENDENT_BLOCK_KEYS = new Set([
  "default_conversation_guidance",
  "capability_catalog",
  "tool_policy",
  "handbook_catalog",
]);

// Fixed for one turn but different on every turn; nothing else should follow it.
const LAST_RUNTIME_BLOCK_KEYS = new Set(["current_time"]);

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
  const lastRuntime: T[] = [];
  for (const block of blocks) {
    if (block.key === "profile_context") profiles.push(block);
    else if (block.key === "future_matching_insights") {
      talentContexts.push(block);
    } else if (
      block.cacheable &&
      !TOOL_DEPENDENT_BLOCK_KEYS.has(block.key ?? "") &&
      !block.key?.startsWith("handbook:")
    ) {
      instructions.push(block);
    } else if (LAST_RUNTIME_BLOCK_KEYS.has(block.key ?? "")) {
      lastRuntime.push(block);
    } else runtime.push(block);
  }

  return [...instructions, ...profiles, ...talentContexts, ...runtime, ...lastRuntime];
}

/** Indexes of system blocks that end a reusable prefix. */
export function careerSystemCacheBreakpoints(
  blocks: readonly PromptCacheBlock[]
): Set<number> {
  const indexes = new Set<number>();
  if (blocks.some((block) => block.key === "profile_context")) {
    // Explicit data boundaries keep tool policies and per-turn state outside
    // both reusable prefixes, including when Brief/Memory is empty.
    for (const [index, block] of blocks.entries()) {
      if (
        block.cacheable &&
        (block.key === "profile_context" ||
          block.key === "future_matching_insights")
      ) {
        indexes.add(index);
      }
    }
    return indexes;
  }
  const lastCacheableIndex = blocks.reduce(
    (index, block, currentIndex) => (block.cacheable ? currentIndex : index),
    -1
  );
  if (lastCacheableIndex >= 0) indexes.add(lastCacheableIndex);
  return indexes;
}
