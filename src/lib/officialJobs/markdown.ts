const NON_BREAKING_SPACE_PATTERN = /[\u00a0\u202f]/g;

export function normalizeOfficialJobMarkdown(value: unknown) {
  return String(value ?? "")
    .replace(NON_BREAKING_SPACE_PATTERN, " ")
    .trim();
}
