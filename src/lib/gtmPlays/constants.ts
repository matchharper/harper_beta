/**
 * GTM plays (/ops/gtm-plays): Chris works as a user of Harper's own company workspace and calls the
 * same company functions a customer calls. Nothing here adds a hidden or test marker to shared reads:
 * company screens are scoped by workspace.
 */

/** Harper's own company workspace (Harper's real hiring). GTM plays never write here. */
export const HARPER_WORKSPACE_ID = "720254d7-aeb7-4709-a56f-7b822f89eac5";

/**
 * Off by default, so a local server on the production database only reads and previews. Writes,
 * sends and paid runs (external search about $1~4, address lookup about $0.12) need "on".
 */
export function gtmWritesEnabled(env: Record<string, string | undefined> = process.env) {
  return env.GTM_PLAYS_WRITES?.trim().toLowerCase() === "on";
}

export const GTM_WRITES_OFF_MESSAGE = "이 서버는 쓰기·발송이 꺼져 있어요 (GTM_PLAYS_WRITES=on 필요).";

/** A write or a send asked for while this server's GTM writes are off. */
export class GtmWritesOffError extends Error {
  constructor() {
    super(GTM_WRITES_OFF_MESSAGE);
  }
}
