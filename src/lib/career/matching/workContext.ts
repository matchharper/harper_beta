import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { CareerToolUseFact } from "../capabilities/decisions";
import { readCareerResourceValue } from "../promptReadCache.server";
import { readMatchingWorkNoteContext } from "../notes/context";
import { observedMatchingId } from "./focus";
import { readCareerMatchingIndexSnapshot } from "./store";

type Owner = { admin: TalentAdminClient; userId: string };

export function matchingIndexForTurn(owner: Owner) {
  return readCareerResourceValue(owner.userId, "matching-index", () => readCareerMatchingIndexSnapshot(owner));
}

type InputMessage = { role: string; payload?: unknown };

export function selectedMatchingForMessages(messages: readonly InputMessage[]) {
  const references = messages.map(message => {
    const id = (message.payload as { selectedMatchingId?: unknown } | null)?.selectedMatchingId;
    return message.role === "user" && typeof id === "string" ? id : undefined;
  });
  const ids = [...new Set(references.filter(id => id !== undefined))];
  return { ids, unambiguous: ids.length === 1 && !references.includes(undefined) ? ids[0] : undefined };
}

export function scheduledMatchingIds(events: readonly { targetRefs?: { matchingId?: unknown } }[]) {
  return [...new Set(events.flatMap(event => typeof event.targetRefs?.matchingId === "string" ? [event.targetRefs.matchingId] : []))];
}

/**
 * The matching this request works on, and for each matching it continues the
 * work note with that matching's exploration computed from records
 * (docs/career-agent-harness-ko.md 4.1). The block follows the conversation
 * because a note edit or a search within the request changes it.
 */
export async function prepareMatchingWorkContext(owner: Owner, scope: {
  selected: string[];
  acceptedMatchingId?: string;
  resumed?: readonly CareerToolUseFact[];
  previous?: readonly CareerToolUseFact[];
  allowConversationFallback: boolean;
}) {
  let explicitMatchingId = scope.acceptedMatchingId;
  // A resumed execution keeps working on the matching it last used.
  let focusMatchingId = scope.resumed?.findLast(fact => fact.successful && fact.matchingId)?.matchingId;
  let ids = scope.selected;
  let reason = "Selected matching for this request";
  if (!ids.length) {
    const prior = (scope.resumed ?? (scope.allowConversationFallback ? scope.previous : [])) ?? [];
    const used = [...new Set(prior.flatMap(fact => fact.successful && fact.matchingId ? [fact.matchingId] : []))];
    if (used.length === 1) {
      ids = used;
      reason = scope.resumed ? "Matching used earlier in this execution" : "Matching used in the preceding turn";
    } else if (!used.length && scope.allowConversationFallback) {
      const index = await matchingIndexForTurn(owner).catch(() => undefined);
      if (index?.soleMatchingId) {
        ids = [index.soleMatchingId];
        reason = "Only active matching on this account";
      }
    }
  }
  const readable = new Set<string>();
  const read = async (id: string) => {
    try {
      const text = await readMatchingWorkNoteContext(owner, id);
      readable.add(id);
      return text;
    } catch {
      readable.delete(id);
      return `The work note of matching ${id} could not be read. read_matching can check its current state.`;
    }
  };
  const pages = new Map(await Promise.all(ids.map(async id => [id, await read(id)] as const)));
  const work = createSearchWorkTally();
  const reasons = new Map(ids.map(id => [id, reason] as const));
  return {
    /** The matching this turn is working on: the selected one, or the one Harper last opened, created or targeted. */
    researchMatchingId: () => focusMatchingId ?? (explicitMatchingId && readable.has(explicitMatchingId) ? explicitMatchingId : undefined),
    blocks: () => [...[...pages].flatMap(([id, text]) => text ? [{
      key: "matching_work_note", text: `${reasons.get(id)}\n${text}`, cacheable: false, placement: "after_conversation" as const,
    }] : [])],
    // Delivered with a published recommendation, when the answer is written; the system prompt stays the same between steps.
    searchWorkSummary: () => work.block()[0]?.text,
    companiesRead: () => work.companiesRead,
    async observe(name: string, result: unknown, input?: Record<string, unknown>) {
      work.add(name, result, input ?? {});
      const used = observedMatchingId(name, result);
      if (used) focusMatchingId = used;
      const row = result as { workNoteMatchingId?: string; matchingId?: string | null } | null;
      // The tool result already carries this work note.
      if (name === "read_matching" && row?.workNoteMatchingId && pages.has(row.workNoteMatchingId)) pages.set(row.workNoteMatchingId, "");
      // An edited note, or a search that changed the exploration, refreshes the block.
      const changed = name === "upsert_note" ? row?.matchingId : name === "search_opportunities" ? focusMatchingId : undefined;
      if (changed && pages.has(changed) && (name === "upsert_note" || pages.get(changed))) pages.set(changed, await read(changed));
    },
    async newlySelected(messages: readonly { role: string; payload?: unknown }[]) {
      const selected = selectedMatchingForMessages(messages);
      if (messages.length) explicitMatchingId = selected.unambiguous;
      // A newly selected card changes what this turn is working on.
      if (selected.unambiguous) focusMatchingId = selected.unambiguous;
      if (selected.ids.length) {
        for (const id of pages.keys()) if (!selected.ids.includes(id)) pages.delete(id);
      }
      const newIds = selected.ids.filter(id => !pages.has(id));
      const additions = await Promise.all(newIds.map(async id => {
        const text = await read(id);
        // The current inbox input delivers this work note; a later edit will refresh it.
        pages.set(id, "");
        reasons.set(id, "Selected matching for this request");
        return text;
      }));
      return additions.join("\n\n");
    },
  };
}

