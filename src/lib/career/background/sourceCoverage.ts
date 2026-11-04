/** Receipt coverage belongs to this invocation; it is not inferred from prose. */
export function careerContactSourceIds(
  run: { trigger_payload?: Record<string, any> },
  input: unknown
): string[] {
  const available = new Set<string>(
    (run.trigger_payload?.sourceEvents ?? []).flatMap((s: any) =>
      s.dailySourceId ? [s.dailySourceId] : []
    )
  );
  if (input === undefined && available.size)
    throw new Error(
      "Include sourceIds for the pending updates actually covered by this message, or [] when none are covered. These IDs are needed for delivery receipts."
    );
  if (input === undefined) return [];
  if (
    !Array.isArray(input) ||
    input.some((id) => typeof id !== "string" || !available.has(id))
  )
    throw new Error(
      "sourceIds must refer to pending sources in this invocation."
    );
  return [...new Set(input)];
}
