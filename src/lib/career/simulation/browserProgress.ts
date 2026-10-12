import { z } from "zod";

export const browserProgressEntrySchema = z.object({
  id: z.string(),
  text: z.string().max(800),
  at: z.string(),
});
export type BrowserProgressEntry = z.infer<typeof browserProgressEntrySchema>;

/** Only public output text, never reasoning, shell commands, arguments or tool output. */
export function browserProgressFromEvent(event: Record<string, unknown>, at = new Date().toISOString()): BrowserProgressEntry | null {
  if (event.type !== "agent.session.turn.output_text.done" || typeof event.text !== "string") return null;
  const text = event.text.trim();
  const id = event.item_id ?? event.event_id;
  if (!text || typeof id !== "string") return null;
  return {id: `${id}:${event.content_index ?? 0}`, text: text.slice(0, 800), at};
}

export function appendBrowserProgress(entries: BrowserProgressEntry[], entry: BrowserProgressEntry): BrowserProgressEntry[] {
  // Completed parts are immutable. Stream replay must not append or rewind them.
  if (entries.some(e => e.id === entry.id)) return entries;
  return [...entries, entry].slice(-40);
}
