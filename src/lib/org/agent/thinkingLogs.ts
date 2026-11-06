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
  link: { running: "Reading", done: "Read", error: "Could not read" },
  read: { running: "Reviewing", done: "Reviewed", error: "Could not review" },
  run: { running: "Working", done: "Done", error: "Could not finish" },
  search: { running: "Looking around", done: "Looked around", error: "Could not look around" },
  send: { running: "Handling contact", done: "Contact step complete", error: "Contact step failed" },
  write: { running: "Remembering", done: "Remembered", error: "Could not remember" },
};

/** The running label of a web step that names its target, as on the candidate side. */
function runningTargetLabel(log: OrgAgentThinkingLog, locale: OrgLocale) {
  if (!log.target || (log.status ?? "running") !== "running") return null;
  if (log.icon === "search") return locale === "ko" ? `"${log.target}" 검색 중` : `Searching "${log.target}"`;
  if (log.icon === "link") return locale === "ko" ? `${log.target} 읽는 중` : `Reading ${log.target}`;
  return null;
}

export function localizeOrgAgentThinkingLogs(
  logs: OrgAgentThinkingLog[],
  locale: OrgLocale
): OrgAgentThinkingLog[] {
  // Korean saved logs are already worded; only a running web step gets its target.
  if (locale === "ko" && !logs.some((log) => runningTargetLabel(log, locale))) return logs;
  return logs.map((log) => {
    const targetLabel = runningTargetLabel(log, locale);
    if (targetLabel) return { ...log, label: targetLabel };
    if (locale === "ko") return log;
    return {
      ...log,
      label: ENGLISH_STATUS_LABELS[log.icon ?? "run"][log.status ?? "running"],
    };
  });
}

/**
 * What web_search and open_url look at: the search words (80 characters at
 * most) or the hosts of the pages. Nothing for other tools or unreadable input.
 */
export function orgAgentToolTarget(toolName: string, rawArguments: string): string | undefined {
  if (toolName !== "web_search" && toolName !== "open_url") return undefined;
  let input: Record<string, unknown>;
  try {
    const parsed = rawArguments ? JSON.parse(rawArguments) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    input = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (toolName === "web_search") {
    const query = typeof input.query === "string" ? input.query.replace(/\s+/g, " ").trim().slice(0, 80) : "";
    return query || undefined;
  }
  const urls = Array.isArray(input.url) ? input.url : [input.url];
  const hosts = [...new Set(urls.map((url) => {
    if (typeof url !== "string") return "";
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }).filter(Boolean))];
  return hosts.length ? hosts.join(", ") : undefined;
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
      "manage_comparison_columns",
      "manage_interview_availability",
      "decide_candidate_connection",
      "set_role_notification",
      "confirm_pending_role_creation",
      "update_company_context",
      "answer_role_start_question",
      "ask_role_start_question",
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

/**
 * The live line while no step runs, as on the candidate side: "thinking"
 * before the first step, "deciding the next step" after one. Finished turns
 * keep the panel's own words ("Worked for …"), and "Thought" when no step ran.
 */
export function orgAgentLiveStatusLabel(
  c: (ko: string, en: string) => string,
  active: boolean | undefined,
  stepCount: number
) {
  if (active) {
    return stepCount === 0
      ? c("생각하는 중", "Thinking")
      : c("다음 할 일을 정하는 중", "Deciding the next step");
  }
  return stepCount === 0 ? "Thought" : undefined;
}
