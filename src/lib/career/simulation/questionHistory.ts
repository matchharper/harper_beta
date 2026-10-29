import type { SimulationSession } from "./session";

export type ApplicationQuestionHistory = NonNullable<SimulationSession["activity"]>["batches"][number];

/** Stable display references; question state remains in the activity payload. */
export function applicationQuestionMessages(state: SimulationSession) {
  return (state.activity?.batches ?? []).filter(batch => !state.applicationReview || !batch.browser).map((batch) => ({
    // Older store functions insert an anchor row for the introduction. Hydrate
    // that same row instead of adding a second, synthetic timeline message.
    id: batch.introMessageId ?? -Number.parseInt(batch.id.replaceAll("-", "").slice(0, 12), 16),
    role: "assistant" as const,
    content: "",
    createdAt: batch.createdAt,
    messageType: "application_questions",
    applicationQuestions: {
      ...batch,
      // A stopped activity cannot receive answers. Preserve the stored batch
      // for explicit resume while reflecting the current state in the timeline.
      status: state.status === "ended" && batch.status === "waiting" ? "cancelled" as const : batch.status,
      items: batch.items ?? state.actions.filter((a) => batch.itemIds.includes(a.id)),
    },
    applicationActivity: {activityId: state.sessionId, revision: state.revision, view: "questions"},
  }));
}