type Row = Record<string, any>;
const asRow = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {});
const asList = (value: unknown): Row[] => (Array.isArray(value) ? value.map(asRow) : []);

/** Facts about the search done in this request, kept current so the answer can say what was actually examined. */
export function createSearchWorkTally() {
  const evaluated: number[] = [];
  const named = new Set<string>();
  const webQueries: string[] = [];
  // Each option counts once: an option is new to its matching only in the search that first evaluates it.
  let freshPostings = 0, freshCompanies = 0, unpooled = false;
  let pages = 0, roleReads = 0, companyReads = 0;
  /** Employers whose shared overview this request already showed. */
  const companiesRead = new Set<string>();
  return {
    companiesRead,
    add(name: string, result: unknown, input: Row) {
      const data = asRow(result);
      if (name === "search_opportunities" && (input.action ?? "search") === "search" && typeof data.evaluationCount === "number") {
        evaluated.push(data.evaluationCount);
        const ledger = asRow(data.ledger);
        if (typeof ledger.freshPostings === "number" && typeof ledger.freshCompanies === "number") {
          freshPostings += ledger.freshPostings; freshCompanies += ledger.freshCompanies;
        } else unpooled = true;
        for (const company of Array.isArray(input.named) ? input.named : []) if (typeof company === "string") named.add(company);
      }
      if (name === "read_companies") for (const company of asList(data.companies)) {
        if (typeof company.companyWorkspaceId === "string") companiesRead.add(company.companyWorkspaceId);
      }
      if (name === "web_search" && data.ok !== false) {
        const query = typeof input.query === "string" ? input.query : Array.isArray(input.queries) ? input.queries.join("; ") : "";
        if (query) webQueries.push(query);
      }
      if (name === "open_url") pages += asList(data.pages ?? [data]).filter(page => page.ok === true).length;
      if (name === "get_role_context") roleReads += asList(data.roles).filter(role => role.found === true).length;
      if (name === "read_companies") companyReads += asList(input.companies).length || 1;
    },
    block() {
      if (!evaluated.length && !webQueries.length && !pages && !roleReads) return [];
      const searches = `${evaluated.length} indexed opportunity search${evaluated.length > 1 ? "es" : ""}`;
      const parts = [
        evaluated.length && !unpooled
          ? `${searches} compared ${(freshPostings + freshCompanies).toLocaleString("en-US")} options this matching had not seen before (${freshPostings.toLocaleString("en-US")} postings · ${freshCompanies.toLocaleString("en-US")} companies), each counted once`
          : evaluated.length ? `${searches} evaluating ${evaluated.join(" + ")} roles and companies against this person's criteria (an option evaluated twice counts twice)` : "",
        named.size ? `employers checked by name: ${[...named].join(", ")}` : "",
        webQueries.length ? `${webQueries.length} web search${webQueries.length > 1 ? "es" : ""} (${webQueries.slice(0, 4).map(query => `"${query.slice(0, 80)}"`).join("; ")}${webQueries.length > 4 ? "; …" : ""})` : "",
        pages ? `${pages} pages read in full` : "",
        roleReads ? `${roleReads} role descriptions read` : "",
        companyReads ? `${companyReads} company reads` : "",
      ].filter(Boolean);
      return [{ key: "search_work_this_request", text: `Search work in this request so far: ${parts.join("; ")}.`, cacheable: false }];
    },
  };
}
