import { z } from "zod";
import { listPendingReplies, formatPendingReply } from "./pendingReplies";
import type { TalentToolDefinition, TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";
import { workRpc, readWork, listWork, formatWork } from "./store";
import { publishCareerInvocations } from "./invocations";

const inputSchema = z.object({
  action: z.enum(["start", "read", "list", "update", "wait", "finish", "cancel"]),
  work_id: z.string().uuid().optional(),
  reply_id: z.string().optional(),
  checkpoint_id: z.string().optional(),
  expected_revision: z.number().int().positive().optional(),
  target: z.string().optional(),
  identity: z.string().optional(),
  instruction: z.string().optional(),
  source_refs: z.array(z.number().int().positive()).optional(),
  note: z.string().optional(),
  refs: z.array(z.string()).optional(),
  before: z.string().uuid().optional(),
  include_closed: z.boolean().optional(),
});

export const CAREER_WORK_TOOLS: Record<string, TalentToolDefinition> = {
  manage_work: {
    name: "manage_work", channels: ["chat"],
    description: "Delegate a bounded responsibility to an independent Career execution when separate reasoning or context helps. Start returns a durable receipt, not a completed result. Completion and remaining human needs arrive here automatically as execution events. read/list return a current snapshot without waiting; continue useful work or return while pending. The delegate does not address the user directly. Multiple messages, targets or human waits alone do not require delegation. Reuse existing work for the same purpose and target. Read/list expose results and original sources. Update routes new user instructions to existing work. Only its executor may wait or finish with an actual outcome. Cancel stops new effects, not completed submissions. Authority comes from the cited user messages.",
    parameters: { type: "object", properties: {
      action: { type: "string", enum: ["start", "read", "list", "update", "wait", "finish", "cancel"] },
      reply_id: { type: "string", description: "Exact pending conversation request from list, for cancel." },
      checkpoint_id: { type: "string", description: "Exact pending checkpoint from list, for cancel." },
      work_id: { type: "string" }, expected_revision: {
        type: "integer", minimum: 1,
        description: "Observed work revision for update/wait/finish/cancel. Required when updating or cancelling a work. For wait/finish of this invocation's own work, omission uses its execution-start revision; concurrent changes still conflict. An explicit revision from read/list takes precedence. Pending reply cancellation uses checkpoint_id instead.",
      },
      target: { type: "string", description: "Exact resource identity, e.g. role UUID or owned document ID; import URL postings first. For list, optionally filter by this exact target." },
      identity: { type: "string", description: "Stable purpose + target identity. Reuse for repeated requests; a new episode needs an explicit user request." },
      instruction: { type: "string", description: "Purpose and constraints grounded in user sources, or the new instruction for update." },
      source_refs: { type: "array", items: { type: "integer" }, description: "Authenticated user message IDs grounding the request/authority. Omit to use the user inputs delivered to this execution. Supply IDs only when read from actual source references; conversation positions are not IDs." },
      note: { type: "string", description: "Actual remaining need or observed outcome." },
      refs: { type: "array", items: { type: "string" }, description: "Exact form, document or execution receipt references." },
      before: { type: "string" },
      include_closed: { type: "boolean", description: "List completed/cancelled work too; defaults to open responsibilities." },
    }, required: ["action"], additionalProperties: false },
    async execute(raw, context?: TalentToolExecutionContext) {
      if (!context?.admin || !context.userId || !context.conversationId) throw new Error("Authenticated conversation required");
      const scope = { admin: context.admin as import("@/lib/talentOnboarding/admin").TalentAdminClient, userId: context.userId, conversationId: context.conversationId };
      const input = inputSchema.parse(raw);
      if (input.action === "list") {
        const result = await listWork(scope, input.before, input.include_closed, input.target);
        const pendingReplies = await listPendingReplies(scope, context.resumeRequestId ?? undefined);
        return { ...result, pendingReplies, modelOutput: [...pendingReplies.map(formatPendingReply), ...result.works.map(formatWork), result.nextCursor ? `Next cursor: ${result.nextCursor}` : "End of work list."].join("\n\n") };
      }
      if (input.reply_id) {
        if (input.action !== "cancel" || !input.checkpoint_id || input.work_id || input.reply_id === context.resumeRequestId)
          throw new Error("Cancel a listed pending reply with its exact checkpoint_id.");
        const { data, error } = await (scope.admin.rpc as any)("cancel_career_pending_reply", {
          p_user_id: scope.userId, p_conversation_id: scope.conversationId,
          p_reply_id: input.reply_id, p_checkpoint_id: input.checkpoint_id,
        });
        if (error) throw error;
        await publishCareerInvocations(scope).catch(() => undefined);
        return { ...data, modelOutput: `Conversation request ${input.reply_id}: ${data.status}. Completed external actions remain unchanged.` };
      }
      if (input.action === "read") {
        const work = await readWork(scope, z.string().uuid().parse(input.work_id));
        return { work, modelOutput: formatWork(work) };
      }
      if (input.action === "start" && context.workId) throw new Error("Continue this work; independent work is delegated from the conversation.");
      const work = await workRpc(scope, input.action, { ...input,
        expected_revision: input.expected_revision ?? (
          (input.action === "wait" || input.action === "finish") && input.work_id === context.workId
            ? context.workRevision : undefined
        ),
        source_refs: input.source_refs ?? context.userMessageIds ?? (context.userMessageId ? [Number(context.userMessageId)] : []),
        caller_work_id: context.workId ?? null,
        origin_reply_id: context.resumeRequestId ?? null,
      });
      if (["wait", "finish", "cancel"].includes(input.action)) {
        const { releaseWorkBrowsers } = await import("./resources");
        await releaseWorkBrowsers(scope, work.id, input.action === "cancel").catch(error => {
          // The durable work change remains authoritative even if provider cleanup
          // fails. Its cleanup invocation and provider expiry recover the resource.
          console.warn("[career-work] Browser cleanup deferred", { workId: work.id, error: String(error) });
        });
      }
      await publishCareerInvocations(scope).catch(() => undefined); // DB outbox owns recovery.
      return { work, modelOutput: formatWork(work) };
    },
  },
};
