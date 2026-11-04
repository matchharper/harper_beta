import { CAREER_CHAT_ONBOARDING_TOOL_NAMES, CAREER_CHAT_POST_ONBOARDING_TOOL_NAMES } from "@/lib/career/llmTools";
import { browserSessionHref } from "@/lib/career/browser/links";
import { formatDocumentToolModelResult } from "@/lib/talentOnboarding/documentToolModelResult";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import {
  TALENT_TOOL_NAMES,
  TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION,
} from "@/lib/talentOnboarding/tools";
import {
  TALENT_CONTEXT_WRITE_TOOL_PARAMETERS,
  fetchAllTalentContexts,
  mutateTalentContextsFromAgent,
  refreshTalentContextEmbeddings,
} from "@/lib/talentOnboarding/talentContexts";
import {
  getOnboardingQuestionChecklist,
  ONBOARDING_QUESTION_BY_INSIGHT_KEY,
} from "@/lib/talentOnboarding/insightChecklist";
import {
  mergeCareerOnboardingChecklistCoverage,
  getOnboardingChecklistCoverageStats,
} from "@/lib/talentOnboarding/calls";
import { completeOnboardingAndQueueInitialOpportunityRun } from "@/lib/opportunityDiscovery/store";
import type { CareerTextTurnAdapter } from "@/lib/career/chatTurn";
import { callEmailInternalApi } from "./internalApi";
import { assertEmailLease, readRow } from "./store";
import {
  asObject,
  nowIso,
  type EmailJobContext,
  type EmailAttachment,
} from "./types";
import { createHash } from "crypto";
import { updateEmailJob } from "./store";
import { opsEmailTestToolBlock } from "./opsTest";
import { readCareerCapabilityCoaching } from "@/lib/career/capabilities/server";
import { formatPromptText } from "@/lib/llm/promptText";

export async function emailCoachingContext(ctx: EmailJobContext) {
  const activity = await readCareerCapabilityCoaching({
    admin: ctx.admin,
    userId: ctx.talentId,
    conversationId: ctx.conversationId,
  });
  return formatPromptText({
    currentCoaching: activity
      ? {
          activityMessageId: activity.messageId,
          expectedRevision: activity.revision,
          status: activity.status,
          topic: activity.topic,
        }
      : null,
    instruction:
      "A clear request to leave the current coaching activity and begin application preparation authorizes manage_career_coaching_activity action=end using this exact message ID and revision. Then continue the requested application in the same turn. Questions about possibilities alone do not authorize ending it. Email does not open coaching cards or calls.",
  });
}

// One shared schema/executor for each existing business capability. Only the
// attachment transport and email onboarding progress need channel executors.
export const EMAIL_SHARED_TOOL_NAMES = [...new Set([
  ...CAREER_CHAT_ONBOARDING_TOOL_NAMES,
  ...CAREER_CHAT_POST_ONBOARDING_TOOL_NAMES,
  TALENT_TOOL_NAMES.SEARCH_CONNECTED_GMAIL,
])];

