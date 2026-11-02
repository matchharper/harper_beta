import { replaceAssistantUiMarkers } from "../forms/integrationMarker";

/** A rendering command, never authority to take control of a browser. */
export function extractBrowserMarkers(content: string) {
  const sessionIds = new Set<string>();
  const text = replaceAssistantUiMarkers(content, (part) => part.replace(
    /(?<!\\)\[\[browser:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/gi,
    (_, id: string) => { sessionIds.add(id.toLowerCase()); return ""; }
  ));
  return { content: text, sessionIds: [...sessionIds] };
}

export function latestBrowserRequest(messages: readonly { id: string | number; role: string; content: string }[]) {
  // History can be loaded above the conversation. Only the current assistant
  // turn may automatically expand a panel; older links remain clickable.
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user") break;
    if (message.role !== "assistant") continue;
    const ids = extractBrowserMarkers(message.content).sessionIds;
    if (ids.length) return { key: `${message.id}:${ids.at(-1)}`, sessionId: ids.at(-1)! };
  }
  return null;
}
