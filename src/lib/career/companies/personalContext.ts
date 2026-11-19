import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;
const day = (value: unknown) => formatLlmDateTime(value).slice(0, 10);

export type CompanyPersonalContext = {
  memories: { ref: number; content: string; updatedAt: string }[];
  reactions: { feedback: string; reason: string | null; title: string; at: string }[];
  notes: { id: string; kind: string; title: string; updatedAt: string }[];
};

/**
 * What this person told Harper about each company, how they reacted to its
 * opportunities, and Harper's notes about it. Only this person's Career input
 * carries it; company-side readers never call this (docs/career-agent-harness-ko.md 4.2).
 */
export async function readCompanyPersonalContext(admin: TalentAdminClient, userId: string, companyIds: readonly string[]) {
  const ids = [...new Set(companyIds.filter((id): id is string => typeof id === "string" && Boolean(id)))];
  const result = new Map<string, CompanyPersonalContext>();
  if (!ids.length) return result;
  const entry = (id: string) => {
    let value = result.get(id);
    if (!value) result.set(id, value = { memories: [], reactions: [], notes: [] });
    return value;
  };
  const [memories, notes, recommendations] = await Promise.all([
    db(admin, "talent_contexts").select("ref,content,updated_at,company_workspace_id")
      .eq("talent_id", userId).eq("collection", "memory").is("deleted_at", null).in("company_workspace_id", ids),
    db(admin, "talent_notes").select("id,kind,title,updated_at,company_workspace_id")
      .eq("talent_id", userId).in("company_workspace_id", ids).order("updated_at", { ascending: false }),
    db(admin, "talent_opportunity_recommendation").select("role_id,company_workspace_id,feedback,feedback_reason,updated_at")
      .eq("talent_id", userId).not("feedback", "is", null),
  ]);
  for (const row of (memories.data ?? []) as Row[])
    entry(row.company_workspace_id).memories.push({ ref: Number(row.ref), content: String(row.content ?? ""), updatedAt: row.updated_at });
  for (const row of (notes.data ?? []) as Row[])
    entry(row.company_workspace_id).notes.push({ id: row.id, kind: row.kind, title: row.title, updatedAt: row.updated_at });
  const reacted: Row[] = recommendations.data ?? [];
  const roleIds = [...new Set(reacted.flatMap(row => row.role_id ? [row.role_id] : []))];
  const roles: Row[] = roleIds.length
    ? (await db(admin, "company_roles").select("role_id,name,company_workspace_id").in("role_id", roleIds)).data ?? []
    : [];
  const roleOf = new Map(roles.map(role => [role.role_id, role]));
  for (const row of reacted) {
    const role = row.role_id ? roleOf.get(row.role_id) : undefined;
    const companyId = role?.company_workspace_id ?? row.company_workspace_id;
    if (!companyId || !ids.includes(companyId)) continue;
    entry(companyId).reactions.push({
      feedback: String(row.feedback), reason: row.feedback_reason ? String(row.feedback_reason) : null,
      title: role?.name ? String(role.name) : "the company itself", at: row.updated_at,
    });
  }
  return result;
}

/**
 * This person's history with a company, dated, without a label. The agent that
 * wrote the notes can open them; an evaluator only learns they exist.
 */
export function companyPersonalFacts(context: CompanyPersonalContext | undefined, reader: "agent" | "evaluator" = "agent") {
  if (!context) return "";
  return [
    ...context.memories.map(memory => `Memory [${memory.ref}] ${day(memory.updatedAt)}: ${memory.content}`),
    ...context.reactions.map(reaction =>
      `reacted ${reaction.feedback} to ${reaction.title} ${day(reaction.at)}${reaction.reason ? ` (${reaction.reason})` : ""}`),
    ...context.notes.map(note => reader === "agent"
      ? `your ${note.kind} note "${note.title}" ${day(note.updatedAt)} (note ${note.id})`
      : `Harper's ${note.kind} note "${note.title}" ${day(note.updatedAt)}`),
  ].join("; ");
}

/** One line of this person's history with a company, dated, for search rows, company reads and evaluations. */
export function formatCompanyPersonalContext(context: CompanyPersonalContext | undefined, reader: "agent" | "evaluator" = "agent") {
  const facts = companyPersonalFacts(context, reader);
  return facts ? `This person and the company: ${facts}` : "";
}
