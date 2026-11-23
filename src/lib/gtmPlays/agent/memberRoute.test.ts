import assert from "node:assert/strict";
import Module from "node:module";
import { after, before, test } from "node:test";
import type { ConversationMessage, HistoryEntry } from "./conversation";
import type { MemberRouteDeps } from "./memberRoute.server";

let route: typeof import("./memberRoute.server");
const loader = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = loader._load;

before(async () => {
  loader._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  route = await import("./memberRoute.server");
});
after(() => {
  loader._load = originalLoad;
});

const message = (patch: Partial<ConversationMessage> = {}): ConversationMessage => ({
  id: "message-1", personId: "person-1", counterpartKind: "candidate", counterpartEmail: "Candidate@Example.com ",
  author: "counterpart", direction: "inbound", gmailMessageId: "gmail-1", gmailThreadId: "thread-1",
  rfcMessageId: "<reply-1@example.com>", inReplyTo: "<first-1@example.com>", references: null,
  subject: "Re: Two backend roles", bodyText: "Sounds good.\n\n> On Monday Ashley wrote:", newText: "Sounds good.",
  rootMailId: "mail-1", decision: null, decisionReason: null, signals: [], answeredByMessageId: null, sendStatus: null,
  providerMessageId: null, error: null, occurredAt: "2026-11-20T01:00:00.000Z", createdAt: "2026-11-20T01:00:01.000Z", ...patch,
});

const entry = (patch: Partial<HistoryEntry>): HistoryEntry => ({
  at: "2026-11-19T01:00:00.000Z", author: "agent_mail", kind: "first", subject: "Two backend roles", text: "Hi Sam, two roles for you.",
  postings: [], threadKey: "mail-1", ...patch,
});

function fakeDeps(members: Record<string, string> = { "candidate@example.com": "user-1" }, opts: { dispatchFails?: boolean; onboarding?: boolean; history?: HistoryEntry[] | "fails" } = {}) {
  const lookups: string[] = [];
  const inserted: Array<Parameters<MemberRouteDeps["admitMail"]>[0] & { durable: boolean }> = [];
  const dispatched: string[] = [];
  const deps: MemberRouteDeps = {
    async findMember(address) {
      lookups.push(address);
      return members[address] ? { userId: members[address] } : null;
    },
    async conversationId(userId) {
      return `conversation-of-${userId}`;
    },
    async alreadyRouted(userId, messageId) {
      return inserted.some((row) => row.userId === userId && row.payload.gtmAgentMessageId === messageId);
    },
    async threadHistory() {
      if (opts.history === "fails") throw new Error("gtm db down");
      return opts.history ?? [];
    },
    async careerReady() {
      return !opts.onboarding;
    },
    async admitMail(row) {
      inserted.push({ ...row, durable: true });
    },
    async insertMail(row) {
      inserted.push({ ...row, durable: false });
    },
    async dispatch(userId, conversationId) {
      if (opts.dispatchFails) throw new Error("queue down");
      dispatched.push(`${userId}/${conversationId}`);
    },
  };
  return { deps, lookups, inserted, dispatched };
}

test("a signed-up person's reply goes into their Harper chat as a mail request, once, and Harper's turn is handed over", async () => {
  const { deps, lookups, inserted, dispatched } = fakeDeps();
  assert.equal(await route.routeToMemberWith(deps, message()), "answering");
  assert.equal(await route.routeToMemberWith(deps, message()), "already_recorded");
  assert.deepEqual(lookups, ["candidate@example.com", "candidate@example.com"]);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].durable, true);
  assert.equal(inserted[0].userId, "user-1");
  assert.equal(inserted[0].conversationId, "conversation-of-user-1");
  assert.equal(inserted[0].content, "[Email reply to Ashley's mail \"Re: Two backend roles\", passed to Harper]\nSounds good.");
  assert.deepEqual(inserted[0].payload, {
    gtmAgentMessageId: "message-1", gmailMessageId: "gmail-1", rfcMessageId: "<reply-1@example.com>",
    subject: "Re: Two backend roles", receivedAt: "2026-11-20T01:00:00.000Z", via: "ashley_inbox", clientRequestId: "gtm-agent-mail:message-1",
  });
  assert.deepEqual(dispatched, ["user-1/conversation-of-user-1"]);
});

