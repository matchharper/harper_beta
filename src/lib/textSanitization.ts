const POSTGRES_UNSAFE_CONTROL_CHARS_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function safeSlice(value: string, maxLength: number): string {
  const sliced = value.slice(0, Math.max(0, maxLength));
  const lastCodeUnit = sliced.charCodeAt(sliced.length - 1);
  return lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff
    ? sliced.slice(0, -1)
    : sliced;
}

export function stripPostgresUnsafeChars(value: string): string {
  return value.replace(POSTGRES_UNSAFE_CONTROL_CHARS_RE, "");
}

export function sanitizeSingleLineDbText(
  value: unknown,
  maxLength: number
): string | null {
  if (typeof value !== "string") return null;
  const normalized = stripPostgresUnsafeChars(value)
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return safeSlice(normalized, maxLength);
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
  return safeSlice(normalized, maxLength);
}
