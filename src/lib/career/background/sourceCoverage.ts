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
  if (input === undefined) return [];
  if (
    !Array.isArray(input) ||
    input.some((id) => typeof id !== "string" || !available.has(id))
  )
    throw new Error(
      available.size
        ? "sourceIds must use the delivery entries for pending daily updates in this invocation."
        : "This invocation has no pending daily updates. Omit sourceIds or pass []."
    );
  return [...new Set(input)];
}
