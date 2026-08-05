export const ORG_INTRO_CAPTURE_DISCLOSURE = "";

export function appendOrgIntroCaptureDisclosure(body: string) {
  const normalized = body.trim();
  if (!ORG_INTRO_CAPTURE_DISCLOSURE) return normalized;
  if (normalized.includes(ORG_INTRO_CAPTURE_DISCLOSURE)) return normalized;
  return `${normalized}\n\n${ORG_INTRO_CAPTURE_DISCLOSURE}`;
}
