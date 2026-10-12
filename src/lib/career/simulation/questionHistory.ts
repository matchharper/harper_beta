import type { SimulationSession } from "./session";

export type ApplicationQuestionHistory = NonNullable<SimulationSession["activity"]>["batches"][number];

/** Stable display references; question state remains in the activity payload. */
export function applicationQuestionMessages(state: SimulationSession) {
  return (state.activity?.batches ?? []).map((batch) => ({
    // Older store functions insert an anchor row for the introduction. Hydrate
    // that same row instead of adding a second, synthetic timeline message.
    id: batch.introMessageId ?? -Number.parseInt(batch.id.replaceAll("-", "").slice(0, 12), 16),
    role: "assistant" as const,
    content: "",
    createdAt: batch.createdAt,
    messageType: "application_questions",
    applicationQuestions: {
      ...batch,
      items: batch.items ?? state.actions.filter((a) => batch.itemIds.includes(a.id)),
    },
    applicationActivity: {activityId: state.sessionId, revision: state.revision, view: "questions"},
  }));
}
