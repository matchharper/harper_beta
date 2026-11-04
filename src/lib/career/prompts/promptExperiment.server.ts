import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  CAREER_PROMPT_FILES,
  isCareerPromptVariant,
  parseCareerPromptFile,
  type CareerPromptExperiment,
} from "./promptExperiment";

export async function loadCareerPromptExperiment(
  variant: unknown,
  canOverride: boolean,
): Promise<CareerPromptExperiment | undefined> {
  if (process.env.NODE_ENV === "production" || !canOverride || variant == null) return;
  if (!isCareerPromptVariant(variant)) throw new Error("알 수 없는 프롬프트 버전입니다.");
  const filename = path.join(process.cwd(), ".local/healingpaper-input-audit", CAREER_PROMPT_FILES[variant]);
  const text = await readFile(filename, "utf8");
  return { variant, sha256: createHash("sha256").update(text).digest("hex"), sections: parseCareerPromptFile(text) };
}
