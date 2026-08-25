import type { OrgAgentMention } from "@/lib/org/agent/types";
import type { ChatComposerToken } from "@/lib/chat/composerTokens";

const SERIALIZED_MENTION_PATTERN = /@\[([^\]]+)\]\(talent:([^)]+)\)/g;

export type OrgAgentMentionTextSegment =
  | {
      displayName: string;
      kind: "mention";
      talentId: string;
      text: string;
    }
  | {
      kind: "text";
      text: string;
    };

function isMentionWordCharacter(value: string | undefined) {
  return Boolean(value && /[\p{L}\p{N}_]/u.test(value));
}

export function resolveOrgAgentDraftMentions(
  draft: string,
  mentions: OrgAgentMention[]
) {
  const mentionIndicesByName = new Map<string, number[]>();
  mentions.forEach((mention, index) => {
    if (!mention.displayName) return;
    const indices = mentionIndicesByName.get(mention.displayName) ?? [];
    indices.push(index);
    mentionIndicesByName.set(mention.displayName, indices);
  });

  const placements: Array<{
    end: number;
    mentionIndex: number;
    start: number;
  }> = [];
  const overlapsPlacement = (start: number, end: number) =>
    placements.some(
      (placement) => start < placement.end && end > placement.start
    );

  for (const [displayName, mentionIndices] of [
    ...mentionIndicesByName.entries(),
  ].sort(([left], [right]) => right.length - left.length)) {
    let searchStart = 0;
    let mentionOffset = 0;
    while (mentionOffset < mentionIndices.length) {
      const start = draft.indexOf(displayName, searchStart);
      if (start < 0) break;
      const end = start + displayName.length;
      searchStart = end;
      if (
        isMentionWordCharacter(draft[start - 1]) ||
        isMentionWordCharacter(draft[end]) ||
        overlapsPlacement(start, end)
      ) {
        continue;
      }
      placements.push({
        end,
        mentionIndex: mentionIndices[mentionOffset] as number,
        start,
      });
      mentionOffset += 1;
    }
  }

  placements.sort((left, right) => left.start - right.start);
  const resolvedMentionIndices = new Set(
    placements.map((placement) => placement.mentionIndex)
  );
  let serializedText = "";
  let previousEnd = 0;
  for (const placement of placements) {
    const mention = mentions[placement.mentionIndex];
    if (!mention) continue;
    serializedText += draft.slice(previousEnd, placement.start);
    serializedText += `@[${mention.displayName}](talent:${mention.talentId})`;
    previousEnd = placement.end;
  }
  serializedText += draft.slice(previousEnd);

  return {
    mentions: mentions.filter((_, index) => resolvedMentionIndices.has(index)),
    serializedText,
  };
}

export function serializeOrgAgentDraftMentions(
  draft: string,
  mentions: OrgAgentMention[]
) {
  const resolved = resolveOrgAgentDraftMentions(draft, mentions);
  return {
    mentions: resolved.mentions,
    text: resolved.serializedText.trim(),
  };
}

export function serializeOrgAgentDraftMentionTokens(
  draft: string,
  tokens: ChatComposerToken<OrgAgentMention>[]
) {
  let text = "";
  let previousEnd = 0;
  const mentions: OrgAgentMention[] = [];
  const seenTalentIds = new Set<string>();

  for (const token of [...tokens].sort(
    (left, right) => left.start - right.start
  )) {
    if (
      token.start < previousEnd ||
      token.end > draft.length ||
      draft.slice(token.start, token.end) !== token.text
    ) {
      continue;
    }
    text += draft.slice(previousEnd, token.start);
    text += `@[${token.data.displayName}](talent:${token.data.talentId})`;
    previousEnd = token.end;
    if (!seenTalentIds.has(token.data.talentId)) {
      seenTalentIds.add(token.data.talentId);
      mentions.push(token.data);
    }
  }
  text += draft.slice(previousEnd);

  return { mentions, text: text.trim() };
}

export function splitOrgAgentMentionText(
  content: string
): OrgAgentMentionTextSegment[] {
  const segments: OrgAgentMentionTextSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(SERIALIZED_MENTION_PATTERN)) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      segments.push({
        kind: "text",
        text: content.slice(lastIndex, matchIndex),
      });
    }
    segments.push({
      displayName: match[1],
      kind: "mention",
      talentId: match[2],
      text: match[1],
    });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ kind: "text", text: content.slice(lastIndex) });
  }

  return segments;
}
