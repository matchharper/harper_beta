import type { SimulationSession } from "./session";

// Each saved response appears once, paired with the immutable question the user saw.
export function applicationAnswerContext(session: SimulationSession, includeUnsubmitted = false) {
  return (session.activity?.batches ?? [])
    .filter(batch => includeUnsubmitted || batch.status === "submitted")
    .map(batch => {
      const items = batch.items ?? session.actions?.filter(item => batch.itemIds?.includes(item.id)) ?? [];
      const represented = new Set(items.map(item => item.id));
      return {
        batchId: batch.id,
        status: batch.status,
        purpose: batch.purpose,
        review: batch.review,
        questions: items.map(item => ({
          itemId: item.id,
          question: item.title,
          contentShown: item.proposal,
          options: item.options,
          response: batch.responses[item.id],
          selectedOption: item.options?.find(option => option.id === batch.responses[item.id]?.optionId),
        })),
        // Only records without a question snapshot need the legacy fallback.
        ...(Object.keys(batch.responses).some(id => !represented.has(id)) ? {
          answers: Object.fromEntries(Object.entries(batch.responses).filter(([id]) => !represented.has(id))),
        } : {}),
      };
    });
}

export function unbatchedApplicationResponses(session: SimulationSession) {
  const responses = session.preparation?.responses ?? {};
  return Object.fromEntries(Object.entries(responses).filter(([id, response]) =>
    !(session.activity?.batches ?? []).some(batch => {
      const saved = batch.responses[id];
      if (!saved) return false;
      // reviewId belongs to the snapshot, not to the mutable current response.
      const {reviewId: _savedReview, ...savedContent} = saved;
      const {reviewId: _currentReview, ...currentContent} = response;
      return JSON.stringify(Object.entries(savedContent).sort(([a], [b]) => a.localeCompare(b))) === JSON.stringify(Object.entries(currentContent).sort(([a], [b]) => a.localeCompare(b)));
    })
  ));
}
