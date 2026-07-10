export const POSTING_LINK_LABEL = "posting";
export const POSTING_OPPORTUNITY_ID_PREFIX = "posting:";

const POSTING_LINK_PATTERN = /\[posting\]\(([^)\s]+)\)/gi;
const STANDALONE_POSTING_LINK_LINE_PATTERN =
  /^\s*(?:[-*+]\s+|\d+[.)]\s*)?\[posting\]\([^)]+\)\s*$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizePostingRoleId(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}

export function isPostingRoleId(value: unknown) {
  return UUID_PATTERN.test(normalizePostingRoleId(value));
}

export function extractPostingRoleIdsFromText(content: string) {
  const roleIds: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null = null;

  POSTING_LINK_PATTERN.lastIndex = 0;
  while ((match = POSTING_LINK_PATTERN.exec(content)) !== null) {
    const roleId = normalizePostingRoleId(match[1]);
    if (!roleId || !isPostingRoleId(roleId) || seen.has(roleId)) continue;
    seen.add(roleId);
    roleIds.push(roleId);
  }

  return roleIds;
}

export function normalizePostingRoleIds(values: readonly unknown[]) {
  const roleIds: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const roleId = normalizePostingRoleId(value);
    if (!roleId || !isPostingRoleId(roleId) || seen.has(roleId)) continue;
    seen.add(roleId);
    roleIds.push(roleId);
  }

  return roleIds;
}

export function ensureStandalonePostingLinksInText(
  content: string,
  roleIds: readonly unknown[]
) {
  const normalizedRoleIds = normalizePostingRoleIds(roleIds);
  if (normalizedRoleIds.length === 0) return content;

  const existingRoleIds = new Set(extractPostingRoleIdsFromText(content));
  const missingRoleIds = normalizedRoleIds.filter(
    (roleId) => !existingRoleIds.has(roleId)
  );
  if (missingRoleIds.length === 0) return content;

  const postingLinks = missingRoleIds
    .map((roleId) => `[posting](${roleId})`)
    .join("\n");

  return [content.trimEnd(), postingLinks].filter(Boolean).join("\n\n");
}

export function toPostingOpportunityId(roleId: string) {
  return `${POSTING_OPPORTUNITY_ID_PREFIX}${roleId}`;
}

export function getPostingRoleIdFromOpportunityId(opportunityId: string) {
  const id = String(opportunityId ?? "").trim();
  if (!id.startsWith(POSTING_OPPORTUNITY_ID_PREFIX)) return "";
  const roleId = normalizePostingRoleId(
    id.slice(POSTING_OPPORTUNITY_ID_PREFIX.length)
  );
  return isPostingRoleId(roleId) ? roleId : "";
}

export function stripStandalonePostingLinksFromText(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => !STANDALONE_POSTING_LINK_LINE_PATTERN.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
