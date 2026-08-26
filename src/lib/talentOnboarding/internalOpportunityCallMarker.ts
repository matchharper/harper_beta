export type InternalOpportunityCallRequestMarkerPayload = {
  callId: string;
  companyName: string;
  resumePromptNeeded?: boolean;
  roleTitle: string;
};

const INTERNAL_CALL_REQUEST_MARKER_PREFIX =
  "[[INTERNAL_OPPORTUNITY_CALL_REQUEST:";
const INTERNAL_CALL_REQUEST_MARKER_SUFFIX = "]]";
const REENGAGEMENT_CALL_LINK_PATTERN = /\[call\]\(callId:[^)]+\)/gi;

export function buildInternalOpportunityCallRequestMarker(
  payload: InternalOpportunityCallRequestMarkerPayload
) {
  return `${INTERNAL_CALL_REQUEST_MARKER_PREFIX}${encodeURIComponent(
    JSON.stringify(payload)
  )}${INTERNAL_CALL_REQUEST_MARKER_SUFFIX}`;
}

export function replaceReengagementCallLinkWithCardMarker(args: {
  content: string;
  payload: InternalOpportunityCallRequestMarkerPayload;
}) {
  const visibleContent = args.content
    .replace(REENGAGEMENT_CALL_LINK_PATTERN, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  const marker = buildInternalOpportunityCallRequestMarker(args.payload);
  return visibleContent ? `${visibleContent}\n\n${marker}` : marker;
}
