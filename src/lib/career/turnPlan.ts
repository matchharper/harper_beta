import { z } from "zod";
import type { TalentToolDefinition } from "@/lib/talentOnboarding/tools";

export const CAREER_TURN_PLAN_STATUSES = ["pending", "in_progress", "done"] as const;
export type CareerTurnPlanStatus = (typeof CAREER_TURN_PLAN_STATUSES)[number];
export type CareerTurnPlanItem = { id: string; text: string; status: CareerTurnPlanStatus };

/** The checklist lives only for one reply. The executor owns where it is kept. */
export type CareerTurnPlanStore = {
  read(): CareerTurnPlanItem[];
  write(items: CareerTurnPlanItem[]): void;
};

const itemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  status: z.enum(CAREER_TURN_PLAN_STATUSES),
});

export function readCareerTurnPlan(value: unknown): CareerTurnPlanItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap(entry => {
    const parsed = itemSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

const changeSchema = z.object({
  id: z.string().optional(),
  text: z.string().optional(),
  status: z.enum(CAREER_TURN_PLAN_STATUSES).optional(),
  delete: z.boolean().optional(),
});
const inputSchema = z.object({ changes: z.array(changeSchema) });

export function applyCareerTurnPlanChanges(current: CareerTurnPlanItem[], raw: unknown) {
  const { changes } = inputSchema.parse(raw);
  let items = [...current];
  let nextId = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const problems: string[] = [];
  for (const change of changes) {
    const text = change.text?.replace(/\s+/g, " ").trim();
    if (!change.id) {
      if (change.delete) { problems.push("Removing an item needs its id; nothing was removed."); continue; }
      if (!text) { problems.push("A new item needs text; it was not added."); continue; }
      items.push({ id: String(nextId++), text, status: change.status ?? "pending" });
      continue;
    }
    const index = items.findIndex(item => item.id === change.id);
    if (index < 0) { problems.push(`Item ${change.id} does not exist; that change was not applied.`); continue; }
    if (change.delete) { items = items.filter(item => item.id !== change.id); continue; }
    items[index] = { ...items[index], ...(text ? { text } : {}), ...(change.status ? { status: change.status } : {}) };
  }
  const list = items.length
    ? items.map(item => `${item.id}. [${item.status}] ${item.text}`).join("\n")
    : "The checklist is empty and hidden.";
  return { items, modelOutput: [...problems, "Current checklist:", list].join("\n") };
}

export const UPSERT_PLAN_TOOL_NAME = "upsert_plan";

export const CAREER_TURN_PLAN_TOOLS: Record<string, TalentToolDefinition> = {
  [UPSERT_PLAN_TOOL_NAME]: {
    name: UPSERT_PLAN_TOOL_NAME,
    channels: ["chat"],
    description:
      "Show the user a checklist of the steps in your current reply so they can follow progress while you work. Start one only when the reply is likely to take a while or has three or more steps; a quick or short reply needs none. It belongs to this reply only and does not carry into later replies; after the reply ends it stays visible with each item's last status. Each change without id adds an item (text required; status defaults to pending). A change with id updates that item's text and/or status, or removes it with delete: true. Changes apply in order. The result lists the current checklist with ids. This only changes the display; it does not run or schedule any work.",
    parameters: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Existing item id. Omit to add a new item." },
              text: { type: "string", description: "A short, plain step the user reads." },
              status: { type: "string", enum: [...CAREER_TURN_PLAN_STATUSES] },
              delete: { type: "boolean" },
            },
            additionalProperties: false,
          },
        },
      },
      required: ["changes"],
      additionalProperties: false,
    },
    async execute(input, context) {
      const store = context?.turnPlan;
      if (!store) throw new Error("A reply checklist is only available while Harper is replying in chat.");
      const result = applyCareerTurnPlanChanges(store.read(), input);
      store.write(result.items);
      return { modelOutput: result.modelOutput };
    },
  },
};
