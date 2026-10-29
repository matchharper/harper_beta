type Recommendation = {
  talent_id: string;
  feedback: string | null;
  saved_stage: string | null;
  processed_stage?: string | null;
  updated_at: string;
};
type Tag = { talent_id: string; tag: string; created_at: string; updated_at: string | null };
type Event = { talent_id: string; kind: string; text?: string | null; metadata: unknown; created_at: string };

const stagesByTag: Record<string, string> = {
  "내부:수락": "accepted", "내부:아카이브": "archived", "내부:연결됨": "connected",
  "내부:최종오퍼": "final_offer", "내부:보류": "hold", "내부:연결대기": "pending_connection",
  "내부:프로세스중단": "process_stopped", "내부:거절": "rejected",
};
const canonicalStages = new Set(Object.values(stagesByTag));
const text = (value: unknown) => String(value ?? "").trim();
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stage = (value: unknown) => {
  const normalized = text(value).toLowerCase().replaceAll("-", "_");
  return canonicalStages.has(normalized) || normalized.startsWith("custom:") ? normalized : "";
};
const tagStage = (value: unknown) => stagesByTag[text(value)] ||
  (text(value).startsWith("내부단계:") ? `custom:${text(value).slice(5)}` : "");
const eventStage = (event: Event) => stage(record(event.metadata).stage) || tagStage(record(event.metadata).tag);

/** Preview the people affected by a new role closure, before the worker's grace
 * period. Mirrors process_stopped_notification.py's accepted/stage exclusions;
 * this is a read-only count, never a delivery instruction or eligibility guard. */
export function countRoleClosureRecipients(args: {
  recommendations: Recommendation[];
  tags: Tag[];
  events: Event[];
}) {
  // Reader orders recommendations by acceptance time, like the worker. Count a
  // person once even when legacy duplicate recommendations exist.
  const accepted = new Map<string, Recommendation>();
  for (const row of args.recommendations) {
    if (text(row.saved_stage).toLowerCase() === "closed") continue;
    if (!["like", "positive"].includes(text(row.feedback).toLowerCase()) &&
        text(row.saved_stage).toLowerCase() !== "accepted") continue;
    if (!accepted.has(row.talent_id)) accepted.set(row.talent_id, row);
  }
  let count = 0;
  for (const [talentId, recommendation] of accepted) {
    const tags = args.tags.filter(row => row.talent_id === talentId)
      .sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
    const events = args.events.filter(row => row.talent_id === talentId &&
      !["memo", "saved_stage_changed"].includes(row.kind))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latestTag = tags.find(row => tagStage(row.tag));
    const latestEvent = latestTag ? undefined : events.find(row => eventStage(row));
    const currentStage = (latestTag && tagStage(latestTag.tag)) ||
      (latestEvent && eventStage(latestEvent)) || stage(recommendation.processed_stage) || "accepted";
    const changedAt = latestTag ? latestTag.updated_at ?? latestTag.created_at :
      latestEvent?.created_at ?? (stage(recommendation.processed_stage) ? recommendation.updated_at : null);
    if (currentStage === "final_offer") continue;
    if (["process_stopped", "archived"].includes(currentStage)) {
      // Preserve the worker's legacy event interpretation and five-minute tag
      // match; do not attribute an older candidate stop to a later stage change.
      const stop = events.find(event => {
        const matches = eventStage(event) === currentStage ||
          (currentStage === "process_stopped" &&
            ["프로세스 중단", "진행을 중단"].some(value => text(event.text).includes(value))) ||
          (currentStage === "archived" && text(event.text).includes("아카이브"));
        return matches && (!changedAt || Math.abs(Date.parse(event.created_at) - Date.parse(changedAt)) <= 300_000);
      });
      if (record(stop?.metadata).notifyCandidateOnClosure === false) continue;
      if (currentStage === "process_stopped" && record(stop?.metadata).stopReason === "candidate") continue;
    }
    count++;
  }
  return count;
}
