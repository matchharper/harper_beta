// Existing Worker copy is preserved verbatim for fixed lifecycle messages.
import catalog from "./copy.json";
export function emailCopy(
  key: keyof typeof catalog,
  locale: string,
  values: Record<string, unknown> = {}
) {
  const text = catalog[key][locale.startsWith("en") ? "en" : "ko"];
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, field: string) => {
    if (!(field in values))
      throw new Error(`Missing email copy parameter: ${field}`);
    return String(values[field]);
  });
}
