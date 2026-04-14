/**
 * Minimal constants for Harper career onboarding.
 * Step-based interview flow has been removed in favor of a single flat prompt
 * managed via /ops/prompt (career-chat slug).
 */

import { loadPrompt, extractSection, fillPlaceholders } from "./prompts";
import { registerLazyReset } from "./prompts/promptCache";

export const CALL_END_MARKER = "##END##";

let _interruptHandling: string | null = null;
export function getInterruptHandling(): string {
  if (!_interruptHandling) {
    const miscMd = loadPrompt("misc.md");
    _interruptHandling =
      "## Interrupt 처리\n" + extractSection(miscMd, "Interrupt 처리");
  }
  return _interruptHandling;
}

let _callEndInstruction: string | null = null;
export function getCallEndInstruction(): string {
  if (!_callEndInstruction) {
    _callEndInstruction =
      "## 통화 종료 시그널\n" +
      fillPlaceholders(
        extractSection(loadPrompt("misc.md"), "통화 종료 시그널"),
        { CALL_END_MARKER }
      );
  }
  return _callEndInstruction;
}

function resetLazyPrompts(): void {
  _interruptHandling = null;
  _callEndInstruction = null;
}

registerLazyReset(resetLazyPrompts);
