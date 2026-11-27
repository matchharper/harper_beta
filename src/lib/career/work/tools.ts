import { resourceRefSchema, resourceDb } from "../resources/types";
import { refsInput } from "../resources/toolSchemas";
import { z } from "zod";
import { listPendingReplies, formatPendingReply } from "./pendingReplies";
import type { TalentToolDefinition, TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";
import { workRpc, readWork, listWork, formatWork } from "./store";
import { publishCareerInvocations } from "./invocations";

const inputSchema = z.object({
  action: z.enum(["start", "read", "list", "update", "wait", "finish", "cancel"]),
  mode:z.enum(["current","independent"]).optional(),
  scope:z.enum(["conversation","user"]).optional(),
  resource_refs:z.array(resourceRefSchema).optional(),context_refs:z.array(resourceRefSchema).optional(),
  waiting_on:z.object({kind:z.string(),account_id:z.string().optional(),account_generation:z.string().optional(),thread_id:z.string().optional(),operation_ids:z.array(z.string().uuid()).optional()}).optional(),
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

/**
 * A start needs identity, instruction and a user source together, which the JSON schema cannot say. The database
 * checks them only after the refs and refuses with one message for all three, and a start resent after a refused ref
 * often dropped one of them (#120), so code names what is missing before the call.
 */
function missingStartValues(input: z.infer<typeof inputSchema>, sourceRefs: number[], delivered: number[]) {
  const missing = [!input.identity?.trim() && "identity", !input.instruction?.trim() && "instruction", !sourceRefs.length && "source_refs"].filter(Boolean);
  if (!missing.length) return null;
  return [
    `Work not started: ${missing.join(", ")} missing. Resend the same start with identity, instruction and source_refs all set, keeping its mode, target and refs.`,
    `identity: a stable purpose + target name, the same for a repeated request. instruction: the purpose and constraints from the user's messages. source_refs: the exact IDs of the user messages that asked for this work (shown as "User message <id>").`,
    sourceRefs.length ? "" : delivered.length ? `Omit source_refs to cite the user messages delivered to this execution (${delivered.join(", ")}).`
      : "This execution received no user message, so source_refs must name them.",
  ].filter(Boolean).join(" ");
}

export const CAREER_WORK_TOOLS: Record<string, TalentToolDefinition> = {
  manage_work: {
    name: "manage_work", channels: ["chat"],
    description: "Record a durable responsibility when actual work continues beyond the immediate task. mode=current keeps execution in this conversation without starting another agent; mode=independent starts a bounded independent execution (the compatibility default). Authority comes from exact user messages. Read/list can inspect responsibilities across this user's conversations; update/cancel route changes to the original owner using its observed revision. Only the executing origin or delegate may wait/finish. Waiting records an actual external event or human need. Reuse work and receipts for the same purpose and target. Cancellation stops new effects, not already submitted actions.",
    parameters: { type: "object", properties: {
      action: { type: "string", enum: ["start", "read", "list", "update", "wait", "finish", "cancel"] },
      reply_id: { type: "string", description: "Exact pending conversation request from list, for cancel." },
      checkpoint_id: { type: "string", description: "Exact pending checkpoint from list, for cancel." },
      mode:{type:"string",enum:["current","independent"]},scope:{type:"string",enum:["conversation","user"]},
      resource_refs:refsInput,context_refs:refsInput,
      waiting_on:{type:"object",properties:{kind:{type:"string"},account_id:{type:"string"},account_generation:{type:"string"},thread_id:{type:"string"},operation_ids:{type:"array",items:{type:"string"}}},required:["kind"],additionalProperties:false},
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
        const result = await listWork(scope, input.before, input.include_closed, input.target,input.scope==="user");
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
      const delivered = context.userMessageIds ?? (context.userMessageId ? [Number(context.userMessageId)] : []);
      const sourceRefs = input.source_refs ?? delivered;
      const missing = input.action === "start" ? missingStartValues(input, sourceRefs, delivered) : null;
      if (missing) throw new Error(missing);
      const waitingOn=input.action==="wait"&&input.waiting_on?.kind==="gmail_thread"
        ? await (await import("../emailWriting/sync")).prepareMailWait(scope,input.waiting_on) : input.waiting_on;
      const work = await workRpc(scope, input.action, { ...input,
        waiting_on:waitingOn,
        expected_revision: input.expected_revision ?? (
          (input.action === "wait" || input.action === "finish") && input.work_id === context.workId
            ? context.workRevision : undefined
        ),
        source_refs: sourceRefs,
        caller_work_id: context.workId ?? null,
        claim_id:context.agentClaimId??null,
        origin_reply_id: context.resumeRequestId ?? null,
      });
      if (["wait", "finish", "cancel"].includes(input.action)) {
        const { releaseWorkBrowsers } = await import("./resources");
        await releaseWorkBrowsers({...scope,conversationId:work.conversation_id??scope.conversationId}, work.id, input.action === "cancel").catch(error => {
          // The durable work change remains authoritative even if provider cleanup
          // fails. Its cleanup invocation and provider expiry recover the resource.
          console.warn("[career-work] Browser cleanup deferred", { workId: work.id, error: String(error) });
        });
      }
      await publishCareerInvocations({...scope,conversationId:work.conversation_id??scope.conversationId}).catch(() => undefined); // DB outbox owns recovery.
      if(waitingOn?.kind==="gmail_thread"||["finish","cancel"].includes(input.action))
        await (await import("../emailWriting/sync")).wakeMailSyncForUser(scope).catch(error=>console.warn("[career-mail] Sync remains recoverable",{error:String(error)}));
      return { work, modelOutput: formatWork(work) };
    },
  },
};
