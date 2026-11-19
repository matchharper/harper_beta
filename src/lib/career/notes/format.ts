import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";
import type { Note, NoteSummary } from "./store";

const quote = (value: string) => `"${value.replace(/\s+/g, " ").trim()}"`;

function links(note: NoteSummary) {
  return [
    note.matchingId ? `matching ${note.matchingTitle ? `${quote(note.matchingTitle)} ` : ""}(${note.matchingId})` : "",
    note.companyWorkspaceId ? `company ${note.companyName ? `${quote(note.companyName)} ` : ""}(${note.companyWorkspaceId})` : "",
  ].filter(Boolean).join(" · ");
}

export function formatNoteLine(note: NoteSummary) {
  return [`- ${formatLlmDateTime(note.updatedAt)} · ${note.kind} · ${quote(note.title)}`, links(note), `note ${note.id}`]
    .filter(Boolean).join(" · ");
}

/** The index of notes every turn sees: why they exist, the latest ones, and how many there are. */
export function formatNoteIndex(args: { notes: NoteSummary[]; total: number }) {
  if (!args.total) {
    return "Your notes: none yet. A note records what you did and thought (work, think) so that later requests and scheduled runs do not redo it.";
  }
  return [
    `Your notes (${args.total}; ${args.notes.length} most recently edited, ${PROMPT_TIME_ZONE}). They record what was done so later requests and scheduled runs do not redo it.`,
    ...args.notes.map(formatNoteLine),
    args.total > args.notes.length ? "read_notes lists the rest." : "",
  ].filter(Boolean).join("\n");
}

export function formatNoteBody(note: Note, options: { links?: boolean } = {}) {
  const linked = options.links === false ? "" : links(note);
  return [
    `Note ${note.id} · ${note.kind} · ${quote(note.title)} · revision ${note.revision}`,
    `Created ${formatLlmDateTime(note.createdAt)} · last edited ${formatLlmDateTime(note.updatedAt)} (${PROMPT_TIME_ZONE})${linked ? ` · ${linked}` : ""}`,
    "",
    note.content.trim() || "(empty)",
  ].join("\n");
}

/** The work note of the matching this request continues, with what the records say was done. */
export function formatMatchingWorkNote(args: {
  matchingId: string;
  matchingTitle?: string | null;
  latest: Note | null;
  others: NoteSummary[];
  exploration?: string;
}) {
  const name = args.matchingTitle ? `${quote(args.matchingTitle)} (${args.matchingId})` : args.matchingId;
  return [
    args.latest
      ? `Work note for matching ${name}:\n${formatNoteBody(args.latest, { links: false })}`
      : `Matching ${name} has no work note yet.`,
    args.others.length ? `Earlier work notes for this matching:\n${args.others.map(formatNoteLine).join("\n")}` : "",
    args.exploration ? `Exploration so far, computed from records:\n${args.exploration}` : "",
  ].filter(Boolean).join("\n\n");
}
