/** Exact document editing, not semantic interpretation or output filtering. */
export function applyRoleTextEdits(
  current: { description: string | null; request: string | null },
  input: Record<string, unknown>
): Record<string, unknown> {
  const { textEdits, ...fields } = input;
  if (textEdits === undefined) return fields;
  if (!Array.isArray(textEdits) || textEdits.length < 1 || textEdits.length > 12)
    throw new Error("textEdits must contain 1–12 exact replacements");
  for (const raw of textEdits) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Each text edit must be an object");
    const edit = raw as Record<string, unknown>;
    if (Object.keys(edit).some(key => !["field", "before", "after"].includes(key)) ||
        (edit.field !== "description" && edit.field !== "request") ||
        typeof edit.before !== "string" || edit.before.length === 0 ||
        typeof edit.after !== "string")
      throw new Error("Each text edit requires field, nonempty before, and after");
    if (Object.prototype.hasOwnProperty.call(input, edit.field))
      throw new Error("Do not combine a full field replacement with textEdits for that field");
    const value = (fields[edit.field] ?? current[edit.field]) as string | null;
    const index = value?.indexOf(edit.before) ?? -1;
    if (index < 0 || value!.indexOf(edit.before, index + 1) !== -1)
      throw new Error("The exact before text must occur once in the saved field; inspect currentSavedRole and retry");
    fields[edit.field] = value!.slice(0, index) + edit.after + value!.slice(index + edit.before.length);
  }
  return fields;
}
