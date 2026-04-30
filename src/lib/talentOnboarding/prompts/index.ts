import fs from "fs";
import { getCached } from "./promptCache";
import { resolvePromptPath } from "./paths";

/**
 * Read a .md prompt file.
 * Priority: DB cache (populated by warmCache) → filesystem fallback.
 * Stays sync for module-level compatibility; DB data is pre-loaded by warmCache().
 */
export function loadPrompt(filename: string): string {
  // Try DB cache first (populated by warmCache in request handlers)
  const slug = filename.replace(/\.md$/, "");
  const cached = getCached(slug);
  if (cached) return cached;

  // Fallback: read from filesystem (cold start or DB unavailable)
  return fs.readFileSync(resolvePromptPath(filename), "utf-8");
}

/** Replace {{key}} placeholders with values. Unmatched placeholders are left as-is. */
export function fillPlaceholders(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`
  );
}

/**
 * Extract a named `## Section` from markdown.
 * Uses split-based approach to correctly handle last section + multi-line content.
 */
export function extractSection(md: string, sectionName: string): string {
  const sections = md.split(/^## /m);
  for (const section of sections) {
    if (section.startsWith(sectionName)) {
      return section.slice(sectionName.length).trim();
    }
  }
  return "";
}

/**
 * Extract a `### SubSection` from within a section body.
 */
export function extractSubSection(
  sectionBody: string,
  subName: string
): string {
  const parts = sectionBody.split(/^### /m);
  for (const part of parts) {
    if (part.startsWith(subName)) {
      return part.slice(subName.length).trim();
    }
  }
  return "";
}

/** Required sections per .md file. Validated on first load. */
const REQUIRED_SECTIONS: Record<string, string[]> = {
  "system.md": ["persona", "reliefNudge", "defaultGuidance", "contextTemplate"],
  "interview-steps.md": [
    "Step 1:",
    "Step 2:",
    "Step 3:",
    "Step 4:",
    "Step 5:",
    "Step 6:",
    "stepGuideTemplate",
    "realtimeGuideTemplate",
  ],
  "insight-extraction.md": [
    "responseFormat",
    "stepTransition",
    "insightExtractionRules",
    "conversationGuidance",
    "extractionOnly",
  ],
  "misc.md": ["firstVisitText", "Interrupt 처리", "통화 종료 시그널"],
};

/** Get required sections for a given slug (without .md extension). */
export function getRequiredSections(slug: string): string[] {
  return REQUIRED_SECTIONS[`${slug}.md`] ?? [];
}

const validated = new Set<string>();

/** Validate that all required sections exist and are non-empty. Throws on failure. */
export function validatePromptFile(filename: string): void {
  if (validated.has(filename)) return;
  const md = loadPrompt(filename);
  const required = REQUIRED_SECTIONS[filename];
  if (!required) return;
  for (const section of required) {
    const content = extractSection(md, section);
    if (!content) {
      throw new Error(
        `Missing or empty required section "${section}" in prompts/${filename}. ` +
          `Check that the ## heading matches exactly.`
      );
    }
  }
  validated.add(filename);
}

/** Validate content string against required sections for a slug. Returns missing section names. */
export function validateSections(
  content: string,
  slug: string
): string[] {
  const required = REQUIRED_SECTIONS[`${slug}.md`] ?? [];
  const missing: string[] = [];
  for (const section of required) {
    if (!extractSection(content, section)) {
      missing.push(section);
    }
  }
  return missing;
}
