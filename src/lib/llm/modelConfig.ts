export const CLAUDE_MODEL = "claude-sonnet-5-5";

export const CLAUDE_HAIKU_MODEL = "claude-haiku-5-5" as const;

export const GPT_6_LUNA_MODEL = "gpt-6-luna" as const;

export const OPENROUTER_JEV_MODEL = "typesafe/jev-1.13" as const;

export const GPT_61_SOL_MODEL = "gpt-6.1-sol" as const;

// Application selection ID; the Responses adapter sends the base model and tier.
export const GPT_61_SOL_ULTRAFAST_MODEL = "gpt-6.1-sol-ultrafast" as const;

// Keep the original selection IDs for high so saved preferences and turns replay.
export const SOL_CHAT_PRESETS = [GPT_61_SOL_MODEL, GPT_61_SOL_ULTRAFAST_MODEL].flatMap(
  (tierModel) => (["low", "medium", "high"] as const).map((effort) => ({
    id: effort === "high" ? tierModel : `${tierModel}-${effort}` as const,
    tierModel,
    effort,
    label: `GPT-6.1 Sol · ${tierModel === GPT_61_SOL_ULTRAFAST_MODEL ? "ultrafast · " : ""}${effort}`,
  }))
);

export function getSolChatPreset(selection: string) {
  return SOL_CHAT_PRESETS.find((preset) => preset.id === selection);
}

export const GPT_61_TERRA_MODEL = "gpt-6.1-terra" as const;

export const OPENAI_CHAT_PRESETS = [
  ...SOL_CHAT_PRESETS,
  ...[GPT_6_LUNA_MODEL, GPT_61_TERRA_MODEL].flatMap((tierModel) =>
    (["low", "medium", "high", "xhigh"] as const).map((effort) => ({
      id: effort === (tierModel === GPT_6_LUNA_MODEL ? "xhigh" : "high")
        ? tierModel : `${tierModel}-${effort}` as const,
      tierModel,
      effort,
    }))
  ),
];

export function getOpenAIChatPreset(selection: string) {
  return OPENAI_CHAT_PRESETS.find((preset) => preset.id === selection);
}


export const OPENROUTER_DEEPSEEK_V4_1_FLASH_MODEL =
  "deepseek/deepseek-v4.1-flash" as const;

export const OPENROUTER_GLM_53_FLASH_MODEL = "z-ai/glm-5.3-flash" as const;
export const OPENROUTER_MIMO_V26_PRO_MODEL = "xiaomi/mimo-v2.6-pro" as const;
export const OPENROUTER_MUSE_SPARK_13_MODEL = "meta/muse-spark-1.3" as const;
export const OPENROUTER_ZAI_PROVIDER_SLUG = "z-ai" as const;

export function isOpenRouterModel(model: string) {
  const normalized = model
    .trim()
    .toLowerCase()
    .replace(/^openrouter:/, "");
  return normalized.includes("/");
}

export function isOpenRouterGlm53FlashModel(model: string) {
  const normalized = model
    .trim()
    .toLowerCase()
    .replace(/^openrouter:/, "");
  return (
    normalized === OPENROUTER_GLM_53_FLASH_MODEL ||
    normalized.startsWith(`${OPENROUTER_GLM_53_FLASH_MODEL}:`)
  );
}

/**
 * Maximum input tokens per request, from each provider's model page
 * (checked 2026-11-23). OpenAI: developers.openai.com/api/docs/models/<id>
 * ("Maximum input tokens"). Anthropic: platform.claude.com/docs/en/about-claude/
 * models/overview ("Context window"). Models whose provider page states no
 * limit (the OpenRouter GLM and Muse models) are left out instead of guessed.
 */
export const MODEL_MAX_INPUT_TOKENS: Record<string, number> = {
  [GPT_61_TERRA_MODEL]: 922_000,
  [GPT_61_SOL_MODEL]: 922_000,
  [GPT_6_LUNA_MODEL]: 922_000,
  [CLAUDE_MODEL]: 1_000_000,
  [CLAUDE_HAIKU_MODEL]: 1_000_000,
};

/** The documented input limit of a selection ID, or null when unknown. */
export function modelMaxInputTokens(model: string | null | undefined) {
  if (!model) return null;
  const base = getOpenAIChatPreset(model)?.tierModel ?? model;
  const tier = base === GPT_61_SOL_ULTRAFAST_MODEL ? GPT_61_SOL_MODEL : base;
  return MODEL_MAX_INPUT_TOKENS[tier] ?? null;
}
