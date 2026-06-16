const POSTGRES_UNSAFE_CONTROL_CHARS_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripPostgresUnsafeChars(value: string): string {
  return value.replace(POSTGRES_UNSAFE_CONTROL_CHARS_RE, "");
}

export function sanitizeSingleLineDbText(
  value: unknown,
  maxLength: number
): string | null {
  if (typeof value !== "string") return null;
  const normalized = stripPostgresUnsafeChars(value).replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

export function sanitizeMultilineDbText(
  value: unknown,
  maxLength: number
): string | null {
  if (typeof value !== "string") return null;
  const normalized = stripPostgresUnsafeChars(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}
