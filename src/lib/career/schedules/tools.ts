import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { createHash } from "node:crypto";
import type {
  TalentToolDefinition,
  TalentToolExecutionContext,
} from "@/lib/talentOnboarding/tools";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  listCareerSchedules,
  readCareerSchedule,
  writeCareerSchedule,
  formatCareerSchedules,
} from "./server";
const base = (context: TalentToolExecutionContext | undefined) => {
  if (!context?.admin || !context.userId)
    throw new Error("Authenticated Career user required.");
  return {
    admin: context.admin as TalentAdminClient,
    userId: context.userId,
    conversationId: context.conversationId,
  };
};
export const CAREER_SCHEDULE_TOOLS: Record<string, TalentToolDefinition> = {
  list_schedules: {
    name: "list_schedules",
    channels: ["chat", "voice"],
    description: TOOL_DESCRIPTIONS.list_schedules,
    parameters: {
      type: "object",
      properties: {
        status: { type: "string" },
        offset: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
    async execute(input, context) {
      const result = await listCareerSchedules({
        ...base(context),
        status: input.status as string | undefined,
        offset: input.offset as number | undefined,
      });
      return {
        ...result,
        modelOutput: formatCareerSchedules(result.schedules, result.nextOffset),
      };
    },
  },
  read_schedule: {
    name: "read_schedule",
    channels: ["chat", "voice"],
    description: TOOL_DESCRIPTIONS.read_schedule,
    parameters: {
      type: "object",
      properties: { schedule_id: { type: "string" } },
      required: ["schedule_id"],
      additionalProperties: false,
    },
    async execute(input, context) {
      const schedule = await readCareerSchedule({
        ...base(context),
        scheduleId: String(input.schedule_id),
      });
      return { schedule, modelOutput: formatCareerSchedules([schedule]) };
    },
  },
  upsert_schedule: {
    name: "upsert_schedule",
    channels: ["chat", "voice"],
    description: TOOL_DESCRIPTIONS.upsert_schedule,
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["create", "update", "pause", "resume", "cancel"],
        },
        schedule_id: { type: "string" },
        expected_revision: { type: "integer" },
        title: { type: "string" },
        instruction: { type: "string" },
        target_refs: {
          type: "object",
          description:
            "Optional durable subject references. Set flexibleTiming=true only when execution may move within the same Korea calendar day to combine with other pending work. Omit or set false for a user-requested exact time or time-dependent action. Set meetingScheduleIds to exact appointment IDs for preparation/reminders; current appointment facts are reloaded at execution. To revisit an existing company-requested follow-up, set companyFollowupIds to its exact followup IDs; current pending requests will be read again at execution.",
        },
        timezone: { type: "string" },
        next_run_at: {
          type: ["string", "null"],
          description: "Absolute next occurrence, including timezone offset.",
        },
        recurrence: {
          type: ["string", "null"],
          description:
            "Calendar cron rule in timezone. Setting it replaces interval_days.",
        },
        interval_days: {
          type: ["number", "null"],
          description:
            "Elapsed days between checks; may be fractional. Setting it replaces cron recurrence. Clear both repetition fields for one-time work.",
        },
        reason: {
          type: "string",
          description:
            "Reason for this schedule change, including the user instruction or observed context it follows.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    async execute(input, context) {
      const requestId = `${context?.resumeRequestId ?? context?.userMessageId ?? context?.toolCallId}:schedule:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
      const schedule = await writeCareerSchedule({
        ...base(context),
        requestId,
        input,
        actor: "career_agent",
        backgroundRunId: context?.backgroundInvocation?.runId,
        sourceMessageId:
          Number(context?.userMessageId) > 0
            ? Number(context?.userMessageId)
            : undefined,
      });
      return {
        schedule,
        modelOutput: `Schedule saved.\n${formatCareerSchedules([schedule])}`,
      };
    },
  },
};
