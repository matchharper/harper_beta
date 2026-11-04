import { z } from "zod";
import type { TalentToolDefinition, TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";
import { workRpc, readWork, listWork, formatWork } from "./store";
import { publishCareerInvocations } from "./invocations";

const inputSchema = z.object({
  action: z.enum(["start", "read", "list", "update", "wait", "finish", "cancel"]),
  work_id: z.string().uuid().optional(),
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
    description: "Start and continue independently executable delegated work using the same Career agent and tools. Each work survives chat, browser expiry and human waits. Start distinct responsibilities separately; return to the conversation without waiting for them. Reuse existing work for the same target and purpose. Read/list expose actual progress and source refs. Update routes a user instruction to exact work. Only the invocation executing that work can use wait to record a remaining need or finish to record an observed outcome; the originating conversation uses update to route new instructions. Cancellation stops new effects but cannot undo an external submission. Meaning and authority come from the cited user messages, never from a generated instruction alone.",
    parameters: { type: "object", properties: {
      action: { type: "string", enum: ["start", "read", "list", "update", "wait", "finish", "cancel"] },
      work_id: { type: "string" }, expected_revision: { type: "integer" },
      target: { type: "string", description: "Exact resource identity, e.g. role UUID or owned document ID; import URL postings first." },
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
        const result = await listWork(scope, input.before, input.include_closed);
        return { ...result, modelOutput: [...result.works.map(formatWork), result.nextCursor ? `Next cursor: ${result.nextCursor}` : "End of work list."].join("\n\n") };
      }
      if (input.action === "read") {
        const work = await readWork(scope, z.string().uuid().parse(input.work_id));
        return { work, modelOutput: formatWork(work) };
      }
      if (input.action === "start" && context.workId) throw new Error("Continue this work; independent work is delegated from the conversation.");
      const work = await workRpc(scope, input.action, { ...input,
        source_refs: input.source_refs ?? context.userMessageIds ?? (context.userMessageId ? [Number(context.userMessageId)] : []),
        caller_work_id: context.workId ?? null,
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
