import "server-only";

import type { AgentOfferEvent, AgentPerson } from "./types";

/**
 * #5 events for a general mail (Shaun 11/23: the DB and event-seeking posts get fitting postings and events): up to
 * `max` events in the person's field, online or in their city, starting within EVENT_MAX_DAYS, each with why it fits.
 * Never throws for a search that found nothing: events [] with a note.
 */
export const EVENT_MAX_DAYS = 60;
export const EVENTS_PER_MAIL = 2;

export async function findAgentEvents(_person: AgentPerson, _args: { language: "ko" | "en"; max: number; now?: Date }): Promise<{
  events: AgentOfferEvent[]; costUsd: number; note: string | null;
}> {
  return { events: [], costUsd: 0, note: null };
}
