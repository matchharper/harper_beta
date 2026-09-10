const MAX_PROFILE_CHANGE_TEXT_LENGTH = 600;
const MAX_PROFILE_CHANGE_HANDOFF_LENGTH = 2400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactValue(value: unknown) {
  if (value === null || value === "") return "(cleared)";
  if (typeof value !== "string") return null;

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "(cleared)";
  if (normalized.length <= MAX_PROFILE_CHANGE_TEXT_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_PROFILE_CHANGE_TEXT_LENGTH - 1).trimEnd()}…`;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getRowMemoInputs(input: Record<string, unknown>) {
  const rowMemos = input.rowMemos;
  if (Array.isArray(rowMemos)) return rowMemos;
  if (!isRecord(rowMemos)) return [];

  return [
    ...(Array.isArray(rowMemos.experiences) ? rowMemos.experiences : []),
    ...(Array.isArray(rowMemos.educations) ? rowMemos.educations : []),
    ...(Array.isArray(rowMemos.extras) ? rowMemos.extras : []),
  ];
}

/**
 * Produces the small, factual handoff from a successful profile tool call to
 * the onboarding extractor. It deliberately uses only fields the tool reports
 * as applied; the full profile is not re-read or repeated here.
 */
export function buildSavedProfileChangesForExtractor(args: {
  input: Record<string, unknown>;
  result: unknown;
}) {
  if (!isRecord(args.result) || args.result.ok !== true) return "";

  const lines: string[] = [];
  const talentUser = isRecord(args.input.talentUser)
    ? args.input.talentUser
    : null;
  for (const field of stringArray(args.result.updatedTalentUserFields)) {
    if (
      !talentUser ||
      (field !== "bio" && field !== "location") ||
      !Object.prototype.hasOwnProperty.call(talentUser, field)
    ) {
      continue;
    }
    const value = compactValue(talentUser[field]);
    if (value !== null) lines.push(`- Profile ${field}: ${value}`);
  }

  const updatedLinks = isRecord(args.result.updatedProfileLinks)
    ? args.result.updatedProfileLinks
    : null;
  for (const url of stringArray(updatedLinks?.added)) {
    lines.push(`- Profile link added: ${url}`);
  }
  for (const url of stringArray(updatedLinks?.deleted)) {
    lines.push(`- Profile link deleted: ${url}`);
  }

  const updatedRowMemos = isRecord(args.result.updatedRowMemos)
    ? args.result.updatedRowMemos
    : null;
  const successfulRowIds = {
    education: new Set(stringArray(updatedRowMemos?.educations)),
    experience: new Set(stringArray(updatedRowMemos?.experiences)),
    extra: new Set(stringArray(updatedRowMemos?.extras)),
  };
  for (const rawMemo of getRowMemoInputs(args.input)) {
    if (!isRecord(rawMemo)) continue;
    const type = rawMemo.type;
    const rowId = rawMemo.rowId;
    if (
      (type !== "experience" && type !== "education" && type !== "extra") ||
      typeof rowId !== "string" ||
      !successfulRowIds[type].has(rowId)
    ) {
      continue;
    }
    const memo = compactValue(rawMemo.memo);
    if (memo !== null) lines.push(`- ${type} profile memo: ${memo}`);
  }

  const handoff = lines.join("\n");
  if (handoff.length <= MAX_PROFILE_CHANGE_HANDOFF_LENGTH) return handoff;
  return `${handoff
    .slice(0, MAX_PROFILE_CHANGE_HANDOFF_LENGTH - 1)
    .trimEnd()}…`;
}
