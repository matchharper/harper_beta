import type { TALENT_TOOL_NAMES } from "@/lib/talentOnboarding/tools";

/**
 * A member's reply to an Ashley mail (#5 candidate outreach), recorded in their Harper chat and answered by Harper
 * right away (the routing of 11/23-11/25, Shaun 11/23 "바로 처리"; since 11/25 Ashley answers these mails herself and
 * copies them into the chat, so only rows recorded before then are read here). The person is not in the chat when that
 * turn runs, so it answers, reads and saves, and leaves every step that acts toward others for the person to start
 * in Harper: Harper offers it in the chat, and their click or message there starts an ordinary turn.
 * No runtime imports: the GTM agent reads ASHLEY_INBOX_VIA without loading the tool catalog.
 */
export const ASHLEY_INBOX_VIA = "ashley_inbox";

/**
 * Steps that act toward others (a company, a posting, a website, a mail, a calendar invite) and wait for the person
 * in Harper; delegated work too, since a delegate runs as its own turn with every tool.
 */
export const MAIL_STARTED_BLOCKED_TOOLS = ["CONTACT_COMPANY", "APPLY_TO_INTERNAL_ROLE", "USE_BROWSER", "WRITE_EMAIL", "MANAGE_WORK"] as const satisfies
  ReadonlyArray<keyof typeof TALENT_TOOL_NAMES>;
/** The same for tools not in TALENT_TOOL_NAMES (career/generalTools.ts). */
export const MAIL_STARTED_BLOCKED_NAMES: readonly string[] = ["write_calendar"];

type InputRow = { message_type?: string | null; payload?: unknown };

/**
 * What goes with such a mail for Harper's model (payload.ashleyThread, written when it is routed): Harper has no other
 * copy of Ashley's mail, so without it "the role" in their reply points nowhere (11/23: a Harper turn read a routed
 * reply as a draft to send, and could not tell which role it was about).
 */
export type AshleyThreadContext = {
  /** The Ashley mail they answered: the thread's last mail from Ashley's mailbox before theirs (quotes cut, capped). */
  mail: { subject: string; text: string } | null;
  /** The roles Ashley's mails in that thread named. */
  postings: Array<{ companyName: string; title: string; url: string | null; roleId?: string }>;
};

const ASHLEY_MAIL_FRAME = "[Email reply to a mail from Ashley, received by Harper] Ashley writes to people from Harper about roles. "
  + "The candidate answered her mail by email, and Harper received that reply to answer in this chat. It is their message to "
  + "Harper, not a draft for Harper to send. A turn started by such mails alone cannot contact companies, apply, browse or "
  + "send mail: offer those steps for the person to start in Harper.";

/** How such a mail reads to Harper's model; the chat shows the person's words as they are. */
export function ashleyInboxMailForModel(content: string, payload: unknown): string {
  const thread = (payload && typeof payload === "object" ? (payload as { ashleyThread?: AshleyThreadContext | null }).ashleyThread : null) ?? null;
  const lines = [ASHLEY_MAIL_FRAME, content.trim()];
  if (thread?.mail?.text?.trim()) lines.push(`Ashley's mail they answered${thread.mail.subject ? ` ("${thread.mail.subject}")` : ""}:`, thread.mail.text.trim());
  const postings = (thread?.postings ?? []).filter((posting) => posting?.title);
  if (postings.length) {
    lines.push("Roles Ashley's mails in that thread named:", ...postings.map((posting) => {
      const refs = [posting.roleId ? `roleId: ${posting.roleId}` : "", posting.url ?? ""].filter(Boolean);
      return `- ${[posting.companyName, posting.title].filter(Boolean).join(" — ")}${refs.length ? ` (${refs.join("; ")})` : ""}`;
    }));
  }
  if (!thread) lines.push("Ashley's mail itself is not available here.");
  return lines.join("\n");
}

/** A chat row that is a member's mail to Ashley, recorded by the routing of 11/23-11/25. */
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
  const blocked = new Set<string>([...MAIL_STARTED_BLOCKED_TOOLS.map((key) => toolNames[key]), ...MAIL_STARTED_BLOCKED_NAMES]);
  return chatToolNames.filter((name) => !blocked.has(name));
}
