/**
 * Ashley's replay (GTM #5): her decide-and-write (ashleyAgent.ts draftCandidateReply, the same code the tick runs)
 * on candidate replies, with NOTHING sent, written or posted:
 * - the I/O has no send function (the run refuses to start if one is wired), every store or relay write throws,
 *   Slack lines, opt-outs and timeline notes are only collected, the spend is counted locally;
 * - fetch refuses Resend and Slack hosts on top of that;
 * - database reads (Gmail and pending modes only) are read-only transactions with a 20s statement timeout;
 * - results go to output/ashley-replay/<run>/ (results.jsonl, report.md), which git ignores.
 *
 * Two sources:
 *   made-up cases (default: scripts/gtm-agent/ashley-replay-cases.json, no real people or companies)
 *     npx tsx --tsconfig scripts/tsconfig.json scripts/gtm-agent/ashley-replay.ts [--cases <file>] [--only id,id]
 *   real replies, re-read in full from Ashley's Gmail (read-only scope), only mails threaded to our agent mails:
 *     npx tsx --tsconfig scripts/tsconfig.json scripts/gtm-agent/ashley-replay.ts --gmail [--mailbox <address>]
 *       [--days 14] [--limit 40] [--expect <labels.json>]
 *     Without --expect the results are unlabelled; the run writes expect-template.json to fill in (Gmail message id →
 *     allowed actions) for the next run. That output holds real mail text: keep it on the machine.
 *   real replies already stored in the conversation table and not decided yet (what Ashley's next open tick answers;
 *   no Gmail key needed, read-only), oldest first, an older mail skipped when the same address wrote again (the tick
 *   answers only the newest):
 *     npx tsx --tsconfig scripts/tsconfig.json scripts/gtm-agent/ashley-replay.ts --pending [--limit 60] [--expect <labels.json>]
 * Options: --max-usd <n> (default 3) stops the run when the model spend reaches it; --fake-llm checks the plumbing
 * without a model (every mail gets the same fixed reply: the grades mean nothing).
 *
 * Pass/fail per mail against its allowed actions. The bar: 0 missed stop requests and 0 wrong sends; the exit code is
 * 1 when a labelled mail misses it.
 */
import { config } from "dotenv";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import type { AshleyIO, AshleyMail, AshleyPerson, CandidateDraft } from "../../src/lib/gtmPlays/agent/ashleyAgent";
import type { ReplayAction, ReplayGrade, ReplayOutcome, ReplayTotals } from "../../src/lib/gtmPlays/agent/ashleyReplay";
import type { ConversationMessage, ConversationStore, HistoryEntry } from "../../src/lib/gtmPlays/agent/conversation";
import type { AgentPosting } from "../../src/lib/gtmPlays/agent/types";

config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

// Next's server-only marker has no behaviour in a plain Node run.
const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function load(this: unknown, request: unknown, ...rest: unknown[]) {
  return request === "server-only" ? {} : originalLoad.call(this, request, ...rest);
};

const DEFAULT_CASES = "scripts/gtm-agent/ashley-replay-cases.json";
const CASE_EMAIL = "candidate@example.com";
const SKIP_LABELS = new Set(["SENT", "DRAFT", "SPAM", "CHAT"]);

function flag(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}
const hasFlag = (name: string) => process.argv.includes(name);

// ---------------------------------------------------------------------------------------------------------------
// What one replayed mail is

type ReplayItem = {
  id: string;
  source: "case" | "gmail" | "pending";
  note: string;
  expect: ReplayAction[] | null;
  message: ConversationMessage;
  person: AshleyPerson | null;
  root: AshleyMail | null;
  /** Settled before any model call, as the tick does. */
  settled?: "member" | "human_answered" | "no_person";
  /** Case mode: the history and the postings' state come from the case. */
  history?: HistoryEntry[];
  postingText?: Map<string, { text: string | null; canAskCompany: boolean }>;
};

