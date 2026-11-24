import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import type { TalentToolDefinition, TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";
import { profileToolContext } from "../profiles/tools";
import { resolveLinkedCompany } from "../companies/linked";
import { readExplorationSummary } from "./exploration";
import { formatNoteBody, formatNoteLine } from "./format";
import { conversationMailSources, listNotes, readNote, writeNote, type NoteKind } from "./store";

const str = { type: "string" };
const num = { type: "integer" };

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  execute: (input: any, context?: TalentToolExecutionContext) => Promise<unknown>
): TalentToolDefinition {
  return {
    name,
    description,
    parameters: { type: "object", properties, required, additionalProperties: false },
    channels: ["chat", "voice"],
    execute,
  };
}

const kindOf = (value: unknown): NoteKind | undefined => value === "think" || value === "work" ? value : undefined;
const text = (value: unknown) => typeof value === "string" ? value : undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A blank ID is an omitted one. Any other ID that is not a UUID names no record;
// say that instead of a uuid cast error.
const idOf = (value: unknown, label: string) => {
  const id = text(value)?.trim();
  if (!id) return undefined;
  if (!UUID.test(id)) throw new Error(`${label} ${id} is unavailable.`);
  return id;
};

export const CAREER_NOTE_TOOLS: Record<string, TalentToolDefinition> = {
  read_notes: tool(
    "read_notes",
    TOOL_DESCRIPTIONS.read_notes,
    {
      noteId: { ...str, description: "Read this note in full." },
      matchingId: { ...str, description: "List the notes linked to this matching." },
      company: { ...str, description: "List the notes linked to this company: name, official site, LinkedIn page or workspace ID." },
      kind: { type: "string", enum: ["think", "work"] },
      query: { ...str, description: "Words that appear in the title or text." },
      cursor: { ...str, description: "Exact nextCursor from the previous page." },
      limit: num,
    },
    [],
    async (i, c) => {
      const owner = profileToolContext(c, "read_notes", i, { readOnly: true });
      const noteId = idOf(i.noteId, "Note");
      if (noteId) {
        const note = await readNote(owner.admin, { userId: owner.userId, noteId });
        const exploration = note.kind === "work" && note.matchingId
          ? await readExplorationSummary(owner.admin, { userId: owner.userId, matchingId: note.matchingId }).catch(() => undefined)
          : undefined;
        return {
          ok: true, noteId: note.id, revision: note.revision,
          modelOutput: [formatNoteBody(note), exploration ? `Exploration of the linked matching, computed from records:\n${exploration}` : ""]
            .filter(Boolean).join("\n\n"),
        };
      }
      // Reading never adds a company to the shared directory.
      const company = text(i.company) ? await resolveLinkedCompany(owner.admin, i.company, { register: false }) : undefined;
      const page = await listNotes(owner.admin, {
        userId: owner.userId, matchingId: idOf(i.matchingId, "Matching"), companyWorkspaceId: company?.id,
        kind: kindOf(i.kind), query: text(i.query), cursor: text(i.cursor), limit: i.limit,
      });
      return {
        ok: true, total: page.total, nextCursor: page.nextCursor,
        modelOutput: [
          page.total ? `${page.total} notes match${page.notes.length < page.total ? `; ${page.notes.length} shown` : ""}, most recently edited first.` : "No notes match.",
          ...page.notes.map(formatNoteLine),
          page.nextCursor ? `Next: cursor ${page.nextCursor}.` : "",
        ].filter(Boolean).join("\n"),
      };
    }
  ),
  upsert_note: tool(
    "upsert_note",
    TOOL_DESCRIPTIONS.upsert_note,
    {
      action: { type: "string", enum: ["create", "update", "delete"] },
      noteId: str,
      expectedRevision: { ...num, description: "The revision the note was read at. Needed to replace the whole content or delete." },
      kind: { type: "string", enum: ["think", "work"] },
      title: str,
      content: { ...str, description: "create: the note's text. update: the whole new text, replacing the old (needs expectedRevision)." },
      append: { ...str, description: "update: text added after the current content." },
      replace: {
        type: "object",
        description: "update: replace one exact passage that appears once in the note.",
        properties: { old: str, new: str },
        required: ["old", "new"],
        additionalProperties: false,
      },
      matchingId: { ...str, description: "Link the note to this matching." },
      company: { ...str, description: "Link the note to this company: name, official site, LinkedIn page or workspace ID." },
    },
    ["action"],
    async (i, c) => {
      // supabase-js drops an undefined argument, which would hide this behind a missing-function error.
      if (!["create", "update", "delete"].includes(i.action)) throw new Error("action must be create, update or delete.");
      const owner = profileToolContext(c, "upsert_note", i);
      const noteId = idOf(i.noteId, "Note");
      const matchingId = idOf(i.matchingId, "Matching");
      const company = text(i.company) ? await resolveLinkedCompany(owner.admin, i.company) : undefined;
      const sourceRefs = i.action === "delete" ? [] : await conversationMailSources(owner.admin, {
        userId: owner.userId, conversationId: c?.conversationId,
      });
      const result = await writeNote(owner.admin, owner.userId, {
        action: i.action,
        noteId,
        expectedRevision: Number.isInteger(i.expectedRevision) ? i.expectedRevision : undefined,
        kind: kindOf(i.kind),
        title: text(i.title),
        content: text(i.content),
        append: text(i.append),
        replace: i.replace && typeof i.replace.old === "string" ? { old: i.replace.old, new: String(i.replace.new ?? "") } : undefined,
        matchingId,
        companyWorkspaceId: company?.id,
        sourceRefs,
      });
      if (result.deleted) return { ok: true, noteId: result.id, deleted: true, modelOutput: `Note ${result.id} deleted.` };
      const note = result.note;
      return {
        ok: true, noteId: note.id, revision: note.revision, matchingId: note.matchingId,
        modelOutput: [
          `Note ${note.id} ${i.action === "create" ? "created" : "updated"} · revision ${note.revision}.`,
          formatNoteLine(note).replace(/^- /, ""),
          company?.added ? `${company.name} was added to Harper's company directory.` : "",
        ].filter(Boolean).join("\n"),
      };
    }
  ),
};
