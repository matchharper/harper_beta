import type { RoleStartView } from "@/lib/org/roleStart/view";
import { COMPANY_TERMS } from "@/lib/org/terms";

type Phase = RoleStartView["phase"];

export type RoleStartStepId = "setup" | "brief" | "align" | "finalize";

/**
 * The step bar on top of the role start screens. Order lives here, names in
 * terms.ts (Harper says them too), so they can change without touching the screens. Questions belong to
 * the Brief step.
 */
export const ROLE_START_STEPS: Array<{ id: RoleStartStepId; ko: string; en: string }> = (
  ["setup", "brief", "align", "finalize"] as const
).map((id) => ({ id, ko: COMPANY_TERMS.roleStart[id].ko, en: COMPANY_TERMS.roleStart[id].en }));

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