type ReplayResult = {
  id: string; source: ReplayItem["source"]; note: string; from: string; receivedAt: string; expect: ReplayAction[] | null;
  outcome: ReplayOutcome | null; grade: ReplayGrade | null; type: string | null; signals: unknown[]; asks: string[];
  link: { label: string; url: string } | null; body: string | null; tools: string[]; costUsd: number;
  collected: string[]; error: string | null; mailText: string;
};

const inboundMessage = (fields: Partial<ConversationMessage> & Pick<ConversationMessage, "id" | "counterpartEmail" | "subject" | "bodyText" | "newText" | "occurredAt">): ConversationMessage => ({
  personId: null, counterpartKind: "candidate", author: "counterpart", direction: "inbound", gmailMessageId: null,
  gmailThreadId: null, rfcMessageId: null, inReplyTo: null, references: null, rootMailId: null, decision: null,
  decisionReason: null, signals: [], answeredByMessageId: null, sendStatus: null, providerMessageId: null, error: null,
  createdAt: fields.occurredAt, ...fields,
});

// ---------------------------------------------------------------------------------------------------------------
// Made-up cases

type CasePosting = AgentPosting & { text?: string | null; canAskCompany?: boolean };
type ReplayCase = {
  id: string; note?: string;
  person: { name: string | null; headline: string | null; location: string | null; currentCompany: string | null; profileText: string | null; language: "ko" | "en" | null };
  postings: CasePosting[];
  /** fromEmail: a reply from another address than the one our mail went to. */
  mail: { subject: string; text: string; hoursAgo?: number; fromEmail?: string };
  /** Mails in the thread between our first mail and this one (theirs, Ashley's, or a person's from the mailbox). */
  earlier?: Array<{ author: "counterpart" | "ashley" | "human"; text: string; hoursAgo: number; handedOff?: boolean }>;
  expect: unknown;
};

async function caseItems(file: string, only: Set<string> | null, now: Date): Promise<ReplayItem[]> {
  const { parseExpect } = await import("../../src/lib/gtmPlays/agent/ashleyReplay");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { cases?: ReplayCase[] };
  if (!Array.isArray(parsed.cases)) throw new Error(`${file}: no "cases" list`);
  return parsed.cases.filter((item) => !only || only.has(item.id)).map((item) => {
    const expect = parseExpect(item.expect);
    if (!expect) throw new Error(`${file}: case ${item.id} has no valid "expect"`);
    const sentAt = new Date(now.getTime() - 2 * 86_400_000).toISOString();
    const at = new Date(now.getTime() - (item.mail.hoursAgo ?? 3) * 3_600_000).toISOString();
    const postings: AgentPosting[] = item.postings.map(({ text: _text, canAskCompany: _ask, ...posting }) => posting);
    const rootId = `case-${item.id}`;
    const subject = item.mail.subject.replace(/^\s*re:\s*/i, "") || "Roles for you";
    const root: AshleyMail = {
      id: rootId, audience: "candidate", toEmail: CASE_EMAIL, fromName: "Ashley Kim", fromEmail: "ashley@matchharper.com",
      subject, language: item.person.language, postings, personId: `person-${item.id}`, rfcMessageId: `<${rootId}@replay.example>`,
      createdAt: sentAt, interestedPersonIds: [],
    };
    const person: AshleyPerson = {
      id: `person-${item.id}`, name: item.person.name, headline: item.person.headline, location: item.person.location,
      currentCompany: item.person.currentCompany, profileText: item.person.profileText, source: "replay",
      language: item.person.language, email: CASE_EMAIL, postings, mailId: rootId, followupMailId: null, sentAt, isTest: true,
      events: [],
    };
    const firstMail = [
      item.person.language === "ko" ? `${item.person.name ?? ""}님, 안녕하세요. 하퍼의 Ashley예요.` : `Hi ${item.person.name ?? "there"}, this is Ashley from Harper.`,
      ...postings.map((posting) => `- ${posting.companyName} — ${posting.title}${posting.location ? ` (${posting.location})` : ""}: ${posting.why}`),
    ].join("\n");
    const history: HistoryEntry[] = [{
      at: sentAt, author: "agent_mail", kind: "first", subject, text: firstMail,
      postings: postings.map((posting) => ({ companyName: posting.companyName, title: posting.title, url: posting.url })), threadKey: rootId,
    }, ...(item.earlier ?? []).map((entry): HistoryEntry => ({
      at: new Date(now.getTime() - entry.hoursAgo * 3_600_000).toISOString(), author: entry.author, kind: "reply", subject: item.mail.subject,
      text: entry.text, postings: [], threadKey: rootId, ...(entry.handedOff ? { handedOff: true } : {}),
    }))];
    const postingText = new Map(item.postings.map((posting) => [postingKey(posting), { text: posting.text ?? null, canAskCompany: Boolean(posting.canAskCompany) }]));
    const message = inboundMessage({
      id: `case-message-${item.id}`, personId: person.id, counterpartEmail: CASE_EMAIL, fromEmail: item.mail.fromEmail ?? null, subject: item.mail.subject,
      bodyText: item.mail.text, newText: item.mail.text, rootMailId: rootId, rfcMessageId: `<reply-${item.id}@mail.example.com>`,
      inReplyTo: root.rfcMessageId, references: root.rfcMessageId, occurredAt: at,
    });
    return { id: item.id, source: "case", note: item.note ?? "", expect, message, person, root, history, postingText };
  });
}

