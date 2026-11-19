import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { TalentContextAgentChange, TalentContextRow } from "@/lib/talentOnboarding/talentContexts";
import { resolveLinkedCompany } from "./linked";

type MemoryCompanyLink = { index: number; companyWorkspaceId: string | null; label: string | null };

/**
 * Resolve the companies named for Memory rows before anything is written, so an
 * unknown or ambiguous company fails the whole change instead of half of it.
 */
export async function prepareMemoryCompanyLinks(args: {
  admin: TalentAdminClient;
  rawChanges: unknown[];
  changes: TalentContextAgentChange[];
  referencedRows: TalentContextRow[];
}): Promise<MemoryCompanyLink[]> {
  const links: MemoryCompanyLink[] = [];
  for (const [index, change] of args.changes.entries()) {
    const raw = args.rawChanges[index] as Record<string, unknown> | null;
    if (!raw || typeof raw.company !== "string") continue;
    const memory = change.op === "add" ? change.collection === "memory"
      : change.op === "update" && args.referencedRows.find(row => row.ref === Number(change.ref))?.collection === "memory";
    if (!memory) throw new Error("company links a Memory row to a company; Brief rows and deletions do not take it.");
    const company = raw.company.trim() ? await resolveLinkedCompany(args.admin, raw.company) : null;
    links.push({ index, companyWorkspaceId: company?.id ?? null, label: company ? `${company.name} (${company.id})` : null });
  }
  return links;
}

/** Point each written Memory row at its company. */
export async function applyMemoryCompanyLinks(args: {
  admin: TalentAdminClient;
  userId: string;
  links: MemoryCompanyLink[];
  changes: TalentContextAgentChange[];
  referencedRows: TalentContextRow[];
  rows: TalentContextRow[];
}) {
  const used = new Set<number>();
  const linked: Array<{ ref: number; company: string | null }> = [];
  for (const link of args.links) {
    const change = args.changes[link.index];
    const row = change.op === "update"
      ? args.referencedRows.find(candidate => candidate.ref === Number(change.ref))
      : change.op === "add"
        ? args.rows.find(candidate => !used.has(candidate.id) && candidate.collection === "memory"
          && candidate.content.trim() === String(change.content ?? "").trim())
        : undefined;
    if (!row) continue;
    used.add(row.id);
    const { error } = await (args.admin.from("talent_contexts" as never) as any)
      .update({ company_workspace_id: link.companyWorkspaceId }).eq("id", row.id).eq("talent_id", args.userId);
    if (error) throw new Error(error.message);
    linked.push({ ref: row.ref, company: link.label });
  }
  return linked;
}
