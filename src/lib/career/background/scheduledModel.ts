import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";
import type { CareerBackgroundRun } from "./types";
import type { CareerPreloadSelection } from "../capabilities/decisions";

/** The source-event runtime and evaluation use the same initial capabilities. */
export const CAREER_BACKGROUND_PRELOAD: CareerPreloadSelection = {
  capabilityIds: ["schedules", "career_delivery", "company_contact"],
  handbookIds: ["proactive_career"], status: "selected", elapsedMs: 0,
};

/** Scheduled work recommends and publishes. Without the opportunity tools from the
 * first call it only had web search and open_url, so it never reached saved searches. */
export const CAREER_SCHEDULED_PRELOAD: CareerPreloadSelection = {
  capabilityIds: [...CAREER_BACKGROUND_PRELOAD.capabilityIds, "opportunities"],
  handbookIds: [...CAREER_BACKGROUND_PRELOAD.handbookIds, "opportunity_search"],
  status: "selected", elapsedMs: 0,
};

export function careerBackgroundPreload(invocation?: { scheduledWork?: boolean } | null) {
  return invocation?.scheduledWork ? CAREER_SCHEDULED_PRELOAD : CAREER_BACKGROUND_PRELOAD;
}

/** Scheduled work that continues opportunity discovery: the external check-in, a
 * reservation on a matching, or changed public resources for an active search. */
export function isCareerDiscoveryRun(run: Pick<CareerBackgroundRun, "trigger_payload">) {
  const events = run.trigger_payload?.sourceEvents ?? [];
  return events.some((event: { sourceKind?: string; scheduleKey?: string; targetRefs?: { matchingId?: string } }) =>
    (event.sourceKind === "schedule" && event.scheduleKey === "career_check_in") ||
    event.sourceKind === "public_discovery" || Boolean(event.targetRefs?.matchingId));
}

export function isScheduledCareerRun(run: Pick<CareerBackgroundRun, "trigger" | "trigger_payload">) {
  if (run.trigger === "career_schedule_due" || run.trigger === "career_daily_due") return true;
  if (run.trigger !== "career_source_reconciled") return false;
  const events = run.trigger_payload.sourceEvents ?? [];
  return events.some((event: { sourceKind: string; dailySourceId?: string }) =>
    event.sourceKind === "schedule" || event.dailySourceId
  ) && !events.some((event: { sourceKind: string }) => event.sourceKind === "agent_contact");
}

export function getScheduledCareerModelOptions(
  configuredModel = process.env.CAREER_SCHEDULED_AGENT_MODEL
) {
  // Scheduled runs wake hundreds of talents a day. Falling back to the chat
  // default (gpt-6.1-terra, high effort) raised daily OpenAI cost about 2.6x
  // after the 2026-11-20 release, so an unset value keeps Haiku.
  const assistantModel = configuredModel?.trim() || CLAUDE_HAIKU_MODEL;
  return {
    assistantModel,
    // Haiku 5.5 enables adaptive thinking and supplies its own default effort.
    assistantAnthropicEffort: assistantModel === CLAUDE_HAIKU_MODEL ? null : undefined,
    assistantOpenAIResponsesReasoningEffort: "high" as const,
  };
}
