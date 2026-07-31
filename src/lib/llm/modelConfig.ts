export const CLAUDE_MODEL = "claude-sonnet-5";

export const CLAUDE_INPUT_USD_PER_MTOK = 2;
export const CLAUDE_OUTPUT_USD_PER_MTOK = 10;
export const CLAUDE_CACHE_WRITE_USD_PER_MTOK = 2.5;
export const CLAUDE_CACHE_READ_USD_PER_MTOK = 0.2;

// Current standard API pricing for GPT-5.6 Luna.
export const GPT_56_LUNA_MODEL = "gpt-5.6-luna" as const;
export const GPT_56_LUNA_INPUT_USD_PER_MTOK = 0.2;
export const GPT_56_LUNA_OUTPUT_USD_PER_MTOK = 1.2;
export const GPT_56_LUNA_CACHE_WRITE_USD_PER_MTOK = 0.25;
export const GPT_56_LUNA_CACHE_READ_USD_PER_MTOK = 0.02;
