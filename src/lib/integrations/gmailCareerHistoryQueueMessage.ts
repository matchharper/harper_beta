export type GmailCareerHistoryQueueMessage = {
  expectedIntegrationUpdatedAt: string;
  kind: "analyze_gmail_career_history";
  runId: number | null;
  runStartedAt: string | null;
  talentId: string;
  version: 1;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .slice(0, maxLength);
}

export function parseGmailCareerHistoryQueueMessage(
  value: unknown
): GmailCareerHistoryQueueMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (
    message.kind !== "analyze_gmail_career_history" ||
    message.version !== 1
  ) {
    return null;
  }
  const talentId = clean(message.talentId, 100);
  const expectedIntegrationUpdatedAt = clean(
    message.expectedIntegrationUpdatedAt,
    100
  );
  const runId = Number(message.runId);
  const runStartedAt = clean(message.runStartedAt, 100);
  if (
    !UUID_PATTERN.test(talentId) ||
    !expectedIntegrationUpdatedAt ||
    Number.isNaN(new Date(expectedIntegrationUpdatedAt).getTime()) ||
    (message.runId !== undefined &&
      (!Number.isSafeInteger(runId) || runId <= 0)) ||
    (message.runStartedAt !== undefined &&
      (!runStartedAt || Number.isNaN(new Date(runStartedAt).getTime())))
  ) {
    return null;
  }
  return {
    expectedIntegrationUpdatedAt,
    kind: "analyze_gmail_career_history",
    runId: message.runId === undefined ? null : runId,
    runStartedAt: message.runStartedAt === undefined ? null : runStartedAt,
    talentId,
    version: 1,
  };
}
