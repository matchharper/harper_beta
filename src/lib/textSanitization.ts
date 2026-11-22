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
  // JSON/Postgres reject NUL and unpaired UTF-16 surrogates. Preserve valid
  // pairs, including emoji, while removing only unrepresentable code units.
  return value
    .replace(POSTGRES_UNSAFE_CONTROL_CHARS_RE, "")
    .replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      ""
    );
}

/** The same cleaning for a JSON value saved to jsonb, in every string and key (#95: a Career
 * checkpoint or tool receipt quoting a page or file). Returns a JSON copy; the input is not changed. */
export function stripPostgresUnsafeCharsDeep<T>(value: T): T {
  const text = JSON.stringify(value);
  if (text === undefined) return value;
  return JSON.parse(text, (_key, entry) => {
    if (typeof entry === "string") return stripPostgresUnsafeChars(entry);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const keys = Object.keys(entry);
    return keys.every(key => stripPostgresUnsafeChars(key) === key) ? entry
      : Object.fromEntries(keys.map(key => [stripPostgresUnsafeChars(key), entry[key]]));
  });
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
