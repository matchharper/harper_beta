import assert from "node:assert/strict";
import Module from "node:module";
import test, { type TestContext } from "node:test";
import {
  externalCandidateReplyAddresses,
  externalInviteRecipientAllowed,
  externalInviteSendingEnabled,
  externalReplyNoticeFacts,
  externalReplyToken,
  inExternalInviteWindow,
  inviteLanguage,
  normalizeExternalReplyClassification,
  renderExternalInvite,
  statusAfterReply,
  suppressAfterReply,
} from "./externalInvite";
import { externalIntroStatus } from "./externalSourcing";

test("invitations are off unless switched on", () => {
  assert.equal(externalInviteSendingEnabled({}), false);
  assert.equal(externalInviteSendingEnabled({ ORG_EXTERNAL_INVITE_SENDING: "true" }), false);
  assert.equal(externalInviteSendingEnabled({ ORG_EXTERNAL_INVITE_SENDING: "on" }), true);
});

test("cold invitations go out in Korean daytime only", () => {
  assert.equal(inExternalInviteWindow(new Date("2026-11-02T00:00:00Z")), true);   // 09:00 KST
  assert.equal(inExternalInviteWindow(new Date("2026-11-02T10:59:00Z")), true);   // 19:59 KST
  assert.equal(inExternalInviteWindow(new Date("2026-11-02T11:00:00Z")), false);  // 20:00 KST
  assert.equal(inExternalInviteWindow(new Date("2026-11-01T23:59:00Z")), false);  // 08:59 KST
});

test("reply addresses: only the candidate+ namespace on the reply domain", () => {
  const found = externalCandidateReplyAddresses(["Ada <candidate+abcdef_123456@reply.matchharper.com>", "company+abcdef123456@reply.matchharper.com",
    "candidate+abcdef_123456@other.example"], "reply.matchharper.com");
  assert.deepEqual(found, ["candidate+abcdef_123456@reply.matchharper.com"]);
  assert.equal(externalReplyToken(found[0]), "abcdef_123456");
  assert.equal(externalReplyToken("candidate+short@reply.matchharper.com"), null);
});

test("language follows the public profile", () => {
  assert.equal(inviteLanguage({ name: "김에이다", location: null }), "ko");
  assert.equal(inviteLanguage({ name: "Ada Kim", location: "Seoul, South Korea" }), "ko");
  assert.equal(inviteLanguage({ name: "Ada Kim", location: "Berlin, Germany" }), "en");
});