const postingKey = (posting: Pick<AgentPosting, "url" | "roleId" | "companyName" | "title">) =>
  (posting.url || posting.roleId || `${posting.companyName}/${posting.title}`).trim().toLowerCase();

// ---------------------------------------------------------------------------------------------------------------
// Real replies, re-read from Gmail (read-only), matched to our agent mails

async function gmailItems(args: { mailbox: string | null; days: number; limit: number; labels: Map<string, ReplayAction[]> }): Promise<{ items: ReplayItem[]; counts: Record<string, number> }> {
  const gmail = await import("../../src/lib/contentsEngine/gmail");
  const replies = await import("../../src/lib/gtmPlays/agent/replies");
  const { gtmRead } = await import("../../src/lib/gtmPlays/db.server");
  const { readAgentPerson, readAgentSettings } = await import("../../src/lib/gtmPlays/agent/store.server");
  const { readMail, isMember } = await import("../../src/lib/gtmPlays/agent/ashleyReply.server");
  const { personAnswered } = await import("../../src/lib/gtmPlays/agent/conversation.server");
  if (!gmail.gmailServiceAccountConfigured()) throw new Error("Gmail service account not configured (.env.local)");

  const settings = await readAgentSettings();
  const team = replies.replyMailboxes(process.env.GTM_AGENT_REPLY_MAILBOXES, settings.senderEmail);
  const mailboxes = args.mailbox ? [args.mailbox.trim().toLowerCase()] : team;
  if (!mailboxes.length) throw new Error("No mailbox: pass --mailbox");

  const rows = await gtmRead(async (sql) => {
    await sql`set local statement_timeout = '20s'`;
    return sql<Array<{ mail_id: string; person_id: string | null; audience: string; to_email: string; rfc_message_id: string | null; subject: string; created_at: string | Date }>>`
      select m.id::text as mail_id, m.agent_person_id::text as person_id, m.audience, m.to_email, m.rfc_message_id, m.subject, m.created_at
      from public.gtm_mails m
      where m.campaign = 'agent' and (m.status = 'sent' or (m.status = 'sending' and m.provider_message_id is not null))
        and (m.agent_person_id is not null or m.audience = 'company')
        and m.created_at > now() - make_interval(days => ${args.days + replies.REPLY_WINDOW_DAYS}::int)
      order by m.created_at desc limit 5000
    `;
  });
  const sent = rows.map((row) => ({
    mailId: row.mail_id, personId: row.person_id, audience: row.audience === "company" ? "company" as const : "candidate" as const,
    toEmail: row.to_email, rfcMessageId: replies.normalizeMessageId(row.rfc_message_id) || null, subject: row.subject,
    sentAt: new Date(row.created_at).toISOString(),
  }));
  const counts: Record<string, number> = {};
  const count = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  const items: ReplayItem[] = [];
  const seen = new Set<string>();
  const teamSet = new Set(team.map((address) => address.toLowerCase()));

  for (const mailbox of mailboxes) {
    const access = { mailbox, scopes: [gmail.GMAIL_READONLY_SCOPE] };
    const ids = new Set<string>();
    for (const search of replies.addressSearches(sent.map((mail) => mail.toEmail), args.days)) {
      for (const id of await gmail.listInboxMessageIds(search, access, 200, null)) ids.add(id);
    }
    const matched: Array<{ id: string; parsed: ReturnType<typeof gmail.parseGmailMessage>; match: NonNullable<ReturnType<typeof replies.matchAgentReply>> }> = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      // Headers only first: a mail not threaded to an agent mail is never opened.
      const head = await gmail.getGmailMessage(id, access, "metadata").catch(() => null);
      if (!head || head.labelIds?.some((label) => SKIP_LABELS.has(label))) continue;
      const parsed = gmail.parseGmailMessage(head);
      const from = parsed.fromEmail?.toLowerCase() ?? "";
      if (!from || teamSet.has(from) || from === mailbox) continue;
      const headers = gmail.getGmailHeaders(head);
      if (replies.maybeDeliveryReport({ fromEmail: from, headers })) { count("delivery report (the sync's)"); continue; }
      if (replies.isUnsubscribeSubject(parsed.subject)) { count("unsubscribe mail (the sync's opt-out)"); continue; }
      if (replies.autoReplyReason({ fromEmail: from, headers })) { count("automatic mail (never reaches Ashley)"); continue; }
      const match = replies.matchAgentReply(parsed, sent);
      if (!match) { count("not threaded to an agent mail (not opened)"); continue; }
      if (match.mail.audience === "company") { count("company reply (not replayed)"); continue; }
      if (match.mail.toEmail.trim().toLowerCase() !== from) { count("other sender (the sync hands it to a person)"); continue; }
      matched.push({ id, parsed, match });
    }
    matched.sort((a, b) => Date.parse(a.parsed.receivedAt) - Date.parse(b.parsed.receivedAt));
    for (const { id, match } of matched.slice(0, Math.max(0, args.limit - items.length))) {
      const full = await gmail.getGmailMessage(id, access, "full");
      const parsed = gmail.parseGmailMessage(full);
      const from = (parsed.fromEmail ?? "").toLowerCase();
      const message = inboundMessage({
        id: `gmail:${id}`, personId: match.mail.personId, counterpartEmail: from, gmailMessageId: id, gmailThreadId: parsed.threadId,
        rfcMessageId: parsed.rfcMessageId, inReplyTo: parsed.inReplyTo, references: parsed.references, subject: parsed.subject,
        bodyText: parsed.body, newText: replies.cutQuotedText(parsed.body), rootMailId: match.mail.mailId, occurredAt: parsed.receivedAt,
      });
      const person = match.mail.personId ? await readAgentPerson(match.mail.personId) as AshleyPerson | null : null;
      const root = await readMail(match.mail.mailId);
      const settled = await isMember(from) ? "member" as const
        : root && await personAnswered(root.id, message.occurredAt) ? "human_answered" as const
          : !person || !root ? "no_person" as const : undefined;
      items.push({ id, source: "gmail", note: `${mailbox} · matched by ${match.by}`, expect: args.labels.get(id) ?? null, message, person, root, settled });
      count("replayed");
    }
  }
  return { items, counts };
}

