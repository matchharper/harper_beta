import path from "path";

const PROMPTS_DIR = path.join(
  process.cwd(),
  "src/lib/talentOnboarding/prompts"
);

const PROMPT_PATH_OVERRIDES: Record<string, string> = {
  "insight-extraction.md": path.join(
    process.cwd(),
    "src/lib/career/insights.md"
  ),
};

export function resolvePromptPath(filename: string): string {
  return PROMPT_PATH_OVERRIDES[filename] ?? path.join(PROMPTS_DIR, filename);
}
