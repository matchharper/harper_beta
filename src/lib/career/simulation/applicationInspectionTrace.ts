/** Observability only; never supplied to the planner or used to decide its actions. */
export type ApplicationInspectionEvent = {
  at: string;
  kind: string;
  message: string;
  data?: unknown;
};
export type ApplicationInspectionObserver = (event: ApplicationInspectionEvent) => void;

export function inspectionEvent(
  observer: ApplicationInspectionObserver | undefined,
  kind: string,
  message: string,
  data?: unknown,
) {
  try { observer?.({ at: new Date().toISOString(), kind, message, data }); }
  catch { /* A disconnected observer must not change the inspection or cleanup. */ }
}
