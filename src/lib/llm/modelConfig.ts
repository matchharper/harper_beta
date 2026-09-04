export const CLAUDE_MODEL = "claude-sonnet-5";

export const GPT_56_LUNA_MODEL = "gpt-5.6-luna" as const;

export const GPT_56_TERRA_MODEL = "gpt-5.6-terra" as const;

export const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash" as const;
export const DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro" as const;

export const OPENROUTER_GLM_53_FLASH_MODEL = "z-ai/glm-5.3-flash" as const;
export const OPENROUTER_ZAI_PROVIDER_SLUG = "z-ai" as const;

export function isOpenRouterGlm53FlashModel(model: string) {
  const normalized = model.trim().toLowerCase().replace(/^openrouter:/, "");
  return (
    normalized === OPENROUTER_GLM_53_FLASH_MODEL ||
    normalized.startsWith(`${OPENROUTER_GLM_53_FLASH_MODEL}:`)
  );
}
