/** Public event facts only: never expose bundled candidate messages or provider errors. */
export type CompanyFollowupProgress = {
  eventType: string | null;
  sourceKind: string | null;
  dueAt: string | null;
  previousDueAt: string | null;
  reason: string | null;
};

export function getCompanyFollowupProgress(
  kind: string,
  metadata: unknown
): CompanyFollowupProgress | undefined {
  if (kind !== "company_followup") return undefined;
  const record =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const text = (key: string) =>
    typeof record[key] === "string" ? (record[key] as string) : null;
  return {
    eventType: text("eventType"),
    sourceKind: text("sourceKind"),
    dueAt: text("dueAt"),
    previousDueAt: text("previousDueAt"),
    reason:
      text("reason") === "source_unavailable" ? "source_unavailable" : null,
  };
}
