// The Gmail card shown while Harper reads an application form runs as a 50:50 test per person.
export const GMAIL_WAIT_OFFER_EXPERIMENT = "career_gmail_wait_offer_v1" as const;
export const GMAIL_WAIT_OFFER_EXPOSURE_EVENT = "career_gmail_wait_offer_exposed" as const;

/** A sees no card (as before), B sees it. */
export type GmailWaitOfferVariant = "no_card" | "card";

/** A fixed half per person, so the same person always lands on the same side. */
export function assignGmailWaitOfferVariant(userId: string): GmailWaitOfferVariant {
  const input = `${GMAIL_WAIT_OFFER_EXPERIMENT}:${userId.trim().toLowerCase()}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0 < 0x80000000 ? "no_card" : "card";
}

/** Written on the server each time a Gmail connection is confirmed against the live Google grant. */
export const GMAIL_CONNECTION_CONFIRMED_EVENT = "career_gmail_connection_confirmed" as const;
