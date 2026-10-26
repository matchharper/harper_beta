// When the start flow holds a Role. Shared by the server and the start screen (no server imports).

/** A flow that will not move again: it failed, or the Role was registered another way. */
export function isRoleStartEnded(phase: string) {
  return phase === "failed" || phase === "superseded";
}

/** A background step that has not written anything for this long is treated as stopped. */
export const ROLE_START_STALL_MS = 3 * 60_000;
/** Registering picks one more person for up to 3 minutes first: it counts as stopped later. */
export const ROLE_START_REGISTER_STALL_MS = 5 * 60_000;

/** drafting, searching or batch with no write for three minutes: the step can be started again. */
export function isRoleStartStalled(
  session: { phase: string; updatedAt: string; refinedAnswers?: number; questions?: { history: unknown[] } },
  now = Date.now()
) {
  const idle = now - Date.parse(session.updatedAt);
  const quiet = idle > ROLE_START_STALL_MS;
  // Registering may spend its whole 3-minute pick budget without a write.
  if (session.phase === "registering") return idle > ROLE_START_REGISTER_STALL_MS;
  if (["drafting", "searching", "batch"].includes(session.phase)) return quiet;
  // Answers whose refinement never finished (the work after the response died).
  const answered = session.questions?.history.length ?? 0;
  return (
    ["questions", "review"].includes(session.phase) &&
    session.refinedAnswers !== undefined &&
    session.refinedAnswers < answered &&
    quiet
  );
}

/**
 * The one rule for every step: the start flow holds the Role (the form and
 * chat cannot register it) only while it can still move forward. A failed or
 * stalled step (the same test as the screen's 다시 시도) or a search with no
 * one to rate releases it.
 */
export function roleStartOwnsRole(
  session:
    | ({ phase: string; firstCandidates?: unknown[] } & (
        | { stalled: boolean }
        | { updatedAt: string; refinedAnswers?: number; questions?: { history: unknown[] } }
      ))
    | null
    | undefined,
  now = Date.now()
) {
  if (!session || session.phase === "done" || isRoleStartEnded(session.phase)) return false;
  // The browser gets the screen's own stalled flag; the server reads the times.
  const stalled = "stalled" in session ? session.stalled : isRoleStartStalled(session, now);
  if (stalled) return false;
  return !(session.phase === "evaluating" && session.firstCandidates?.length === 0);
}