// ---------------------------------------------------------------------------------------------------------------
// Real replies already in the conversation table, not decided yet (what the next open tick answers)

async function pendingItems(args: { limit: number; labels: Map<string, ReplayAction[]> }): Promise<{ items: ReplayItem[]; counts: Record<string, number> }> {
  const { listUndecidedInbound } = await import("../../src/lib/gtmPlays/agent/conversation.server");
  const { readAgentPerson } = await import("../../src/lib/gtmPlays/agent/store.server");
  const { readMail, isMember } = await import("../../src/lib/gtmPlays/agent/ashleyReply.server");
  const { personAnswered } = await import("../../src/lib/gtmPlays/agent/conversation.server");
  const undecided = await listUndecidedInbound(1_000);
  const counts: Record<string, number> = {};
  const count = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  // The tick answers only the newest mail from an address (the older ones are in its history).
  const newest = new Map<string, string>();
  for (const message of undecided) newest.set(message.counterpartEmail.toLowerCase(), message.id);
  const items: ReplayItem[] = [];
  for (const message of undecided) {
    if (message.counterpartKind === "company") { count("company reply (not replayed)"); continue; }
    if (newest.get(message.counterpartEmail.toLowerCase()) !== message.id) { count("older mail from the same address (the tick answers the newest)"); continue; }
    if (items.length >= args.limit) { count("over --limit"); continue; }
    const person = message.personId ? await readAgentPerson(message.personId) as AshleyPerson | null : null;
    const root = message.rootMailId ? await readMail(message.rootMailId) : null;
    const settled = await isMember(message.counterpartEmail) ? "member" as const
      : root && await personAnswered(root.id, message.occurredAt) ? "human_answered" as const
        : !person || !root ? "no_person" as const : undefined;
    items.push({ id: message.id, source: "pending", note: "stored, not decided", expect: args.labels.get(message.id) ?? null, message, person, root, settled });
    count("replayed");
  }
  return { items, counts };
}

