export type GmailCareerHistoryQueueMessage = {
  expectedIntegrationUpdatedAt: string;
  kind: "analyze_gmail_career_history";
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
  if (
    !UUID_PATTERN.test(talentId) ||
    !expectedIntegrationUpdatedAt ||
    Number.isNaN(new Date(expectedIntegrationUpdatedAt).getTime())
  ) {
    return null;
  }
  return {
    expectedIntegrationUpdatedAt,
    kind: "analyze_gmail_career_history",
    talentId,
    version: 1,
  };
}
