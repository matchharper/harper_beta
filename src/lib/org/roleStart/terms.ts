/**
 * Case-insensitive POSIX pattern for one spelling. Latin/digit edges must not
 * touch another Latin letter or digit, so "java" does not hit "javascript",
 * "sql" does not hit "mysql" and "rust" does not hit "trust". Hangul next to a
 * Latin name is allowed ("Kafka를"), and Hangul spellings match as written.
 */
export function termPattern(term: string) {
  const value = term.trim().toLowerCase();
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = /^[a-z0-9]/.test(value) ? "(^|[^a-z0-9])" : "";
  const end = /[a-z0-9]$/.test(value) ? "([^a-z0-9]|$)" : "";
  return `${start}${escaped}${end}`;
}