// ---------------------------------------------------------------------------------------------------------------
// The replay's I/O: no sender, no writes, nothing posted

const noWrite = (what: string) => async (): Promise<never> => {
  throw new Error(`replay: no writes (${what})`);
};

async function replayIO(args: {
  mode: "cases" | "gmail" | "pending"; maxUsd: number; fakeLlm: boolean; collected: string[]; tools: string[]; spend: { usd: number };
  current: () => ReplayItem | null;
}): Promise<AshleyIO> {
  const { GTM_HARPER_ORIGIN } = await import("../../src/lib/gtmPlays/shared");
  const live = args.mode !== "cases" ? {
    store: (await import("../../src/lib/gtmPlays/agent/conversation.server")).conversationStore,
    server: await import("../../src/lib/gtmPlays/agent/ashleyReply.server"),
    settings: await (await import("../../src/lib/gtmPlays/agent/store.server")).readAgentSettings(),
    canAsk: (await import("../../src/lib/gtmPlays/agent/companyMail.server")).canAskCompany,
  } : null;
  const readPosting = live ? live.server.postingReader() : null;
  const baseLlm: AshleyIO["llm"] = args.fakeLlm
    // Always "reply": runs the writer's path too (signup_link, the check), so the bar is seen failing on stop cases.
    ? async (call) => {
      if (call.stopAfter.includes("decide")) {
        await call.executeTool("decide", { action: "reply", type: "question", reason: "fake model (plumbing check)", signals: [], missing_facts: [] });
        return { text: "", costUsd: 0 };
      }
      await call.executeTool("signup_link", { next_step: "onboarding", posting: null });
      return { text: "Hi,\n\nThe posting doesn't say. Once you're on Harper, I'll ask the team while introducing you.", costUsd: 0 };
    }
    : (await import("../../src/lib/gtmPlays/agent/ashleyReply.server")).ashleyLlm;

  const store: ConversationStore = {
    saveInbound: noWrite("saveInbound"),
    listUndecidedInbound: async () => [],
    recordDecision: noWrite("recordDecision"),
    queueReply: noWrite("queueReply"),
    markSent: noWrite("markSent"),
    markFailed: noWrite("markFailed"),
    history: async (email, opts) => (live ? live.store.history(email, opts) : args.current()?.history ?? []),
    personAnswered: async (rootMailId, since) => (live ? live.store.personAnswered(rootMailId, since) : false),
    interestSignals: async (opts) => (live ? live.store.interestSignals(opts) : []),
  };
  const io: AshleyIO = {
    store,
    settings: {
      replyAgentEnabled: true,
      handoffSlackUserId: null,
      senderName: live?.settings.senderName?.trim() || "Ashley Kim",
      senderEmail: live?.settings.senderEmail?.trim() || "ashley@matchharper.com",
      // The replay asks what Ashley would write, whatever the hour.
      windowOpen: () => true,
      origin: GTM_HARPER_ORIGIN,
      mailbox: null,
    },
    readPerson: async (id) => (live ? (await (await import("../../src/lib/gtmPlays/agent/store.server")).readAgentPerson(id)) as AshleyPerson | null : args.current()?.person ?? null),
    readMail: async (id) => (live ? live.server.readMail(id) : args.current()?.root?.id === id ? args.current()?.root ?? null : null),
    isMember: async (email) => (live ? live.server.isMember(email) : false),
    isSuppressed: async (email) => (live ? live.server.isSuppressed(email) : false),
    postingState: async (posting) => {
      if (readPosting) return readPosting(posting);
      const known = args.current()?.postingText?.get(postingKey(posting));
      return { open: true, text: known?.text ?? null };
    },
    // A re-search would run the matcher (its own spend and writes): not in the replay.
    findSimilar: async () => {
      args.collected.push("find_similar_roles: not run in the replay (no roles returned)");
      return [];
    },
    llm: async (call) => {
      const result = await baseLlm({
        ...call,
        executeTool: async (name, input) => {
          args.tools.push(`${call.label.replace("gtm-agent:ashley-", "")}:${name}`);
          return call.executeTool(name, input);
        },
      });
      return result;
    },
    maySpend: async () => args.spend.usd < args.maxUsd,
    recordSpend: async (usd) => {
      args.spend.usd += Number.isFinite(usd) ? usd : 0;
    },
    slack: async (text) => {
      args.collected.push(`slack (not posted): ${text.split("\n")[0]}`);
    },
    stopContact: async ({ note }) => {
      args.collected.push(`stop contact (not done): ${note}`);
    },
    notePerson: async (_personId, note) => {
      args.collected.push(`timeline note (not written): ${note}`);
    },
    unsubscribeUrl: () => null,
    relays: { forPerson: async () => [], get: async () => null, claim: noWrite("relays.claim"), mark: noWrite("relays.mark") },
    canAskCompany: async (input) => {
      if (live) return live.canAsk(input, { store }).catch(() => false);
      const posting = args.current()?.person?.postings.find((item) => item.url === input.postingUrl);
      return posting ? Boolean(args.current()?.postingText?.get(postingKey(posting))?.canAskCompany) : false;
    },
    latestInbound: async () => null,
  };
  return io;
}

