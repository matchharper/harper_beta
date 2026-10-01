import type {
  OrgAgentThinkingLog,
  OrgAgentThinkingLogIcon,
} from "@/lib/org/agent/types";
import type { OrgLocale } from "@/i18n/org/locale";

const ORG_AGENT_THINKING_ONLY_LOG_IDS = new Set(["context", "response"]);

const ENGLISH_STATUS_LABELS: Record<
  OrgAgentThinkingLogIcon,
  Record<"done" | "error" | "running", string>
> = {
  link: { running: "Opening link", done: "Link checked", error: "Could not open link" },
  read: { running: "Reading information", done: "Information checked", error: "Could not read information" },
  run: { running: "Working", done: "Completed", error: "Could not complete" },
  search: { running: "Searching", done: "Search complete", error: "Search failed" },
  send: { running: "Handling contact", done: "Contact step complete", error: "Contact step failed" },
  write: { running: "Updating", done: "Update complete", error: "Update failed" },
};

export function localizeOrgAgentThinkingLogs(
  logs: OrgAgentThinkingLog[],
  locale: OrgLocale
): OrgAgentThinkingLog[] {
  if (locale === "ko") return logs;
  return logs.map((log) => ({
    ...log,
    label: ENGLISH_STATUS_LABELS[log.icon ?? "run"][log.status ?? "running"],
  }));
}

export function hasOrgAgentToolWork(logs: OrgAgentThinkingLog[]) {
  return logs.some((log) => {
    const id = log.id?.trim();
    return Boolean(id && !ORG_AGENT_THINKING_ONLY_LOG_IDS.has(id));
  });
}

export function finalizeOrgAgentThinkingLogs(
  logs: OrgAgentThinkingLog[],
  usedTool: boolean
) {
  if (!usedTool) return [];
  return logs.filter((log) => log.id !== "response");
}

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
      "move_candidate_to_role",
      "add_candidate_note",
      "manage_interview_availability",
      "decide_candidate_connection",
      "set_role_notification",
      "confirm_pending_role_creation",
      "update_company_context",
      "record_role_profile_example_feedback",
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