test("a member still in onboarding: the mail is only recorded (no turn, nothing handed over)", async () => {
  const { deps, inserted, dispatched } = fakeDeps(undefined, { onboarding: true });
  assert.equal(await route.routeToMemberWith(deps, message()), "recorded");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].durable, false);
  assert.equal("clientRequestId" in inserted[0].payload, false);
  assert.deepEqual(dispatched, []);
});

test("a hand-over that fails leaves the mail recorded (its turn stays queued for the Career dispatcher)", async () => {
  const { deps, inserted } = fakeDeps(undefined, { dispatchFails: true });
  const errors = console.error;
  console.error = () => undefined;
  try {
    assert.equal(await route.routeToMemberWith(deps, message()), "answering");
  } finally {
    console.error = errors;
  }
  assert.equal(inserted.length, 1);
});

test("Ashley's mail they answered and the roles her mails named go with it, for Harper (a failed read routes it anyway)", async () => {
  const postings = [
    { companyName: "Company A", title: "Backend Engineer", url: "https://a.example/jobs/1", roleId: "role-a" },
    { companyName: "Company B", title: "Platform Engineer", url: null },
  ];
  const { deps, inserted } = fakeDeps(undefined, { history: [
    entry({ postings }),
    entry({ at: "2026-11-19T05:00:00.000Z", author: "ashley", kind: "reply", subject: "Re: Two backend roles", text: "It is hybrid in Seoul.",
      postings: [postings[0]] }),
    entry({ at: "2026-11-19T06:00:00.000Z", author: "agent_mail", kind: "first", text: "Another thread.", threadKey: "mail-2" }),
    entry({ at: "2026-11-21T00:00:00.000Z", author: "ashley", kind: "reply", text: "Later mail." }),
  ] });
  await route.routeToMemberWith(deps, message());
  assert.deepEqual(inserted[0].payload.ashleyThread, {
    mail: { subject: "Re: Two backend roles", text: "It is hybrid in Seoul." },
    postings: [postings[0], postings[1]],
  });
  const failing = fakeDeps(undefined, { history: "fails" });
  const errors = console.error;
  console.error = () => undefined;
  try {
    assert.equal(await route.routeToMemberWith(failing.deps, message()), "answering");
  } finally {
    console.error = errors;
  }
  assert.equal("ashleyThread" in failing.inserted[0].payload, false);
});

test("no member with that address: it throws and records nothing", async () => {
  const { deps, inserted } = fakeDeps({});
  await assert.rejects(route.routeToMemberWith(deps, message()), /No Harper member/);
  assert.deepEqual(inserted, []);
});

test("only a candidate's inbound mail is taken", async () => {
  const { deps, lookups, inserted } = fakeDeps();
  for (const patch of [{ direction: "outbound" as const }, { author: "ashley" as const }, { author: "human" as const }, { counterpartKind: "company" as const }]) {
    await assert.rejects(route.routeToMemberWith(deps, message(patch)), /candidate's inbound mail only/);
  }
  assert.deepEqual(lookups, []);
  assert.deepEqual(inserted, []);
});

test("the chat text falls back to the full body, is capped, and leaves out an empty subject", () => {
  assert.equal(
    route.memberMailContent({ subject: " ", newText: "  ", bodyText: "Full body." }),
    "[Email reply to Ashley's mail, passed to Harper]\nFull body.",
  );
  const long = route.memberMailContent({ subject: "S", newText: "x".repeat(30_000), bodyText: "" });
  assert.equal(long.split("\n")[1].length, 20_000);
});
