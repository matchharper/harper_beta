export const CAREER_PROMPT_VARIANTS = ["v1", "v2", "v3"] as const;
export type CareerPromptVariant = (typeof CAREER_PROMPT_VARIANTS)[number];
export const CAREER_PROMPT_FILES: Record<CareerPromptVariant, string> = {
  v1: "06-prompts-only.txt",
  v2: "06-prompts-only-v2.txt",
  v3: "06-prompts-only-v3.txt",
};

export type CareerPromptExperiment = {
  variant: CareerPromptVariant;
  sha256: string;
  sections: Record<string, string>;
};

export function isCareerPromptVariant(value: unknown): value is CareerPromptVariant {
  return CAREER_PROMPT_VARIANTS.includes(value as CareerPromptVariant);
}

/** Section markers are an editable-file format, not a check on model output. */
export function parseCareerPromptFile(text: string): Record<string, string> {
  const markers = [...text.matchAll(/^<!--- section:([\w:-]+)(?: \|[^\n]*)? -->\s*$/gm)];
  if (!markers.length) throw new Error("프롬프트 파일의 section 구분선이 없습니다.");
  const sections: Record<string, string> = {};
  markers.forEach((marker, index) => {
    const key = marker[1];
    if (Object.hasOwn(sections, key)) throw new Error(`중복 프롬프트 section: ${key}`);
    sections[key] = text.slice(marker.index! + marker[0].length, markers[index + 1]?.index ?? text.length).trim();
  });
  return sections;
}

export function careerPromptText(
  experiment: CareerPromptExperiment | undefined,
  key: string,
  original: string,
) {
  // Existing development files/saved snapshots used three sections. Their text
  // remains an explicit override; the production main prompt is one literal.
  if (experiment && key === "career_main" && !Object.hasOwn(experiment.sections, key)) {
    return ["chat_core", "default_conversation_guidance", "autonomous_career_work"]
      .map(section => experiment.sections[section] ?? "").filter(Boolean).join("\n\n");
  }
  // A deleted/empty section means removal, never a silent return to the old prompt.
  return experiment ? experiment.sections[key] ?? "" : original;
}

/** Only server-resolved snapshots are stored on the source message. */
export function readCareerPromptExperiment(payload: unknown): CareerPromptExperiment | undefined {
  if (process.env.NODE_ENV === "production" || !payload || typeof payload !== "object") return;
  const value = (payload as Record<string, unknown>).careerPromptExperiment as CareerPromptExperiment | undefined;
  if (!value || !isCareerPromptVariant(value.variant) || typeof value.sha256 !== "string" || !value.sections || typeof value.sections !== "object" || Array.isArray(value.sections)) return;
  if (!Object.values(value.sections).every(text => typeof text === "string")) return;
  return value;
}
