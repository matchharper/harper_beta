/**
 * GTM plays (/ops/gtm-plays): Chris works as a user of Harper's own company workspace and calls the
 * same company functions a customer calls. Nothing here adds a hidden or test marker to shared reads:
 * company screens are scoped by workspace, and a GTM Role is sealed from members by the existing
 * Role.information.testOnly contract that every member-facing path already checks.
 */

/** Harper's own company workspace (Harper's real hiring). GTM plays never write here. */
export const HARPER_WORKSPACE_ID = "720254d7-aeb7-4709-a56f-7b822f89eac5";

/**
 * "Harper GTM": the company workspace GTM plays work in (Shaun 11/13), apart from Harper's own hiring: its
 * prospecting Roles, their external searches (own 20-per-day company ceiling, no per-Role limit) and intros sent
 * as Harper (published name "Harper"). No plan limit (billing not started); not a customer (is_internal false).
 * Created once in production by SQL (notes/gtm-plays/gtm-workspace-20261113.sql).
 */
export const GTM_WORKSPACE_ID = "93ecd68d-1cf4-4af8-a5c1-b7cb7e4cb848";

/** Describes a Role made by GTM plays. Only the GTM screen lists by it; no shared read filters on it. */
export const GTM_ROLE_PURPOSE = "gtm_outreach";

/**
 * Off by default, so a local server on the production database only reads and previews. Writes,
 * sends and paid runs (external search about $1~4, address lookup about $0.12) need "on".
 */
export function gtmWritesEnabled(env: Record<string, string | undefined> = process.env) {
  return env.GTM_PLAYS_WRITES?.trim().toLowerCase() === "on";
}

export const GTM_WRITES_OFF_MESSAGE = "이 서버는 쓰기·발송이 꺼져 있어요 (GTM_PLAYS_WRITES=on 필요).";
