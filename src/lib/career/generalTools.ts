import { withEffectWaiting } from "./externalOperations/effects";
import { z } from "zod";
import { readCareerBrowserServiceTier } from "./browserServiceTier.server";
import { CAREER_WORK_TOOLS } from "./work/tools";
import { CAREER_ACTION_ITEM_TOOLS } from "./actionItemsTool";
import { CAREER_CONTENT_SUGGESTION_TOOLS } from "./contentSuggestionsTool";
import { CAREER_TURN_PLAN_TOOLS } from "./turnPlan";
import { CAREER_TEAM_REQUEST_TOOLS } from "./teamRequest";
import { CAREER_CONTACT_TOOLS } from "@/lib/agentContacts/careerTools";
import { TALENT_MEETING_TOOLS } from "./meetings/tools";
import { createHash } from "node:crypto";
import type { TalentToolDefinition, TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { suggestFormTool, executeSuggestForm } from "./forms/server";
import { USE_BROWSER_TOOL, browserContinuation, executePreparationList, executeUseBrowser } from "./browser/tool";
import { WRITE_EMAIL_TOOL, executeWriteEmail } from "./emailWriting/tool";
import {READ_CALENDAR_TOOL,WRITE_CALENDAR_TOOL,executeReadCalendar,executeWriteCalendar} from "./calendar/tools";
import { CAREER_PROFILE_TOOLS, formatProfileToolResult } from "./profiles/tools";
import { CAREER_INTERNAL_APPLICATION_TOOLS, formatInternalApplicationToolResult } from "./internalApplications/tools";
import { CAREER_MATCHING_TOOLS } from "./matching/tools";
import { CAREER_NOTE_TOOLS } from "./notes/tools";
import { formatCareerMatchingResult } from "./matching/formatters";
import { CAREER_COMPANY_TOOLS } from "./companies/tools";
import { CAREER_SCHEDULE_TOOLS } from "./schedules/tools";
import { CAREER_DELIVERY_TOOLS } from "./background/delivery";

function projectedTools(tools: Record<string, TalentToolDefinition>, format: (name: string, result: unknown, context?: TalentToolExecutionContext) => string) {
  return Object.fromEntries(Object.entries(tools).map(([name, tool]) => [name, { ...tool,
    execute: async (input: Record<string, unknown>, context?: TalentToolExecutionContext) => {
      const result = await tool.execute!(input, context);
      return { ...(result as Record<string, unknown>), modelOutput: format(name, result, context) };
    },
  }]));
}

export const CAREER_AGENTIC_TOOLS: Record<string, TalentToolDefinition> = {
  ...CAREER_CONTACT_TOOLS,
  ...projectedTools(CAREER_PROFILE_TOOLS, formatProfileToolResult),
  ...projectedTools(CAREER_INTERNAL_APPLICATION_TOOLS, formatInternalApplicationToolResult),
  ...projectedTools(CAREER_MATCHING_TOOLS, (_name, value, context) => formatCareerMatchingResult(value, context?.responseLocale, { roleIdsOnly: context?.backgroundInvocation?.scheduledWork })),
  ...CAREER_NOTE_TOOLS,
  ...TALENT_MEETING_TOOLS,
  ...CAREER_COMPANY_TOOLS, ...CAREER_SCHEDULE_TOOLS, ...CAREER_DELIVERY_TOOLS,
};

function executionContext(context: TalentToolExecutionContext | undefined, name: string, input: Record<string, unknown>) {
  if (!context?.admin || !context.userId || !context.conversationId) {
    throw new Error(`${name} requires an authenticated conversation.`);
  }
  const commandHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const references=z.object({responsibility_ref:z.object({id:z.string().uuid(),revision:z.number().int().positive()}).optional(),
    opportunity_id:z.string().uuid().optional(),effect_ref:z.string().uuid().optional()}).parse(input);
  return {
    admin: context.admin as TalentAdminClient,
    userId: context.userId,
    conversationId: context.conversationId,
    userMessageId: Number(context.userMessageId) > 0 ? Number(context.userMessageId) : undefined,
    requestId: `${context.resumeRequestId ?? context.userMessageId ?? context.toolCallId}:${name}:${commandHash}`,
    replyId: context.resumeRequestId,
    signal: context.abortSignal,
    workId: context.workId,
    claimId: context.agentClaimId,
    workRevision: context.workRevision,
    responsibilityId: references.responsibility_ref?.id,
    responsibilityRevision: references.responsibility_ref?.revision,
    opportunityId: references.opportunity_id,
    effectRef: references.effect_ref,
    deadlineAt: context.deadlineAt,
  };
}

export const CAREER_GENERAL_TOOLS: Record<string, TalentToolDefinition> = {
  read_calendar:{...READ_CALENDAR_TOOL,channels:["chat"],execute:(input,context)=>executeReadCalendar(input,executionContext(context,"read_calendar",input))},
  write_calendar:{...WRITE_CALENDAR_TOOL,channels:["chat"],execute:(input,context)=>withEffectWaiting(()=>executeWriteCalendar(input,executionContext(context,"write_calendar",input)))},
  ...CAREER_AGENTIC_TOOLS,
  ...CAREER_WORK_TOOLS,
  ...CAREER_ACTION_ITEM_TOOLS,
  ...CAREER_CONTENT_SUGGESTION_TOOLS,
  ...CAREER_TURN_PLAN_TOOLS,
  ...CAREER_TEAM_REQUEST_TOOLS,
  suggest_form: {
    ...suggestFormTool.function,
    channels: ["chat"],
    execute: (input, context) => executeSuggestForm({
      ...executionContext(context, "suggest_form", input), input,
      onMessage: context?.onArtifactMessage,
    }),
  },
  use_browser: {
    ...USE_BROWSER_TOOL,
    channels: ["chat"],
    async execute(input, context) {
      const browserContext = executionContext(context, "use_browser", input);
      const browserServiceTier = input.action === "run"
        ? await readCareerBrowserServiceTier(browserContext) : undefined;
      // A preparation list (runs) starts each item as its own run, at the same time.
      const runContext = { ...browserContext, browserServiceTier };
      if (Array.isArray(input.runs)) {
        const list = await withEffectWaiting(() => executePreparationList(input, runContext, context?.onArtifactMessage));
        // The reply waits for each started run; the first also stays the single continuation older readers use.
        if (!("careerContinuations" in list)) return list;
        return { ...list, ...(list.careerContinuations[0] ? { careerContinuation: list.careerContinuations[0] } : {}) };
      }
      const result = await withEffectWaiting(() => executeUseBrowser(input, runContext, context?.onArtifactMessage));
      if ("message" in result && result.message && input.action !== "run") context?.onArtifactMessage?.(result.message);
      const pending = browserContinuation(result);
      return { ...result, ...(pending ? { careerContinuation: pending } : {}) };
    },
  },
  write_email: {
    ...WRITE_EMAIL_TOOL,
    channels: ["chat"],
    execute: (input, context) => withEffectWaiting(() => executeWriteEmail(input, executionContext(context, "write_email", input))),
  },
};