test("the invitation names the company unless the Role hides it, quotes the company's reason and has the opt-out link", () => {
  const base = { personName: "Ada Kim", roleName: "Product Engineer", companyAppeal: "Agent infra experience\nwe liked your talk",
    unsubscribeUrl: "https://matchharper.com/api/email/external-unsubscribe?t=tok", addressSource: "people-data.example" };
  const ko = renderExternalInvite({ ...base, language: "ko", companyName: "Acme" });
  assert.equal(ko.subject, "Acme Product Engineer 포지션 관련해서 연락드려요");
  assert.match(ko.body, /^Ada Kim님, 안녕하세요\. 채용 매칭 서비스 Harper입니다\./);
  assert.match(ko.body, /Acme에서 전한 말이에요\.\n\n> Agent infra experience\n> we liked your talk/);
  assert.match(ko.body, /공개된 프로필/);
  assert.match(ko.body, /external-unsubscribe\?t=tok/);
  const hidden = renderExternalInvite({ ...base, language: "ko", companyName: null });
  assert.doesNotMatch(hidden.subject + hidden.body, /Acme/);
  assert.match(hidden.body, /한 회사에서 Product Engineer 포지션으로/);
  const en = renderExternalInvite({ ...base, language: "en", companyName: "Acme" });
  assert.equal(en.subject, "Acme would like to talk with you about the Product Engineer role");
  assert.match(en.body, /^Hi Ada Kim,/);
  assert.match(en.body, /In Acme's words:/);
  assert.match(renderExternalInvite({ ...base, language: "en", companyName: null }).body, /A company we work with would like to talk/);
  // Every invitation says where the address and the profile came from, right above the opt-out link.
  assert.match(ko.body, /이 메일 주소는 people-data\.example에서, 경력 정보는 공개된 프로필에서 확인했어요\. 앞으로 이런 연락을 받지 않으려면/);
  assert.match(en.body, /We found this email address on people-data\.example and your career details on your public profile\. To stop/);
  // No page confirmed the address: the invitation says it was found through a web search, naming no site.
  assert.match(renderExternalInvite({ ...base, language: "ko", companyName: null, addressSource: null }).body,
    /이 메일 주소는 웹 검색으로 찾았고, 경력 정보는 공개된 프로필에서 확인했어요\. 앞으로/);
  assert.match(renderExternalInvite({ ...base, language: "en", companyName: null, addressSource: null }).body,
    /We found this email address through a web search and your career details/);
});

test("reply classification: fixed types, no addresses or numbers in the summary", () => {
  assert.deepEqual(normalizeExternalReplyClassification({ type: "interested", summary: "Wants to talk; reach me at ada@x.io or 010-1234-5678" }),
    { type: "interested", summary: "Wants to talk; reach me at [email] or [phone]" });
  assert.throws(() => normalizeExternalReplyClassification({ type: "maybe", summary: "x" }));
  assert.equal(statusAfterReply("not_interested"), "declined");
  assert.equal(statusAfterReply("unsubscribe"), "unsubscribed");
  assert.equal(statusAfterReply("question"), "replied");
  assert.equal(suppressAfterReply("unsubscribe"), true);
  assert.equal(suppressAfterReply("interested"), false);
});

test("reply notice facts carry the reading, never the text or address", () => {
  const facts = externalReplyNoticeFacts({ replyId: "r1", roleName: "Product Engineer", receivedAt: "2026-11-02T08:00:00Z", type: "question",
    summary: "Asks about remote work", fromInvitedAddress: false, person: { ref: "c-1", name: "Ada Kim", linkedinUrl: null } });
  assert.equal(facts.externalReply.type, "question");
  assert.equal(facts.candidateState.replyFromAnotherAddress, true);
  assert.equal(facts.candidateState.harperAnsweredThePerson, false);
  assert.doesNotMatch(JSON.stringify(facts), /@/);
});

test("connection state says what was actually sent", () => {
  const at = "2026-11-02T08:00:00Z";
  assert.match(externalIntroStatus({ status: "requested", created_at: at }, false), /has not been contacted \(invitation emails are turned off/);
  assert.match(externalIntroStatus({ status: "requested", created_at: at }, true), /goes out automatically once an address is found.*not sent yet/);
  assert.match(externalIntroStatus({ status: "invited", created_at: at, invited_at: "2026-11-02T09:00:00Z" }, true), /invitation emailed 2026-11-02 18:00; no reply yet/);
  assert.match(externalIntroStatus({ status: "invited", created_at: at, invited_at: "2026-11-02T09:00:00Z", opened_at: "2026-11-02T10:00:00Z" }, true),
    /first opened 2026-11-02 19:00 \(open tracking is approximate\); no reply yet/);
  assert.match(externalIntroStatus({ status: "replied", created_at: at, last_reply_at: at, reply_type: "interested" }, true), /replied .* \(interested\)/);
  assert.match(externalIntroStatus({ status: "not_sendable", created_at: at, error_code: "harper_member" }, true), /belongs to a Harper member/);
  assert.match(externalIntroStatus({ status: "cancelled", created_at: at, error_code: "company_passed" }, true), /company passed; nothing was sent/);
});

/** Server modules need env-built clients and Next's server-only marker; fixtures only, nothing is contacted. */
function serverModules(t: TestContext, env: Record<string, string> = {}) {
  const nodeModule = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const load = nodeModule._load;
  for (const [key, value] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: "https://fixture.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key", SUPABASE_SERVICE_ROLE_KEY: "fixture-key", OPENAI_API_KEY: "unused-fixture-key", ...env })) {
    const before = process.env[key];
    process.env[key] = key in env ? value : before ?? value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    return name === "server-only" ? {} : load.call(this, name, ...args);
  });
}

