import assert from "node:assert/strict";
import Module from "node:module";
import { after, before, test } from "node:test";
import type { ConversationMessage } from "./conversation";
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

function fakeDeps(members: Record<string, string> = { "candidate@example.com": "user-1" }) {
  const lookups: string[] = [];
  const inserted: Array<Parameters<MemberRouteDeps["insertMail"]>[0]> = [];
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
    async insertMail(row) {
      inserted.push(row);
    },
  };
  return { deps, lookups, inserted };
}

test("a signed-up person's reply is recorded in their Harper chat as a mail, once", async () => {
  const { deps, lookups, inserted } = fakeDeps();
  assert.equal(await route.routeToMemberWith(deps, message()), "recorded");
  assert.equal(await route.routeToMemberWith(deps, message()), "already_recorded");
  assert.deepEqual(lookups, ["candidate@example.com", "candidate@example.com"]);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].userId, "user-1");
  assert.equal(inserted[0].conversationId, "conversation-of-user-1");
  assert.equal(inserted[0].content, "[Email reply to Ashley's mail \"Re: Two backend roles\", passed to Harper]\nSounds good.");
  assert.deepEqual(inserted[0].payload, {
    gtmAgentMessageId: "message-1", gmailMessageId: "gmail-1", rfcMessageId: "<reply-1@example.com>",
    subject: "Re: Two backend roles", receivedAt: "2026-11-20T01:00:00.000Z", via: "ashley_inbox",
  });
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