// ---------------------------------------------------------------------------------------------------------------
// Report

const oneLine = (text: string, max = 160) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const cell = (text: string) => oneLine(text, 120).replace(/\|/g, "\\|");
const quoted = (text: string) => text.trim().split("\n").map((line) => `> ${line}`).join("\n");

function reportText(args: { mode: string; runId: string; startedAt: Date; model: string; results: ReplayResult[]; totals: ReplayTotals; meets: boolean; counts: Record<string, number>; spendUsd: number; fake: boolean; stoppedForCost: boolean }) {
  const lines = [
    `# Ashley replay · ${args.runId}`,
    "",
    `- Source: ${args.mode}${args.fake ? " · FAKE MODEL (plumbing check only: grades mean nothing)" : ""}`,
    `- Model: ${args.model}`,
    `- Started: ${args.startedAt.toISOString()}`,
    `- Spend: $${args.spendUsd.toFixed(4)}${args.stoppedForCost ? " (stopped at --max-usd)" : ""}`,
    "- Nothing was sent, written or posted (no sender wired; store writes throw; Slack and opt-outs only collected).",
    args.mode !== "cases" ? "- This file holds real mail text: keep it on this machine." : "- Made-up cases (no real people or companies).",
    "",
    "## Result",
    "",
    `| mails | pass | fail | unlabelled | missed stops | wrong sends | bar (0 / 0) |`,
    `|---|---|---|---|---|---|---|`,
    `| ${args.totals.cases} | ${args.totals.pass} | ${args.totals.fail} | ${args.totals.unlabelled} | ${args.totals.missedStops} | ${args.totals.wrongSends} | ${args.meets ? "met" : "**MISSED**"} |`,
    "",
  ];
  if (Object.keys(args.counts).length) {
    lines.push("Mails not replayed:", "", ...Object.entries(args.counts).map(([key, value]) => `- ${key}: ${value}`), "");
  }
  lines.push("## Per mail", "", "| mail | expected | Ashley | grade | type | reason |", "|---|---|---|---|---|---|");
  for (const result of args.results) {
    const grade = result.error ? "error" : result.grade ? `${result.grade.status}${result.grade.missedStop ? " · MISSED STOP" : ""}${result.grade.wrongSend ? " · WRONG SEND" : ""}` : "";
    lines.push(`| ${cell(result.id)} | ${result.expect?.join(", ") ?? "—"} | ${result.outcome?.action ?? "—"} | ${grade} | ${result.type ?? "—"} | ${cell(result.error ?? result.outcome?.reason ?? "")} |`);
  }
  lines.push("");
  for (const result of args.results) {
    lines.push(`### ${result.id}${result.note ? ` · ${result.note}` : ""}`, "", `From ${result.from} at ${result.receivedAt}`, "", quoted(oneLine(result.mailText, 1_500)), "");
    if (result.error) lines.push(`Error: ${result.error}`, "");
    if (result.outcome) lines.push(`Ashley: **${result.outcome.action}**${result.type ? ` (${result.type})` : ""} · ${result.outcome.reason}`, "");
    if (result.outcome?.checkReasons.length) lines.push(`Held by the check: ${result.outcome.checkReasons.join("; ")}`, "");
    if (result.body) lines.push("Draft (not sent):", "", quoted(result.body), ...(result.link ? ["", `${result.link.label}: ${result.link.url}`] : []), "");
    if (result.asks.length) lines.push(`Asks: ${result.asks.join(", ")}`, "");
    if (result.tools.length) lines.push(`Tools: ${result.tools.join(", ")}`, "");
    if (result.collected.length) lines.push(...result.collected.map((line) => `- ${line}`), "");
  }
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------------------------

async function main() {
  const replay = await import("../../src/lib/gtmPlays/agent/ashleyReplay");
  // Belt and braces: no mail provider, no Slack, whatever the code below calls.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (replay.replayBlockedHost(url.hostname)) throw new Error(`replay: ${url.hostname} is blocked (nothing is sent or posted)`);
    return realFetch(input, init);
  };

  const mode = hasFlag("--gmail") ? "gmail" as const : hasFlag("--pending") ? "pending" as const : "cases" as const;
  const maxUsd = Number(flag("--max-usd") ?? 3);
  const fakeLlm = hasFlag("--fake-llm");
  const startedAt = new Date();
  const runId = `${startedAt.toISOString().replace(/[:.]/g, "-")}-${mode}${fakeLlm ? "-fake" : ""}`;
  const dir = path.resolve(process.cwd(), "output", "ashley-replay", runId);

  const collected: string[] = [];
  const tools: string[] = [];
  const spend = { usd: 0 };
  let current: ReplayItem | null = null;
  const io = await replayIO({ mode, maxUsd, fakeLlm, collected, tools, spend, current: () => current });
  replay.assertReplayCannotSend(io);

  let items: ReplayItem[];
  let counts: Record<string, number> = {};
  if (mode === "cases") {
    const only = flag("--only");
    items = await caseItems(flag("--cases") ?? DEFAULT_CASES, only ? new Set(only.split(",").map((id) => id.trim())) : null, startedAt);
  } else {
    const labels = new Map<string, ReplayAction[]>();
    const expectFile = flag("--expect");
    if (expectFile) {
      const raw = JSON.parse(readFileSync(expectFile, "utf8")) as Record<string, unknown>;
      for (const [id, value] of Object.entries(raw)) {
        const expect = replay.parseExpect(Array.isArray(value) ? value : (value as { expect?: unknown } | null)?.expect);
        if (expect) labels.set(id, expect);
      }
    }
    const read = mode === "pending"
      ? await pendingItems({ limit: Number(flag("--limit") ?? 60), labels })
      : await gmailItems({ mailbox: flag("--mailbox"), days: Number(flag("--days") ?? 14), limit: Number(flag("--limit") ?? 40), labels });
    items = read.items;
    counts = read.counts;
  }

  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const jsonl = path.join(dir, "results.jsonl");
  writeFileSync(jsonl, "", { mode: 0o600 });
  const { draftCandidateReply } = await import("../../src/lib/gtmPlays/agent/ashleyAgent");
  const model = fakeLlm ? "fake" : (await import("../../src/lib/email/runtime/model")).emailAssistantModel().primaryModel;
  const results: ReplayResult[] = [];
  let stoppedForCost = false;

  for (const item of items) {
    if (spend.usd >= maxUsd) {
      stoppedForCost = true;
      break;
    }
    current = item;
    collected.length = 0;
    tools.length = 0;
    const before = spend.usd;
    const result: ReplayResult = {
      id: item.id, source: item.source, note: item.note, from: item.message.counterpartEmail, receivedAt: item.message.occurredAt,
      expect: item.expect, outcome: null, grade: null, type: null, signals: [], asks: [], link: null, body: null, tools: [],
      costUsd: 0, collected: [], error: null, mailText: item.message.newText.trim() || item.message.bodyText,
    };
    try {
      let draft: CandidateDraft | null = null;
      if (item.settled) {
        const reason = item.settled === "member" ? "회원 · Harper's chat answers it" : item.settled === "human_answered" ? "사람 몫 · a person already answered this mail" : "사람 · no person or first mail found";
        result.outcome = { action: item.settled === "no_person" ? "hand_to_human" : item.settled, wouldSend: false, reason, checkReasons: [] };
      } else if (item.person && item.root) {
        // The tick's own time: a few minutes after the mail came.
        const now = new Date(Math.min(Date.now(), Date.parse(item.message.occurredAt) + 5 * 60_000));
        draft = await draftCandidateReply(io, { message: item.message, person: item.person, root: item.root, now });
        result.outcome = replay.replayOutcome(draft);
        result.type = draft.type;
        if (draft.kind === "reply") {
          Object.assign(result, { signals: draft.signals, asks: draft.asks, body: draft.body, link: draft.link ? { label: draft.link.label, url: draft.link.url } : null });
        }
      }
      if (result.outcome) result.grade = replay.gradeReplay(item.expect, result.outcome);
    } catch (error) {
      result.error = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    }
    result.costUsd = Number((spend.usd - before).toFixed(6));
    result.tools = [...tools];
    result.collected = [...collected];
    results.push(result);
    appendFileSync(jsonl, `${JSON.stringify(result)}\n`);
    const grade = result.error ? "error" : result.grade?.status ?? "-";
    console.log(`${item.id}: ${result.outcome?.action ?? "-"} (${grade}${result.grade?.missedStop ? ", MISSED STOP" : ""}${result.grade?.wrongSend ? ", WRONG SEND" : ""})`);
  }

  const totals = replay.replayTotals(results.flatMap((result) => (result.grade ? [result.grade] : [])));
  const meets = replay.replayMeetsBar(totals);
  writeFileSync(path.join(dir, "report.md"), reportText({ mode, runId, startedAt, model, results, totals, meets, counts, spendUsd: spend.usd, fake: fakeLlm, stoppedForCost }), { mode: 0o600 });
  if (mode !== "cases") {
    const template = Object.fromEntries(results.map((result) => [result.id, { expect: result.expect ?? [], ashley: result.outcome?.action ?? null, from: result.from, excerpt: oneLine(result.mailText, 200) }]));
    writeFileSync(path.join(dir, "expect-template.json"), `${JSON.stringify(template, null, 2)}\n`, { mode: 0o600 });
  }
  const errors = results.filter((result) => result.error).length;
  console.log(`\n${totals.cases} graded · pass ${totals.pass} · fail ${totals.fail} · unlabelled ${totals.unlabelled} · errors ${errors} · missed stops ${totals.missedStops} · wrong sends ${totals.wrongSends} · $${spend.usd.toFixed(4)}`);
  console.log(`bar (0 missed stops, 0 wrong sends): ${meets ? "met" : "MISSED"}`);
  console.log(`report: ${path.relative(process.cwd(), path.join(dir, "report.md"))}`);
  if (!meets) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
});
