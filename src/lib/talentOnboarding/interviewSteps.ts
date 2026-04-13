/**
 * 5-stage structured interview flow for Harper career onboarding.
 *
 * Prompt text is loaded from prompts/interview-steps.md and prompts/misc.md.
 * Step metadata (step number, English name) stays in TypeScript.
 * Chris can edit the .md files to change prompts without touching this code.
 */

import {
  loadPrompt,
  extractSection,
  extractSubSection,
  fillPlaceholders,
  validatePromptFile,
} from "./prompts";

// Validate on first import (fail-fast if .md sections are missing)
validatePromptFile("interview-steps.md");
validatePromptFile("misc.md");

export type InterviewStep = {
  step: number;
  name: string;
  nameKo: string;
  goal: string;
  questionGuide: string;
  transitionCondition: string;
};

/** Step metadata stays in TypeScript (structural identifiers, not editable prose) */
const STEP_META = [
  { step: 1, name: "Ice-breaking & Context Setting", sectionKey: "Step 1:" },
  { step: 2, name: "Resume Deep-dive", sectionKey: "Step 2:" },
  { step: 3, name: "Expectation vs. Reality", sectionKey: "Step 3:" },
  { step: 4, name: "Logistics & Relocation", sectionKey: "Step 4:" },
  { step: 5, name: "Wrap-up", sectionKey: "Step 5:" },
  { step: 6, name: "Post-Interview Update", sectionKey: "Step 6:" },
] as const;

function loadSteps(): InterviewStep[] {
  const md = loadPrompt("interview-steps.md");
  return STEP_META.map(({ step, name, sectionKey }) => {
    const body = extractSection(md, sectionKey);
    return {
      step,
      name,
      nameKo: extractSubSection(body, "nameKo"),
      goal: extractSubSection(body, "goal"),
      questionGuide: extractSubSection(body, "questionGuide"),
      transitionCondition: extractSubSection(body, "transitionCondition"),
    };
  });
}

export const INTERVIEW_STEPS: InterviewStep[] = loadSteps();

/** Interrupt handling instruction for both text and voice prompts. */
// Prepend "## Interrupt 처리\n" to preserve the LLM-facing heading that consumers depend on
const miscMd = loadPrompt("misc.md");
export const INTERRUPT_HANDLING_INSTRUCTION =
  "## Interrupt 처리\n" + extractSection(miscMd, "Interrupt 처리");

/** End-of-call marker instruction for Realtime voice mode. */
export const CALL_END_MARKER = "##END##";
export const CALL_END_INSTRUCTION =
  "## 통화 종료 시그널\n" +
  fillPlaceholders(extractSection(miscMd, "통화 종료 시그널"), {
    CALL_END_MARKER,
  });

/**
 * Build step guide for text chat system prompt (verbose version).
 * Only includes the CURRENT step's guide to save context.
 */
export function getStepGuideForPrompt(currentStep: number): string {
  const step = INTERVIEW_STEPS.find((s) => s.step === currentStep);
  if (!step) return "";

  const md = loadPrompt("interview-steps.md");
  const template = extractSection(md, "stepGuideTemplate");
  // Prepend "## " — removed from .md to avoid split-parser collision
  return "## " + fillPlaceholders(template, {
    stepNumber: step.step,
    stepNameKo: step.nameKo,
    stepGoal: step.goal,
    stepQuestionGuide: step.questionGuide,
    stepTransitionCondition: step.transitionCondition,
    nextStepNumber: Math.min(step.step + 1, 5),
  });
}

/**
 * Build ALL step guides for Realtime API instructions (concise version).
 * Includes all steps with a current step marker.
 */
export function buildRealtimeStepGuides(currentStep: number): string {
  const stepSummaries = INTERVIEW_STEPS.map((s) => {
    const marker = s.step === currentStep ? " ◀ 현재" : "";
    return `### Step ${s.step}: ${s.nameKo}${marker}\n목표: ${s.goal}\n전환 조건: ${s.transitionCondition}`;
  }).join("\n\n");

  const md = loadPrompt("interview-steps.md");
  const template = extractSection(md, "realtimeGuideTemplate");
  // Prepend "## " — removed from .md to avoid split-parser collision
  return "## " + fillPlaceholders(template, {
    currentStep,
    stepSummaries,
  });
}

/**
 * Build Realtime instructions update payload for step transition.
 */
export function buildRealtimeStepUpdateMarker(newStep: number): string {
  return buildRealtimeStepGuides(newStep);
}

/** Get step name in Korean for UI display */
export function getStepNameKo(step: number): string {
  return INTERVIEW_STEPS.find((s) => s.step === step)?.nameKo ?? "";
}

/** Total number of interview steps */
export const TOTAL_INTERVIEW_STEPS = INTERVIEW_STEPS.length;
