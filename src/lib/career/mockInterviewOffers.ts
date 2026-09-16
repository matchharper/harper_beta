import { isPostingRoleId, normalizePostingRoleId } from "./postingLinks";

export type MockInterviewOffer = {
  id: string;
  roleId: string;
  companyName: string;
  title: string;
};

const PREFIX = "[[MOCK_INTERVIEW:";

export function extractMockInterviewRoleIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(
    /\[\[MOCK_INTERVIEW:([^\]\r\n]*)\]\]/g
  )) {
    const id = normalizePostingRoleId(match[1]);
    if (isPostingRoleId(id)) ids.add(id);
  }
  return [...ids];
}

export function stripMockInterviewMarkers(content: string): string {
  let text = content.replace(/\[\[MOCK_INTERVIEW[^\]\r\n]*\]\]/g, "");
  const unfinished = text.indexOf("[[MOCK_INTERVIEW");
  if (unfinished >= 0) text = text.slice(0, unfinished);
  // Hide a marker prefix arriving over multiple streaming chunks.
  for (let length = PREFIX.length - 1; length >= 2; length--) {
    if (text.endsWith(PREFIX.slice(0, length))) {
      text = text.slice(0, -length);
      break;
    }
  }
  return text.trim();
}
