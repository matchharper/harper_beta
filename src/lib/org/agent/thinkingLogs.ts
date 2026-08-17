import type { OrgAgentThinkingLog } from "@/lib/org/agent/types";

function replaceAt(
  logs: OrgAgentThinkingLog[],
  index: number,
  next: OrgAgentThinkingLog
) {
  const current = logs[index]!;
  const updated = [...logs];
  updated[index] = { ...next, at: current.at };
  return updated;
}

/**
 * Keeps one row per identified operation while its status advances from
 * running to done/error. The label fallback compacts legacy rows that were
 * saved before operation IDs were recorded.
 */
export function upsertOrgAgentThinkingLog(
  logs: OrgAgentThinkingLog[],
  next: OrgAgentThinkingLog,
  maxItems = 20
) {
  const id = next.id?.trim();
  if (id) {
    const index = logs.findIndex((log) => log.id === id);
    const updated =
      index >= 0 ? replaceAt(logs, index, { ...next, id }) : [...logs, next];
    return updated.slice(-maxItems);
  }

  if (next.status === "done" || next.status === "error") {
    const index = logs.findLastIndex(
      (log) => !log.id && log.label === next.label && log.status === "running"
    );
    if (index >= 0) return replaceAt(logs, index, next).slice(-maxItems);
  }

  return [...logs, next].slice(-maxItems);
}

export function compactOrgAgentThinkingLogs(
  logs: OrgAgentThinkingLog[],
  maxItems = 20
) {
  const compacted = logs.reduce(
    (current, log) =>
      upsertOrgAgentThinkingLog(current, log, Number.MAX_SAFE_INTEGER),
    [] as OrgAgentThinkingLog[]
  );
  return compacted.slice(-maxItems);
}