export function adaptEmailToolResult(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return result;
  const record = { ...result } as Record<string, unknown>;
  const session = asObject(record.session);
  if (typeof session.id === "string") {
    const href = new URL(browserSessionHref(session.id), getConfiguredPublicSiteUrl()).href;
    record.browserUrl = href;
    record.modelOutput = [record.modelOutput, `Authenticated browser link: ${href}`].filter(Boolean).join("\n");
  }
  if (
    typeof record.documentId === "string" &&
    typeof record.documentLink === "string"
  ) {
    record.documentLink = new URL(
      getCareerDocumentHref(record.documentId),
      getConfiguredPublicSiteUrl()
    ).href;
    record.href = record.documentLink;
    if (record.contentSaved === true)
      record.modelOutput = formatDocumentToolModelResult(
        "upsert_document",
        record
      );
  }
  if (typeof record.assistantInstruction !== "string") return record;
  // Replace only the shared writer instruction. Domain continuation rules,
  // candidate-safe data, authorization and executor effects remain identical.
  const domainInstruction = record.assistantInstruction.startsWith(
    TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION
  )
    ? record.assistantInstruction
        .slice(TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION.length)
        .trim()
    : record.assistantInstruction;
  return {
    ...record,
    assistantInstruction: [
      "Write a natural email continuation focused on the latest request: the relevant verified result and a practical next step if needed. Choose detail proportionally; a straightforward action may need only a short reply. Treat the supplied profile and settings as context, not a report to repeat. Address the reader directly; use their name only when it matters to the request, preserving its exact source spelling. Keep the domain rules below.",
      domainInstruction,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
export function emailToolSelection(
  selection: Parameters<CareerTextTurnAdapter["adaptTools"]>[0],
  onboarding: boolean
) {
  const shared = selection.tools.filter(
    (t) =>
      (EMAIL_SHARED_TOOL_NAMES as readonly string[]).includes(
        t.function.name
      ) &&
      (!onboarding ||
        ![
          "read_talent_context",
          "write_talent_context",
          "manage_career_coaching_activity",
        ].includes(t.function.name))
  );
  const tools = shared.map((tool) =>
    tool.function.name === TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY
        ? {
            ...tool,
            function: {
              ...tool.function,
              description:
                "End the current focused coaching activity when the user clearly stops it or asks to move to application preparation. Use the current coaching message ID and revision. This preserves its conversation and facts, performs no submission, and lets you continue the requested application in this turn. This email tool does not create coaching cards or calls.",
              parameters: {
                type: "object",
                additionalProperties: false,
                required: ["action", "activityMessageId", "expectedRevision"],
                properties: {
                  action: { type: "string", enum: ["end"] },
                  activityMessageId: { type: "integer", minimum: 1 },
                  expectedRevision: { type: "integer", minimum: 1 },
                },
              },
            },
          }
        : tool.function.name === TALENT_TOOL_NAMES.SUGGEST_FORM
          ? { ...tool, function: { ...tool.function, description:
            "Save, revise, read, list or present the same Career review forms and questions. The returned contents are available to you, but email has no interactive cards or buttons. Include the relevant review or questions in your final email body; the candidate replies with answers, corrections or confirmation. Interpret their words in the conversation rather than requiring button actions. Saving a form does not deliver an email or authorize its proposed action. Revisions are immutable; update requires expectedRevision; read includes recorded web responses." } }
          : tool.function.name === TALENT_TOOL_NAMES.USE_BROWSER
            ? { ...tool, function: { ...tool.function, description: tool.function.description.replace(
                "Active sessions appear as stacked previews above the chat composer. Include [[browser:SESSION_ID]] in your message to expand a specific session for the user; this only changes its presentation, not control or authorization. Viewer credentials are delivered only to the user interface.",
                "The result includes an authenticated browser link for human-only actions. Email does not display live previews; the candidate can open that link, complete the required action, and reply to continue the same session. Viewer credentials stay in the authenticated interface."), } }
          : tool.function.name === TALENT_TOOL_NAMES.WRITE_EMAIL
            ? { ...tool, function: { ...tool.function, description: tool.function.description.replace(
                "Gmail permission is required; if unavailable, explain and show [[integration:gmail]].",
                "Gmail permission is required; if unavailable, use the supplied Career link to connect."), } }
            : tool
  );
  tools.push({
    type: "function",
    function: {
      name: "upload_email_attachments",
      description:
        "Save attachments from the current email as candidate documents. Choose their one-based indexes and document kinds. This does not send or share them with a company; use the shared contact_company tool with a returned documentId only when the user wants to send it.",
      parameters: {
        type: "object",
        properties: {
          documentUploads: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                attachmentIndex: { type: "integer", minimum: 1 },
                kind: {
                  type: "string",
                  enum: ["resume", "document"],
                },
              },
              required: ["attachmentIndex", "kind"],
              additionalProperties: false,
            },
          },
        },
        required: ["documentUploads"],
        additionalProperties: false,
      },
    },
  });
  if (onboarding)
    tools.push({
      type: "function",
      function: {
        name: "update_onboarding_progress",
        description:
          "Record the latest email's explicitly supplied Brief/Memory facts and answered onboarding checklist items. Preserve the existing onboarding questions and completion rule. The model may judge what the answer means; the server checks identifiers and saves the facts. Do not mark a question answered merely because it is being asked in your outgoing reply.",
        parameters: {
          type: "object",
          properties: {
            coveredChecklistKeys: {
              type: "array",
              items: {
                type: "string",
                enum: getOnboardingQuestionChecklist().map((i) => i.key),
              },
            },
            contextChanges: TALENT_CONTEXT_WRITE_TOOL_PARAMETERS.properties
              .changes as unknown as Record<string, unknown>,
            completeOnboarding: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    });
  return {
    ...selection,
    tools,
    toolNames: tools.map((t) => t.function.name),
    stopAfterToolNames: selection.stopAfterToolNames.filter((name) =>
      tools.some((t) => t.function.name === name)
    ),
  };
}

export async function executeEmailOnboardingProgress(
  ctx: EmailJobContext,
  input: Record<string, unknown>
) {
  const profile = await readRow(
    ctx.admin,
    "talent_users",
    ctx.talentId,
    "user_id"
  );
  const setting = await readRow(
    ctx.admin,
    "talent_setting",
    ctx.talentId,
    "user_id"
  );
  if (setting?.is_onboarding_done) return { ok: true, alreadyComplete: true };
  const changes = Array.isArray(input.contextChanges)
    ? input.contextChanges
    : [];
  if (changes.length) {
    const result = await mutateTalentContextsFromAgent({
      admin: ctx.admin,
      changes: changes as any,
      referencedRows: await fetchAllTalentContexts({
        admin: ctx.admin,
        userId: ctx.talentId,
      }),
      requestId: `email-onboarding:${ctx.sourceMessage.id}:${createHash(
        "sha256"
      )
        .update(JSON.stringify(canonicalCommand(changes)))
        .digest("hex")}`,
      sourceRefs: [
        {
          conversationId: ctx.conversationId,
          messageId: ctx.sourceMessage.id,
          type: "email_reply_onboarding",
        },
      ],
      userId: ctx.talentId,
    });
    await refreshTalentContextEmbeddings({
      admin: ctx.admin,
      ids: result.changedIds,
      userId: ctx.talentId,
    });
  }
  const keys = Array.isArray(input.coveredChecklistKeys)
    ? input.coveredChecklistKeys.filter(
        (k): k is string => typeof k === "string"
      )
    : [];
  const changeKeys = changes.flatMap((c: any) =>
    c.key && ONBOARDING_QUESTION_BY_INSIGHT_KEY.has(c.key)
      ? [ONBOARDING_QUESTION_BY_INSIGHT_KEY.get(c.key)!]
      : []
  );
  const progress = await mergeCareerOnboardingChecklistCoverage({
    admin: ctx.admin,
    conversationId: ctx.conversationId,
    coveredKeys: [...keys, ...changeKeys],
    userId: ctx.talentId,
  });
  const stats = getOnboardingChecklistCoverageStats(progress.coverage, profile);
  const run = stats.isComplete
    ? await completeOnboardingAndQueueInitialOpportunityRun({
        admin: ctx.admin,
        conversationId: ctx.conversationId,
        completionReason: "question_checklist_covered",
        source: "email_reply_onboarding",
        userId: ctx.talentId,
      })
    : null;
  return {
    ok: true,
    completion: {
      isComplete: stats.isComplete,
      remaining: stats.missingItems.map((i) => ({
        key: i.key,
        label: i.label,
      })),
    },
    opportunityDiscoveryQueued: Boolean(run),
  };
}

/** Email uses the same original-agent introduction tools and source message as chat. */
export async function confirmEmailAcceptance(
  _ctx: EmailJobContext,
  _input: Record<string, unknown>,
  executeDefault: () => Promise<unknown>,
  _legacyAccept?: (payload: Record<string, unknown>) => Promise<unknown>,
) {
  return executeDefault();
}

async function executeChannelTool(
  ctx: EmailJobContext,
  args: Parameters<CareerTextTurnAdapter["executeTool"]>[0]
) {
  if (args.name === TALENT_TOOL_NAMES.MANAGE_CAREER_COACHING_ACTIVITY) {
    if (args.input.action !== "end")
      return {
        ok: false,
        reason:
          "Email supports ending the current coaching activity; new coaching cards and calls require Career.",
      };
    const raw = asObject(await args.executeDefault());
    const result = {
      ok: raw.ok,
      status: raw.status,
      error: raw.error,
      coachingContext: await emailCoachingContext(ctx),
      assistantInstruction:
        "Use the current coaching state and actual result. After a successful end, continue the user's requested application in this turn. An unsuccessful mutation did not end coaching; use the current revision if the same authorized change is still needed.",
    };
    return { ...result, modelOutput: formatPromptText(result) };
  }
  if (
    args.name === TALENT_TOOL_NAMES.CONTACT_COMPANY &&
    process.env.EMAIL_REPLY_DRY_RUN === "true"
  )
    return { ok: false, error: "dry_run_contact_not_sent" };
  if (args.name === "upload_email_attachments") {
    const payload = resolveEmailAttachmentUploads(
      ctx.attachments,
      args.input.documentUploads
    );
    if (!payload) return { ok: false, error: "invalid_attachment_index" };
    return callEmailInternalApi(
      "/api/internal/career/email-onboarding/ingest-profile",
      {
        userId: ctx.talentId,
        inboundEventId: ctx.inbound.id,
        source: "email_reply_tool",
        ...payload,
      }
    );
  }
  if (args.name === "update_onboarding_progress")
    return executeEmailOnboardingProgress(ctx, args.input);
  if (args.name === TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK)
    return confirmEmailAcceptance(ctx, args.input, args.executeDefault);
  return args.executeDefault();
}

export function resolveEmailAttachmentUploads(
  attachments: EmailAttachment[],
  value: unknown
) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 3 ||
    value.some(
      (v) =>
        !v ||
        !Number.isInteger(v.attachmentIndex) ||
        !attachments[v.attachmentIndex - 1] ||
        !["resume", "document"].includes(v.kind)
    ) ||
    new Set(value.map((v) => v.attachmentIndex)).size !== value.length
  )
    return null;
  return {
    attachments: value.map((v) => ({
      ...attachments[v.attachmentIndex - 1],
      fileName: attachments[v.attachmentIndex - 1].filename,
    })),
    documentUploads: value.map((v) => ({
      fileName: attachments[v.attachmentIndex - 1].filename,
      kind: v.kind,
    })),
  };
}

const MUTATING_EMAIL_TOOLS = new Set([
  TALENT_TOOL_NAMES.UPDATE_SETTING,
  TALENT_TOOL_NAMES.UPDATE_LANGUAGE_SETTING,
  TALENT_TOOL_NAMES.UPDATE_RECOMMENDED_OPPORTUNITY_FEEDBACK,
  TALENT_TOOL_NAMES.UPDATE_TALENT_PROFILE,
  TALENT_TOOL_NAMES.WRITE_TALENT_CONTEXT,
  TALENT_TOOL_NAMES.UPSERT_DOCUMENT,
  TALENT_TOOL_NAMES.GENERATE_RESUME,
  TALENT_TOOL_NAMES.CONTACT_COMPANY,
  "upload_email_attachments",
  "update_onboarding_progress",
]);
function canonicalCommand(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalCommand);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalCommand(item)])
    );
  return value;
}
export async function executeEmailTool(
  ctx: EmailJobContext,
  args: Parameters<CareerTextTurnAdapter["executeTool"]>[0]
) {
  const job = await assertEmailLease(ctx.admin, "reply", ctx.job.id, ctx.owner);
  const blocked = opsEmailTestToolBlock(job, args.name, args.input);
  if (blocked) return blocked;
  if (!MUTATING_EMAIL_TOOLS.has(args.name))
    return adaptEmailToolResult(await executeChannelTool(ctx, args));
  const key = createHash("sha256")
    .update(
      JSON.stringify({ name: args.name, input: canonicalCommand(args.input) })
    )
    .digest("hex");
  const cache = asObject(asObject(job.metadata).emailToolResults);
  if (Object.prototype.hasOwnProperty.call(cache, key))
    return adaptEmailToolResult(cache[key]);
  const result = await executeChannelTool(ctx, args);
  if (
    result &&
    typeof result === "object" &&
    !("ok" in result && result.ok === false)
  ) {
    const current = await assertEmailLease(
      ctx.admin,
      "reply",
      ctx.job.id,
      ctx.owner
    );
    await updateEmailJob(ctx.admin, "reply", ctx.job.id, ctx.owner, {
      metadata: {
        ...asObject(current.metadata),
        emailToolResults: {
          ...asObject(asObject(current.metadata).emailToolResults),
          [key]: result,
        },
      },
    });
  }
  return adaptEmailToolResult(result);
}
