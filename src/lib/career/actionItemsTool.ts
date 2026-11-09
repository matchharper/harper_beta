import { z } from "zod";
import { createHash } from "node:crypto";
import type { TalentToolDefinition } from "@/lib/talentOnboarding/tools";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  careerActionItemContentSchema,
  formatCareerActionItem,
  type CareerActionItem,
} from "./actionItems";
import {
  listCareerActionItems,
  readCareerActionItem,
  readCareerActionItemRow,
} from "./actionItems.server";

const identity = {
  id: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
};
const createSchema = z.object({
  operation: z.literal("create"),
  item: careerActionItemContentSchema,
});
const updateSchema = z.object({
  operation: z.literal("update"),
  ...identity,
  item: careerActionItemContentSchema.partial(),
});
const deleteSchema = z.object({ operation: z.literal("delete"), ...identity });
const changeSchema = z.discriminatedUnion("operation", [
  createSchema,
  updateSchema,
  deleteSchema,
]);
const inputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("list") }),
  createSchema,
  updateSchema,
  deleteSchema,
  z.object({ operation: z.literal("batch"), changes: z.array(changeSchema) }),
]);
type Change = z.infer<typeof changeSchema>;

const changeProperties = {
  operation: { type: "string", enum: ["create", "update", "delete"] },
  id: { type: "string", description: "Exact saved item ID for update/delete." },
  expectedRevision: {
    type: "integer",
    description:
      "Revision read from the current list, required for update/delete.",
  },
  item: {
    type: "object",
    description:
      "create requires all six fields. update accepts only changed fields; omitted fields are preserved. If changing action, supply both its type and text.",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      buttonText: { type: "string" },
      action: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["send_message", "compose_reply"] },
          text: {
            type: "string",
            description:
              "send_message: visible chat message sent on click, in natural user wording, for Harper to respond or show content. compose_reply: model context attached to the user's subsequent reply; exact work/form/role refs can go here. This mode only selects the card above the composer, without showing a form or fetching content. Keep the scope consistent with the visible button.",
          },
        },
        required: ["type", "text"],
        additionalProperties: false,
      },
      priority: {
        type: "integer",
        description:
          "Display position only, not urgency or execution priority. Higher numbers appear above lower numbers. Follow the viewing order the user specified; otherwise choose the display order.",
      },
      urgency: {
        type: "string",
        enum: ["normal", "soon", "urgent"],
        description:
          "Time sensitivity: normal (no time pressure), soon (attention needed soon), urgent (attention needed now). Urgent cards have a subtly emphasized border; no urgency text label is displayed. Independent of display position.",
      },
    },
    additionalProperties: false,
  },
};