type FakeCall = { table: string; op: "select" | "update"; patch?: Record<string, unknown>; filters: unknown[][] };

/** Supabase-shaped fake: every chain ends in `respond(call)`; calls are recorded in order. */
function fakeAdmin(respond: (call: FakeCall) => unknown) {
  const calls: FakeCall[] = [];
  const admin = {
    from(table: string) {
      const call: FakeCall = { table, op: "select", filters: [] };
      const finish = () => { calls.push(call); return Promise.resolve({ data: respond(call), error: null, count: 0 }); };
      const builder: object = new Proxy({}, {
        get(_target, key) {
          if (key === "then") return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => finish().then(resolve, reject);
          if (key === "maybeSingle" || key === "single") return finish;
          return (...args: unknown[]) => {
            if (key === "update") { call.op = "update"; call.patch = args[0] as Record<string, unknown>; }
            else if (!["select", "returns", "limit", "order"].includes(String(key))) call.filters.push([String(key), ...args]);
            return builder;
          };
        },
      });
      return builder;
    },
  };
  return { admin: admin as never, calls };
}

test("only the first open of an invitation is kept; other emails pass through", async (t) => {
  serverModules(t);
  const { ingestExternalInviteOpenedEvent } = await import("./externalInvite.server");
  const rows = new Map<string, { id: string; opened_at: string | null }>([["em_1", { id: "r1", opened_at: null }]]);
  const updates: unknown[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: (_c: string, emailId: string) => ({ maybeSingle: async () => ({ data: rows.get(emailId) ?? null, error: null }) }) }),
      update: (patch: { opened_at: string }) => ({ eq: () => ({ is: async () => {
        updates.push(patch); rows.get("em_1")!.opened_at = patch.opened_at; return { error: null };
      } }) }),
    }),
  } as never;
  const opened = (emailId: string, at: string) => ({ type: "email.opened", created_at: at, data: { email_id: emailId } });
  assert.deepEqual(await ingestExternalInviteOpenedEvent({ admin, event: opened("em_other", "2026-11-02T10:00:00Z") }), { handled: false });
  assert.deepEqual(await ingestExternalInviteOpenedEvent({ admin, event: opened("em_1", "2026-11-02T10:00:00Z") }), { handled: true, firstOpen: true });
  assert.deepEqual(await ingestExternalInviteOpenedEvent({ admin, event: opened("em_1", "2026-11-02T11:00:00Z") }), { handled: true, firstOpen: false });
  assert.deepEqual(updates, [{ opened_at: "2026-11-02T10:00:00.000Z" }]);
});

const candidateRow = (intro: Record<string, unknown> | null, companyDecision: string | null = intro ? "intro_requested" : null) => ({
  id: "c1", name: "Ada Kim", headline: null, current_company: null, location: null, linkedin_url: null, career_lines: [],
  evidence: [], verdict: {}, rank: 1, company_decision: companyDecision, role_id: "r1", run_id: "run1",
  created_at: "2026-11-02T00:00:00Z", run: { trigger: "company_request" },
  contact: { status: "found", email_kind: "work", source_kind: "self_published", finished_at: "2026-11-02T00:00:00Z" },
  intro: intro ? { created_at: "2026-11-02T01:00:00Z", ...intro } : null,
});

