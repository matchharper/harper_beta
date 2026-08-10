import type { OrgAgentMention } from "@/lib/org/agent/types";

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveOrgAgentDraftMentions(
  draft: string,
  mentions: OrgAgentMention[]
) {
  let serializedText = draft;
  const resolvedMentions = mentions.filter((mention) =>
    serializedText.includes(`@${mention.displayName}`)
  );

  for (const mention of resolvedMentions) {
    const pattern = new RegExp(
      `@${escapeRegExp(mention.displayName)}(?![\\p{L}\\p{N}_])`,
      "u"
    );
    serializedText = serializedText.replace(
      pattern,
      `@[${mention.displayName}](talent:${mention.talentId})`
    );
  }

  return {
    mentions: resolvedMentions,
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
      text: `@${match[1]}`,
    });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ kind: "text", text: content.slice(lastIndex) });
  }

  return segments;
}
