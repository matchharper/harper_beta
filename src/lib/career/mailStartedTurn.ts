import type { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";

/**
 * A member's reply to an Ashley mail (#5 candidate outreach), recorded in their Harper chat and answered by Harper
 * right away (gtmPlays/agent/memberRoute.server.ts, Shaun 11/23 "바로 처리"). The person is not in the chat when that
 * turn runs, so it answers, reads and saves, and leaves every step that acts toward others for the person to start
 * in Harper: Harper offers it in the chat, and their click or message there starts an ordinary turn.
 * No runtime imports: the GTM agent reads ASHLEY_INBOX_VIA without loading the tool catalog.
 */
export const ASHLEY_INBOX_VIA = "ashley_inbox";

/** Steps that act toward others (a company, a posting, a website, a mail) and wait for the person in Harper. */
export const MAIL_STARTED_BLOCKED_TOOLS = ["CONTACT_COMPANY", "APPLY_TO_INTERNAL_ROLE", "USE_BROWSER", "WRITE_EMAIL"] as const satisfies
  ReadonlyArray<keyof typeof TALENT_TOOL_NAMES>;

type InputRow = { message_type?: string | null; payload?: unknown };

/** A chat row that is a member's mail to Ashley, recorded by memberRoute.server.ts. */
export function isAshleyInboxMail(row: InputRow): boolean {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {};
  return row.message_type === "mail" && payload.via === ASHLEY_INBOX_VIA;
}

/**
 * The tools of a turn whose every input is such a mail: all of the chat's tools but the blocked ones. null when any
 * input came from the person in Harper (an ordinary turn, nothing taken away) or there is no input.
 */
export function mailStartedToolNames(
  inputs: readonly InputRow[], chatToolNames: readonly string[], toolNames: Pick<typeof TALENT_TOOL_NAMES, (typeof MAIL_STARTED_BLOCKED_TOOLS)[number]>,
): string[] | null {
  if (!inputs.length || !inputs.every(isAshleyInboxMail)) return null;
  const blocked = new Set<string>(MAIL_STARTED_BLOCKED_TOOLS.map((key) => toolNames[key]));
  return chatToolNames.filter((name) => !blocked.has(name));
}
