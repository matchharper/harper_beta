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
