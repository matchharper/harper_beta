import { createHash } from "node:crypto";
import type {
  TalentToolDefinition,
  TalentToolExecutionContext,
} from "@/lib/talentOnboarding/tools";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import {
  readTalentSchedules,
  writeTalentSchedule,
  formatTalentSchedules,
} from "./server";
function owner(context?: TalentToolExecutionContext) {
  if (!context?.admin || !context.userId)
    throw new Error("Authenticated Career user required");
  return {
    admin: context.admin as TalentAdminClient,
    userId: context.userId,
    conversationId: context.conversationId,
  };
}
export const TALENT_MEETING_TOOLS: Record<string, TalentToolDefinition> = {
  read_talent_schedules: {
    name: "read_talent_schedules",
    channels: ["chat", "voice"],
    description: TOOL_DESCRIPTIONS.read_talent_schedules,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        schedule_id: { type: "string" },
        role_id: { type: "string" },
        source_key: { type: "string" },
        from: {
          type: "string",
          description: "Inclusive instant with timezone offset.",
        },
        until: {
          type: "string",
          description: "Exclusive instant with timezone offset.",
        },
        include_cancelled: { type: "boolean" },
        offset: { type: "integer", minimum: 0 },
      },
    },
    async execute(input, context) {
      const result = await readTalentSchedules({
        ...owner(context),
        scheduleId: input.schedule_id as string | undefined,
        roleId: input.role_id as string | undefined,
        sourceKey: input.source_key as string | undefined,
        from: input.from as string | undefined,
        until: input.until as string | undefined,
        includeCancelled: input.include_cancelled === true,
        offset: input.offset as number | undefined,
      });
      if (context?.backgroundInvocation) {
        context.backgroundInvocation.meetingScheduleVersions ??= {};
        for (const row of result.schedules)
          context.backgroundInvocation.meetingScheduleVersions[row.id] =
            row.version;
      }
      return { ...result, modelOutput: formatTalentSchedules(result) };
    },
  },
  upsert_talent_schedules: {
    name: "upsert_talent_schedules",
    channels: ["chat", "voice"],
    description: TOOL_DESCRIPTIONS.upsert_talent_schedules,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        action: { type: "string", enum: ["create", "update", "cancel"] },
        schedule_id: { type: "string" },
        expected_version: { type: "integer", minimum: 1 },
        role_id: { type: ["string", "null"] },
        title: { type: "string" },
        content: { type: "string" },
        starts_at: { type: "string" },
        ends_at: { type: ["string", "null"] },
        timezone: { type: "string" },
        source_key: {
          type: "string",
          description:
            "Stable identity of this appointment, required on create. Reuse its original event/message reference across retries; distinguish multiple appointments in one thread.",
        },
        source_refs: {
          type: "object",
          additionalProperties: false,
          properties: {
            gmailThreadIds: { type: "array", items: { type: "string" } },
            gmailMessageIds: { type: "array", items: { type: "string" } },
            messageIds: { type: "array", items: { type: "integer" } },
          },
        },
      },
    },
    async execute(input, context) {
      const requestId = `${context?.resumeRequestId ?? context?.userMessageId ?? context?.toolCallId}:meeting:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
      const schedule = await writeTalentSchedule({
        ...owner(context),
        requestId,
        input,
      });
      if (context?.backgroundInvocation) {
        context.backgroundInvocation.meetingScheduleVersions ??= {};
        context.backgroundInvocation.meetingScheduleVersions[schedule.id] =
          schedule.version;
      }
      return {
        schedule,
        modelOutput: `Appointment saved. No company message or Calendar invitation was sent.\n${formatTalentSchedules({ schedules: [schedule] })}`,
      };
    },
  },
};
