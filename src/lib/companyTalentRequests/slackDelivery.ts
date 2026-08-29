function text(value: unknown) {
  return String(value ?? "").trim();
}

export type CompanyTalentRelaySlackDestination =
  | { kind: "thread"; threadId: string }
  | { kind: "workspace" };

export function getCompanyTalentRelaySlackDestination(
  sourceSlackThreadId: unknown
): CompanyTalentRelaySlackDestination {
  const threadId = text(sourceSlackThreadId);
  return threadId ? { kind: "thread", threadId } : { kind: "workspace" };
}
