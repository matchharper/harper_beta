import { CLAUDE_HAIKU_MODEL } from "@/lib/llm/modelConfig";
import type { CareerBackgroundRun } from "./types";

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
  const assistantModel = configuredModel?.trim() || CLAUDE_HAIKU_MODEL;
  return {
    assistantModel,
    // Haiku 5.5 enables adaptive thinking and supplies its own default effort.
    assistantAnthropicEffort: assistantModel === CLAUDE_HAIKU_MODEL ? null : undefined,
    assistantOpenAIResponsesReasoningEffort: "high" as const,
  };
}