function mutationResult(
  status: string,
  id: string | null,
  item: CareerActionItem | null
) {
  return {
    status,
    id,
    item,
    modelOutput: [
      `Visible action ${id ?? "(new item)"}: ${status}.`,
      item ? formatCareerActionItem(item) : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export const CAREER_ACTION_ITEM_TOOLS: Record<string, TalentToolDefinition> = {
  manage_action_items: {
    name: "manage_action_items",
    channels: ["chat"],
    description:
      "Read, create, revise or remove persistent actions highlighted on the user's Career home. Only items saved by this tool appear in that panel; showing a form or sending chat text does not add one. Use for concrete next steps that should remain visible across visits, including return-time discoveries and delegated work awaiting input; ordinary conversational offers do not need a list item. Reuse existing items for the same purpose. This only changes the visible list; it does not run work, send messages, resolve forms or grant consent. Deleting a highlight preserves its underlying saved opportunities, forms and work. list returns all current items. create requires all six item fields. update requires id, expectedRevision and an item containing only the fields to change. delete requires id and expectedRevision. batch takes changes to create/update/delete several items in one call, in input order. Each change commits independently; this is not an atomic transaction. Revision conflicts preserve that item and do not stop other changes. Read the returned current item and reconcile. An execution error stops the remaining changes: completed changes persist, the failing outcome is unconfirmed, and subsequent changes are not_attempted. Read the list before retrying an unconfirmed outcome.",
    parameters: {
      type: "object",
      properties: {
        ...changeProperties,
        operation: {
          type: "string",
          enum: ["list", "create", "update", "delete", "batch"],
        },
        changes: {
          type: "array",
          description:
            "For batch only. Ordered create/update/delete commands; each has its own result.",
          items: {
            type: "object",
            properties: changeProperties,
            required: ["operation"],
            additionalProperties: false,
          },
        },
      },
      required: ["operation"],
      additionalProperties: false,
    },
    async execute(raw, context) {
      if (!context?.admin || !context.userId || !context.conversationId)
        throw new Error("Authenticated conversation required");
      const scope = {
        admin: context.admin as TalentAdminClient,
        userId: context.userId,
      };
      // Validate the entire command before making any changes.
      const input = inputSchema.parse(raw);
      context.abortSignal?.throwIfAborted();
      if (input.operation === "list") {
        const items = await listCareerActionItems(scope);
        return {
          items,
          modelOutput: items.length
            ? items.map(formatCareerActionItem).join("\n\n")
            : "No current visible actions.",
        };
      }
      const changes = input.operation === "batch" ? input.changes : [input];
      const invocationId =
        context.resumeRequestId ?? context.userMessageId ?? context.toolCallId;
      if (
        changes.some((change) => change.operation === "create") &&
        !invocationId
      )
        throw new Error("Execution identity required");

      const executeChange = async (change: Change) => {
        context.abortSignal?.throwIfAborted();
        const id = change.operation === "create" ? null : change.id;
        let content = change.operation === "create" ? change.item : null;
        if (change.operation === "update") {
          const current = await readCareerActionItem({
            ...scope,
            id: change.id,
          });
          if (!current) return mutationResult("not_found", change.id, null);
          if (current.revision !== change.expectedRevision)
            return mutationResult("conflict", change.id, current);
          content = careerActionItemContentSchema.parse({
            ...current,
            ...change.item,
          });
        }
        context.abortSignal?.throwIfAborted();
        const { data, error } = await (scope.admin.rpc as any)(
          "manage_career_action_item",
          {
            p_user_id: scope.userId,
            p_conversation_id: context.conversationId,
            p_operation: change.operation,
            p_id: id,
            p_expected_revision:
              change.operation === "create" ? null : change.expectedRevision,
            p_item: content,
            p_creation_key:
              change.operation === "create"
                ? `${invocationId}:${createHash("sha256").update(JSON.stringify(content)).digest("hex")}`
                : null,
          }
        );
        if (error) throw error;
        const item =
          data.item && !data.item.deleted_at
            ? readCareerActionItemRow(data.item)
            : null;
        return mutationResult(data.status, data.id ?? id, item);
      };
      if (input.operation !== "batch") return executeChange(input);

      const results = [];
      let stopped = false;
      for (const [index, change] of changes.entries()) {
        const label = { index, operation: change.operation };
        if (stopped || context.abortSignal?.aborted) {
          stopped = true;
          results.push({
            ...label,
            ...mutationResult(
              "not_attempted",
              "id" in change ? change.id : null,
              null
            ),
          });
          continue;
        }
        try {
          results.push({ ...label, ...(await executeChange(change)) });
        } catch {
          stopped = true;
          results.push({
            ...label,
            ...mutationResult(
              "unconfirmed",
              "id" in change ? change.id : null,
              null
            ),
          });
        }
      }
      return {
        results,
        modelOutput: [
          "Batch results (independent commits):",
          ...results.map(
            (result) =>
              `${result.index + 1}. ${result.operation}: ${result.modelOutput}`
          ),
          stopped
            ? "Execution stopped. Earlier confirmed changes persist. Read the list before retrying any unconfirmed change; not_attempted changes did not run."
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    },
  },
};
