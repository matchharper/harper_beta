import type { RoleStartView } from "@/lib/org/roleStart/view";

type Phase = RoleStartView["phase"];

export type RoleStartStepId = "setup" | "brief" | "align" | "finalize";

/**
 * The step bar on top of the role start screens. Names and order live here
 * only, so they can change without touching the screens. Questions belong to
 * the Brief step.
 */
export const ROLE_START_STEPS: Array<{ id: RoleStartStepId; ko: string; en: string }> = [
  { id: "setup", ko: "Setup", en: "Setup" },
  { id: "brief", ko: "Brief", en: "Brief" },
  { id: "align", ko: "Align", en: "Align" },
  { id: "finalize", ko: "Finalize", en: "Finalize" },
];

/** The step a session phase belongs to (before the screen's own moves). */
export function roleStartStepOf(phase: Phase | null): RoleStartStepId {
  switch (phase) {
    case "questions":
    case "review":
      return "brief";
    case "searching":
    case "evaluating":
      return "align";
    case "registering":
    case "batch":
    case "done":
      return "finalize";
    default:
      return "setup";
  }
}
