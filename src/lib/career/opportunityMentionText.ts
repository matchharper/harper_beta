const OPPORTUNITY_MENTION_MARKER_PATTERN =
  /\n*\[\[HARPER_OPPORTUNITY_MENTIONS_V1:([^\]]+)\]\]/g;

export type CareerOpportunityMention = {
  label: string;
  roleId: string;
};

function normalizeSingleLine(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

export function normalizeCareerOpportunityMentions(
  value: unknown
): CareerOpportunityMention[] {
  if (!Array.isArray(value)) return [];

  const seenRoleIds = new Set<string>();
  return value.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = normalizeSingleLine(record.label, 240);
    const roleId = normalizeSingleLine(record.roleId, 160);
    if (
      !label ||
      !roleId ||
      !/^[\p{L}\p{N}._:-]+$/u.test(roleId) ||
      seenRoleIds.has(roleId)
    ) {
      return [];
    }
    seenRoleIds.add(roleId);
    return [{ label, roleId }];
  });
}

export function extractCareerOpportunityMentions(
  content: string
): CareerOpportunityMention[] {
  const mentions: CareerOpportunityMention[] = [];
  for (const match of content.matchAll(OPPORTUNITY_MENTION_MARKER_PATTERN)) {
    try {
      const parsed = JSON.parse(decodeURIComponent(match[1] ?? ""));
      mentions.push(...normalizeCareerOpportunityMentions(parsed));
    } catch {
      // Ignore malformed markers and keep the visible message usable.
    }
  }
  return normalizeCareerOpportunityMentions(mentions);
}

export function stripCareerOpportunityMentionMetadata(content: string) {
  let foundMarker = false;
  const visibleContent = content.replace(
    OPPORTUNITY_MENTION_MARKER_PATTERN,
    () => {
      foundMarker = true;
      return "";
    }
  );
  return foundMarker ? visibleContent.trimEnd() : content;
}

export function appendCareerOpportunityMentionMetadata(
  content: string,
  mentions: CareerOpportunityMention[]
) {
  const normalizedMentions = normalizeCareerOpportunityMentions(mentions);
  const visibleContent = stripCareerOpportunityMentionMetadata(content);
  if (normalizedMentions.length === 0) return visibleContent;
  const encoded = encodeURIComponent(JSON.stringify(normalizedMentions));
  return `${visibleContent}\n\n[[HARPER_OPPORTUNITY_MENTIONS_V1:${encoded}]]`;
}

export function formatCareerOpportunityMentionsForLlm(content: string) {
  const mentions = extractCareerOpportunityMentions(content);
  const visibleContent = stripCareerOpportunityMentionMetadata(content);
  if (mentions.length === 0) return visibleContent;

  const references = mentions
    .map(
      (mention) =>
        `- ${mention.label.replace(/[\r\n]+/g, " ")} (roleId: ${mention.roleId})`
    )
    .join("\n");
  return `${visibleContent}\n\n[User-selected opportunity references; internal IDs are not visible in the chat UI]\n${references}`;
}
