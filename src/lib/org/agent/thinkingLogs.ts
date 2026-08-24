import type {
  OrgAgentThinkingLog,
  OrgAgentThinkingLogIcon,
} from "@/lib/org/agent/types";

export function getOrgAgentThinkingLogIcon(
  toolName: string
): OrgAgentThinkingLogIcon {
  if (toolName === "web_search") return "search";
  if (toolName === "open_url") return "link";
  if (toolName === "contact_talent") return "send";
  if (
    [
      "update_role_criteria",
      "update_data",
      "change_role_status",
      "manage_role_pipeline_stages",
      "move_candidate_stage",
      "decide_candidate_connection",
      "set_role_notification",
      "confirm_pending_role_creation",
      "update_company_context",
    ].includes(toolName)
  ) {
    return "write";
  }
  if (
    [
      "get_talents",
      "read_talent",
      "read_role",
      "get_more_data",
      "read_conversation_history",
      "read_other_roles",
      "research_role_description_sources",
      "prepare_candidate_connection",
    ].includes(toolName)
  ) {
    return "read";
  }
  return "run";
}

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
