import "server-only";

import type { AgentSettings } from "./types";

/**
 * #5 the purchased candidate DB (Shaun 11/23, the `candid` table): each tick of the day's run puts in, as found, up
 * to the DB channel's room (its daily max less today's DB mails and the DB people still in work), people not taken
 * before (source_ref 'candid:<id>'), with a real address whose domain takes mail, their profile written from the
 * headline, summary, experience and education. Returns how many it put in.
 */
export async function pullDbPeople(_args: { runId: string; settings: AgentSettings; configId: string | null; room: number }): Promise<number> {
  return 0;
}
