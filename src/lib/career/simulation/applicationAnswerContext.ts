import type { SimulationSession } from "./session";

// Each saved response appears once, paired with the immutable question the user saw.
export function applicationAnswerContext(session: SimulationSession, includeUnsubmitted = false, options?: { compactButtonDecisions?: boolean }) {
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
        questions: items.map(item => {
          const response = batch.responses[item.id];
          const compact = options?.compactButtonDecisions && ["accept", "ignore", "skip"].includes(response?.decision);
          return ({
          itemId: item.id,
          question: item.title,
          contentShown: compact && response?.decision !== "skip" ? undefined : item.draftText ?? item.proposal,
          editsShown: compact && response?.decision !== "skip" ? undefined : item.edits,
          reason: compact ? undefined : item.reason,
          options: item.options,
          response,
          recordedDecision: response?.decision === "skip"
            ? "The user deliberately skipped this item without answering or approving its proposed addition. They made no claim about having or lacking the experience. Existing original-source facts are unchanged."
            : response?.decision === "ignore"
              ? "The user chose not to apply this proposal."
              : response?.decision === "accept"
                ? "The user accepted the saved wording."
                : undefined,
          selectedOption: item.options?.find(option => option.id === batch.responses[item.id]?.optionId),
        });}),
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

/** The same saved-choice continuation is used by web and the preparation journey evaluation. */
export function applicationBatchContinuation(batchId: string) {
  return `The user finished application question batch ${batchId}. Their decisions and any written answers are saved in that batch. Continue the delegated preparation.`;
}
