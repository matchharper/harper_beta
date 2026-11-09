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
  renderExternalConnectEmail,
  renderExternalConnectLinkReply,
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
    unsubscribeUrl: "https://matchharper.com/api/email/external-unsubscribe?t=tok", addressSource: "people-data.example",
    connectUrl: "https://matchharper.com/api/email/external-connect?t=acc" };
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
    summary: "Asks about remote work", fromInvitedAddress: false, person: { ref: "c-1", name: "Ada Kim", linkedinUrl: null },
    connectLinkSent: true });
  assert.equal(facts.externalReply.type, "question");
  assert.equal(facts.candidateState.replyFromAnotherAddress, true);
  assert.equal(facts.candidateState.harperAnsweredThePerson, false);
  // Only the person connects, from the invitation's link; neither a reply nor the company can.
  assert.match(facts.candidateState.connection, /^not connected\. Only the person can connect, by confirming the link in Harper's invitation/);
  // C (11/3) asked about salary and Harper offered to relay the company's answer: it cannot.
  assert.match(facts.candidateState.messagesToThePerson, /^Harper cannot pass the company's answers or any other message to the person/);
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

type FakeCall = { table: string; op: "select" | "update" | "rpc"; patch?: Record<string, unknown>; filters: unknown[][] };

/** Supabase-shaped fake: every chain ends in `respond(call)`; calls are recorded in order. */
function fakeAdmin(respond: (call: FakeCall) => unknown) {
  const calls: FakeCall[] = [];
  const admin = {
    rpc(name: string, params: Record<string, unknown>) {
      const call: FakeCall = { table: name, op: "rpc", patch: params, filters: [] };
      calls.push(call);
      return Promise.resolve({ data: respond(call), error: null });
    },
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
    const fake = fakeAdmin((call) => call.op === "select" ? [row] : call.op === "rpc" ? true : { id: "x" });
    return { result: await passExternalCandidate({ admin: fake.admin, ...args }), updates: fake.calls.filter((call) => call.op !== "select") };
  };

  const requested = await run(candidateRow({ status: "requested" }));
  assert.deepEqual(requested.result, { status: "passed", inviteCancelled: true });
  // The Pass and its decision record are one database call (only while undecided or requested).
  assert.equal(requested.updates[0].table, "set_external_candidate_company_decision_v1");
  assert.deepEqual(requested.updates[0].patch, { p_external_candidate_id: "c1", p_company_workspace_id: "w1",
    p_decision: "passed", p_actor_user_id: "u1", p_reason_text: "다른 방향", p_channel: "web" });
  assert.equal(requested.updates[1].table, "external_intro_requests");
  assert.deepEqual(requested.updates[1].patch && { status: requested.updates[1].patch.status, error_code: requested.updates[1].patch.error_code },
    { status: "cancelled", error_code: "company_passed" });
  assert.deepEqual(requested.updates[1].filters.at(-1), ["eq", "status", "requested"]);

  for (const intro of [{ status: "invited" }, { status: "replied", reply_type: "interested" }, null]) {
    const other = await run(candidateRow(intro));
    assert.deepEqual(other.result, { status: "passed" });
    assert.deepEqual(other.updates.map((call) => call.table), ["set_external_candidate_company_decision_v1"]);
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

test("the invitation carries the person's own connect link; the introduction names the company only when the Role does", () => {
  const invite = { personName: "김에이다", companyName: "Acme", roleName: "Product Engineer", companyAppeal: "Agent infra",
    unsubscribeUrl: "https://u.example", connectUrl: "https://matchharper.com/api/email/external-connect?t=acc", addressSource: null };
  const ko = renderExternalInvite({ ...invite, language: "ko" });
  assert.match(ko.body, /Harper가 Acme 담당자와 김에이다님을 이메일로 바로 연결해 드리고, 질문은 그 메일에서 담당자에게 직접 하시면 돼요\.\n\n\[연결하기\]\(https:\/\/matchharper\.com\/api\/email\/external-connect\?t=acc\)/);
  // A reply only reaches the company; the old promise of "next steps" from Harper is gone.
  assert.doesNotMatch(ko.body, /다음 단계를 안내해 드릴게요|회사에 전해 드릴게요/);
  // Questions and connecting both go through the link: Harper cannot relay the company's answers.
  assert.match(ko.body, /궁금한 점이 있거나 이야기를 나눠 보고 싶으시면 아래 연결하기를 눌러 주세요/);
  assert.match(ko.body, /질문은 그 메일에서 담당자에게 직접 하시면 돼요/);
  assert.match(renderExternalInvite({ ...invite, language: "en", personName: "Ada Kim" }).body, /\[Connect\]\(https:\/\/matchharper\.com/);

  const intro = { language: "ko" as const, personName: "김에이다", companyName: "Acme", roleName: "Product Engineer",
    companyAppeal: "Agent infra", linkedinUrl: "https://www.linkedin.com/in/ada",
    company: { linkedinUrl: "https://www.linkedin.com/company/acme", homepageUrl: "https://acme.example", contactName: "이하늘", contactTitle: "Head of Talent" } };
  const shown = renderExternalConnectEmail(intro);
  assert.equal(shown.subject, "김에이다님과 Acme Product Engineer 담당자를 연결해 드려요");
  assert.match(shown.body, /> Agent infra/);
  assert.match(shown.body, /김에이다님의 공개 프로필: https:\/\/www\.linkedin\.com\/in\/ada/);
  assert.match(shown.body, /Acme 소개: https:\/\/www\.linkedin\.com\/company\/acme · https:\/\/acme\.example/);
  assert.match(shown.body, /Acme 담당자: 이하늘 \(Head of Talent\)\n/);
  const hidden = renderExternalConnectEmail({ ...intro, companyName: null });
  assert.doesNotMatch(hidden.subject + hidden.body, /Acme|acme|이하늘/);
  assert.match(renderExternalConnectEmail({ ...intro, language: "en", personName: "Ada Kim" }).body, /Acme contact: 이하늘 \(Head of Talent\)/);

  const reply = renderExternalConnectLinkReply({ language: "ko", personName: "김에이다", companyName: "Acme", connectUrl: "https://c.example/x" });
  assert.match(reply, /\[연결하기\]\(https:\/\/c\.example\/x\)/);
  assert.match(reply, /담당자에게 이메일 주소가 전달돼요/);
});

const CONNECT_NOW = new Date("2026-11-03T06:00:00Z");
const CONNECT_TOKEN = "accepttoken0001";

/** One external_intro_requests row that updates follow (conditional on status), plus the rows around it. */
function connectFixture(setup: { row?: Record<string, unknown>; decision?: string | null; roleStatus?: string; anonymous?: boolean } = {}) {
  const row: Record<string, unknown> = {
    id: "q1", status: "invited", attempt_count: 1, external_candidate_id: "c1", company_workspace_id: "w1", role_id: "r1",
    requested_by: "u1", company_appeal: "Agent infra", created_at: "2026-11-02T00:00:00Z",
    result: { delivery: { subject: "Acme Product Engineer 포지션 관련해서 연락드려요", replyTo: "candidate+tok000000000@reply.matchharper.com" },
      connectUrl: "https://matchharper.com/api/email/external-connect?t=acc" },
    intro_recipient_emails: ["cto@acme.example", "ME@acme.example"], recipient_email: "ada@example.com",
    invited_at: "2026-11-02T01:00:00Z", accepted_at: null, connected_at: null, lease_expires_at: null, ...setup.row,
  };
  const fake = fakeAdmin((call) => {
    if (call.table === "external_intro_requests") {
      // The dispatcher's list of due introductions.
      if (call.op === "select" && call.filters.some(([key]) => key === "in")) return [{ ...row }];
      if (call.op === "update") {
        const status = call.filters.find(([key, column]) => key === "eq" && column === "status");
        if (status && status[2] !== row.status) return null;
        Object.assign(row, call.patch);
      }
      return { ...row };
    }
    if (call.table === "external_candidates") return { id: "c1", name: "김에이다", location: "Seoul, South Korea",
      linkedin_url: "https://www.linkedin.com/in/ada", company_decision: setup.decision ?? "intro_requested" };
    if (call.table === "external_candidate_contacts") return { status: "found", email: "ada@example.com", source_url: null, source_kind: "unverified" };
    if (call.table === "company_roles") return { name: "Product Engineer", status: setup.roleStatus ?? "active", is_expired: false };
    if (call.table === "company_internal_roles") return { is_anonymous: setup.anonymous === true };
    if (call.table === "company_workspace") return { company_name: "Acme", published_name: null,
      linkedin_url: "https://www.linkedin.com/company/acme", homepage_url: null };
    if (call.table === "company_users") return { name: "이하늘", email: "me@acme.example" };
    if (call.table === "company_user_workspace") return { role: "Head of Talent" };
    return null;
  });
  return { ...fake, row };
}

test("the person's confirmation connects them once: To the person, CC the requester and the chosen recipients", async (t) => {
  serverModules(t, { ORG_EXTERNAL_INVITE_ALLOWED_RECIPIENTS: "" });
  const { acceptExternalInvite, getExternalConnectView } = await import("./externalInvite.server");
  const fixture = connectFixture();
  const view = await getExternalConnectView({ admin: fixture.admin, token: CONNECT_TOKEN, now: CONNECT_NOW });
  assert.deepEqual(view, { state: "ready", language: "ko", personName: "김에이다", companyName: "Acme", roleName: "Product Engineer" });
  // Opening the page (or a mail scanner following the link) records nothing.
  assert.equal(fixture.calls.filter((call) => call.op === "update").length, 0);

  const sent: Array<Record<string, unknown>> = [];
  const notices: Array<Record<string, unknown>> = [];
  const deps = {
    send: (async (delivery: Record<string, unknown>) => { sent.push(delivery); return { id: "em_intro" }; }) as never,
    notify: (async (input: Record<string, unknown>) => { notices.push(input); return { jobId: "n1" }; }) as never,
  };
  const result = await acceptExternalInvite({ admin: fixture.admin, token: CONNECT_TOKEN, now: CONNECT_NOW, ...deps });
  assert.equal(result.state, "connected");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "ada@example.com");
  assert.deepEqual(sent[0].cc, ["me@acme.example", "cto@acme.example"]);
  assert.deepEqual(sent[0].replyTo, ["ada@example.com", "me@acme.example", "cto@acme.example"]);
  assert.equal(sent[0].idempotencyKey, "external-intro-connect/q1");
  assert.match(String(sent[0].text), /Acme 담당자: 이하늘 \(Head of Talent\)\n/);
  assert.equal(fixture.row.status, "connected");
  assert.equal(fixture.row.connect_email_id, "em_intro");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].eventKey, "external_invite:q1:connected");
  const facts = notices[0].facts as { candidateState: { introductionSent: boolean }; externalConnection: { companyRecipients: string[] } };
  assert.equal(facts.candidateState.introductionSent, true);
  assert.deepEqual(facts.externalConnection.companyRecipients, ["me@acme.example", "cto@acme.example"]);

  // A second click (or a refresh of the form) introduces nobody again.
  const again = await acceptExternalInvite({ admin: fixture.admin, token: CONNECT_TOKEN, now: CONNECT_NOW, ...deps });
  assert.equal(again.state, "connected");
  assert.equal(sent.length, 1);
});

test("nobody is connected after a Pass, a paused Role, an opt-out or 30 days", async (t) => {
  serverModules(t, { ORG_EXTERNAL_INVITE_ALLOWED_RECIPIENTS: "" });
  const { acceptExternalInvite } = await import("./externalInvite.server");
  const fail = (async () => { throw new Error("must not send"); }) as never;
  for (const [label, setup] of [
    ["company passed", { decision: "passed" }],
    ["role paused", { roleStatus: "paused" }],
    ["opted out", { row: { status: "unsubscribed" } }],
    ["link expired", { row: { invited_at: "2026-09-01T00:00:00Z" } }],
  ] as const) {
    const fixture = connectFixture(setup);
    const view = await acceptExternalInvite({ admin: fixture.admin, token: CONNECT_TOKEN, now: CONNECT_NOW, send: fail, notify: fail });
    assert.equal(view.state, "closed", label);
    assert.equal(fixture.calls.filter((call) => call.op === "update").length, 0, label);
  }
  assert.deepEqual(await acceptExternalInvite({ admin: fakeAdmin(() => null).admin, token: CONNECT_TOKEN, now: CONNECT_NOW, send: fail, notify: fail }),
    { state: "not_found" });
});

test("an interested reply gets the connect link once, in the invitation's thread", async (t) => {
  serverModules(t, { ORG_EXTERNAL_INVITE_ALLOWED_RECIPIENTS: "" });
  const { sendConnectLinkReply } = await import("./externalInvite.server");
  const fixture = connectFixture({ row: { status: "replied" } });
  const sent: Array<Record<string, unknown>> = [];
  const send = (async (delivery: Record<string, unknown>) => { sent.push(delivery); return { id: "em_reply" }; }) as never;
  const args = { admin: fixture.admin, requestId: "q1", headers: { "In-Reply-To": "<m1@mail>" }, now: CONNECT_NOW, send };
  assert.equal(await sendConnectLinkReply(args), "sent");
  assert.equal(sent[0].subject, "Re: Acme Product Engineer 포지션 관련해서 연락드려요");
  assert.equal(sent[0].replyTo, "candidate+tok000000000@reply.matchharper.com");
  assert.deepEqual(sent[0].headers, { "In-Reply-To": "<m1@mail>" });
  assert.match(String(sent[0].text), /연결하기 \(https:\/\/matchharper\.com\/api\/email\/external-connect\?t=acc\)/);
  assert.equal(await sendConnectLinkReply(args), "already_sent");
  assert.equal(sent.length, 1);
  // Nothing goes out once the company passed.
  const passed = connectFixture({ row: { status: "replied" }, decision: "passed" });
  assert.equal(await sendConnectLinkReply({ ...args, admin: passed.admin }), "not_connectable");
});


test("the introduction takes no further connection, and each cron run returns closed holds", async (t) => {
  serverModules(t, { ORG_EXTERNAL_INVITE_ALLOWED_RECIPIENTS: "", ORG_EXTERNAL_SOURCING_WORKSPACE_IDS: "*", EMAIL_REPLY_DRY_RUN: "" });
  const { acceptExternalInvite, dispatchExternalInvites } = await import("./externalInvite.server");
  const fixture = connectFixture();
  const admin = fixture.admin as unknown as { rpc: (name: string, params: Record<string, unknown>) => Promise<unknown> };
  const rpc = admin.rpc.bind(admin);
  const calls: Array<[string, Record<string, unknown>]> = [];
  admin.rpc = (name, params) => {
    calls.push([name, params]);
    return name === "return_closed_external_intro_holds_v1" ? Promise.resolve({ data: 0, error: null }) : rpc(name, params);
  };
  let failNext = true;
  const send = (async () => {
    if (failNext) { failNext = false; throw new Error("provider down"); }
    return { id: "em_intro" };
  }) as never;
  const notify = (async () => ({ jobId: "n1" })) as never;
  await acceptExternalInvite({ admin: fixture.admin, token: CONNECT_TOKEN, now: CONNECT_NOW, send, notify });
  assert.equal(fixture.row.status, "accepted");
  await dispatchExternalInvites({ admin: fixture.admin, now: new Date(CONNECT_NOW.getTime() + 60 * 60_000), send, notify });
  assert.equal(fixture.row.status, "connected");
  assert.equal(calls.some(([name]) => name === "workspace_billing_debit_v1"), false);
  assert.deepEqual(calls.filter(([name]) => name === "return_closed_external_intro_holds_v1").map(([, params]) => params),
    [{ p_link_valid: "30 days" }]);
});
