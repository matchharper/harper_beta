const MEETING_INVITATION_URL_PATTERN =
  /https?:\/\/[^\s)>]+\/meeting\/([A-Za-z0-9_-]{20,200})/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function extractMeetingInvitationPathFromQueuePayload(value: unknown) {
  const body =
    isRecord(value) && typeof value.body === "string" ? value.body : "";
  const token = body
    .slice(0, 10_000)
    .match(MEETING_INVITATION_URL_PATTERN)?.[1];
  return token ? `/meeting/${token}` : null;
}
