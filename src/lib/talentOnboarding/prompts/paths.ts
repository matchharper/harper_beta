import path from "path";

const PROMPT_PATH_OVERRIDES: Record<string, string> = {
  "system.md": path.join(
    process.cwd(),
    "src/lib/talentOnboarding/prompts/system.md"
  ),
  "interview-steps.md": path.join(
    process.cwd(),
    "src/lib/talentOnboarding/prompts/interview-steps.md"
  ),
  "misc.md": path.join(
    process.cwd(),
    "src/lib/talentOnboarding/prompts/misc.md"
  ),
  "insight-extraction.md": path.join(
    process.cwd(),
    "src/lib/career/insights.md"
  ),
};

export function resolvePromptPath(filename: string): string {
  const promptPath = PROMPT_PATH_OVERRIDES[filename];
  if (!promptPath) {
    throw new Error(`Unknown prompt file: ${filename}`);
  }
  return promptPath;
}