test("Pass works in every state; an invitation that has not gone out is cancelled", async (t) => {
  serverModules(t);
  const { passExternalCandidate } = await import("./externalSourcing.server");
  const args = { workspaceId: "w1", roleId: "r1", userId: "u1", candidateRef: "c1", reason: "다른 방향" };
  const run = async (row: ReturnType<typeof candidateRow>) => {
    const fake = fakeAdmin((call) => call.op === "select" ? [row] : { id: "x" });
    return { result: await passExternalCandidate({ admin: fake.admin, ...args }), updates: fake.calls.filter((call) => call.op === "update") };
  };

  const requested = await run(candidateRow({ status: "requested" }));
  assert.deepEqual(requested.result, { status: "passed", inviteCancelled: true });
  assert.equal(requested.updates[0].table, "external_candidates");
  assert.equal(requested.updates[0].patch?.company_decision, "passed");
  assert.deepEqual(requested.updates[0].filters.at(-1), ["or", "company_decision.is.null,company_decision.eq.intro_requested"]);
  assert.equal(requested.updates[1].table, "external_intro_requests");
  assert.deepEqual(requested.updates[1].patch && { status: requested.updates[1].patch.status, error_code: requested.updates[1].patch.error_code },
    { status: "cancelled", error_code: "company_passed" });
  assert.deepEqual(requested.updates[1].filters.at(-1), ["eq", "status", "requested"]);

  for (const intro of [{ status: "invited" }, { status: "replied", reply_type: "interested" }, null]) {
    const other = await run(candidateRow(intro));
    assert.deepEqual(other.result, { status: "passed" });
    assert.deepEqual(other.updates.map((call) => call.table), ["external_candidates"]);
  }
  const already = await run(candidateRow(null, "passed"));
  assert.deepEqual(already.result, { status: "unchanged" });
  assert.equal(already.updates.length, 0);
});

