export const MAX_LIVE_SDP_OFFER_LENGTH = 200_000;

export function parseLiveSdpOffer(value: unknown) {
  if (typeof value !== "string") return null;
  if (!value.trim() || value.length > MAX_LIVE_SDP_OFFER_LENGTH) return null;

  // SDP is a line-oriented wire format. Preserve the browser-generated value,
  // including its final CRLF, instead of returning the trimmed validation copy.
  return value;
}