test("the dispatcher never emails a person the company passed, even on a retry", async (t) => {
  serverModules(t, { ORG_EXTERNAL_INVITE_SENDING: "on", ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" });
  const { dispatchExternalInvites } = await import("./externalInvite.server");
  const claimed = { id: "q1", status: "sending", attempt_count: 2, external_candidate_id: "c1", company_workspace_id: "w1",
    role_id: "r1", requested_by: "u1", company_appeal: "x", created_at: "2026-11-02T00:00:00Z",
    result: { delivery: { to: "ada@example.com", subject: "s" } } };
  const fake = fakeAdmin((call) => {
    if (call.table === "external_intro_requests" && call.op === "select") return [{ id: "q1", status: "sending", attempt_count: 1, company_workspace_id: "w1" }];
    if (call.table === "external_intro_requests" && call.op === "update") return call.patch?.status === "sending" ? claimed : null;
    if (call.table === "external_candidates") return { id: "c1", name: "Ada Kim", location: null, linkedin_url: null, company_decision: "passed" };
    if (call.table === "external_candidate_contacts") return { status: "found", email: "ada@example.com" };
    if (call.table === "company_roles") return { name: "Product Engineer", status: "active", is_expired: false };
    return null;
  });
  let sent = 0;
  const result = await dispatchExternalInvites({ admin: fake.admin, now: new Date("2026-11-02T01:00:00Z"),
    send: (async () => { sent += 1; return { id: "em_1" }; }) as never });
  assert.equal(sent, 0);
  assert.deepEqual(result, { outcomes: { cancelled: 1 } });
  const release = fake.calls.filter((call) => call.table === "external_intro_requests" && call.op === "update").at(-1);
  assert.equal(release?.patch?.status, "cancelled");
  assert.equal(release?.patch?.error_code, "company_passed");
});

test("test mode sends only to listed addresses; unset means everyone", () => {
  const env = { ORG_EXTERNAL_INVITE_ALLOWED_RECIPIENTS: " Test1@Example.com, test2@example.com ," };
  assert.equal(externalInviteRecipientAllowed("test1@example.com", env), true);
  assert.equal(externalInviteRecipientAllowed("someone@company.com", env), false);
  assert.equal(externalInviteRecipientAllowed("someone@company.com", {}), true);
});

test("in test mode a real person's invitation is not sent, even with its payload already fixed", async (t) => {
  serverModules(t, { ORG_EXTERNAL_INVITE_SENDING: "on", ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*",
    ORG_EXTERNAL_INVITE_ALLOWED_RECIPIENTS: "test1@example.com" });
  const { dispatchExternalInvites } = await import("./externalInvite.server");
  const claimed = { id: "q1", status: "sending", attempt_count: 2, external_candidate_id: "c1", company_workspace_id: "w1",
    role_id: "r1", requested_by: "u1", company_appeal: "x", created_at: "2026-11-02T00:00:00Z",
    result: { delivery: { to: "someone@company.com", subject: "s" } } };
  const fake = fakeAdmin((call) => {
    if (call.table === "external_intro_requests" && call.op === "select") return [{ id: "q1", status: "sending", attempt_count: 1, company_workspace_id: "w1" }];
    if (call.table === "external_intro_requests" && call.op === "update") return call.patch?.status === "sending" ? claimed : null;
    if (call.table === "external_candidates") return { id: "c1", name: "Ada Kim", location: null, linkedin_url: null, company_decision: "intro_requested" };
    if (call.table === "external_candidate_contacts") return { status: "found", email: "someone@company.com", source_url: null };
    if (call.table === "company_roles") return { name: "Product Engineer", status: "active", is_expired: false };
    return null;
  });
  let sent = 0;
  const result = await dispatchExternalInvites({ admin: fake.admin, now: new Date("2026-11-02T01:00:00Z"),
    send: (async () => { sent += 1; return { id: "em_1" }; }) as never });
  assert.equal(sent, 0);
  assert.deepEqual(result, { outcomes: { not_sendable: 1 } });
  const release = fake.calls.filter((call) => call.table === "external_intro_requests" && call.op === "update").at(-1);
  assert.equal(release?.patch?.error_code, "test_recipients_only");
});

test("the invitation names the address's site only when that page showed the address", async (t) => {
  serverModules(t, { ORG_EXTERNAL_INVITE_SENDING: "on", ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*" });
  const { dispatchExternalInvites } = await import("./externalInvite.server");
  const sendWith = async (contact: Record<string, unknown>) => {
    const claimed = { id: "q1", status: "sending", attempt_count: 1, external_candidate_id: "c1", company_workspace_id: "w1",
      role_id: "r1", requested_by: "u1", company_appeal: "x", created_at: "2026-11-02T00:00:00Z", result: {} };
    const fake = fakeAdmin((call) => {
      // The due list is read with .or(...); the 14-day "recently invited" read finds nobody.
      if (call.table === "external_intro_requests" && call.op === "select") {
        return call.filters.some(([key]) => key === "or") ? [{ id: "q1", status: "requested", attempt_count: 0, company_workspace_id: "w1" }] : [];
      }
      if (call.table === "external_intro_requests" && call.op === "update") return call.patch?.status === "sending" ? claimed : { id: "q1" };
      if (call.table === "external_candidates") return { id: "c1", name: "Ada Kim", location: null, linkedin_url: null, company_decision: "intro_requested" };
      if (call.table === "external_candidate_contacts") return { status: "found", email: "ada@example.com", ...contact };
      if (call.table === "company_roles") return { name: "Product Engineer", status: "active", is_expired: false };
      return null;
    });
    const sent: { text: string }[] = [];
    await dispatchExternalInvites({ admin: fake.admin, now: new Date("2026-11-02T01:00:00Z"),
      send: (async (delivery: { text: string }) => { sent.push(delivery); return { id: "em_1" }; }) as never });
    assert.equal(sent.length, 1);
    return sent[0].text;
  };
  // A contact record keyed to a LinkedIn profile, the address not on that page: no site is named.
  const unconfirmed = await sendWith({ source_url: "https://www.linkedin.com/in/ada", source_kind: "unverified" });
  assert.match(unconfirmed, /We found this email address through a web search and your career details/);
  assert.doesNotMatch(unconfirmed, /linkedin/i);
  const published = await sendWith({ source_url: "https://www.ada.dev/about", source_kind: "self_published" });
  assert.match(published, /We found this email address on ada\.dev and your career details/);
});
