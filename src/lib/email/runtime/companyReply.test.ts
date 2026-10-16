import assert from "node:assert/strict";
import Module from "node:module";
import { after, before, test } from "node:test";
import { hashReplyToken } from "../security";

let runtime: typeof import("./companyReply");
let outbound: typeof import("../company");
let tables: Record<string, any[]>;
let account: any;
let generated = 0;
let sent: any[] = [];
let failSend = false;
let revokeAfterGeneration = false;
let seenTurn: any;
let runChat: any;
const originalFetch = globalThis.fetch;
const mod = Module as any, originalLoad = mod._load;
const token = "abcdefghijklmnopqrstuvwx";
const address = `company+${token}@reply.matchharper.com`;
const convert = (row: any) => ({ ...row, conversationId: row.conversation_id, metadata: row.metadata ?? {} });

before(async () => {
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "unit", SUPABASE_SERVICE_ROLE_KEY: "unit", OPENAI_API_KEY: "unit", OPENROUTER_API_KEY: "unit", EMAIL_REPLY_TOKEN_SECRET: "unit", RESEND_API_KEY: "unit", EMAIL_REPLY_FROM_EMAIL: "harper@example.test" });
  mod._load = function(request: string, parent: any, isMain: boolean) {
    if (request === "server-only") return {};
    if (request === "@/lib/org/agent/store") return {
      ensureOrgAgentConversation: async () => ({ conversation: { id: "conversation" } }),
      toOrgAgentMessage: convert,
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  runChat = async (args: any) => {
      generated++; seenTurn = args;
      await args.emailExecution.assertCanContinue();
      const row = { id: 2, role: "assistant", conversation_id: "conversation", status: "completed",
        content: "확인한 역할을 정리했어요. **다음 단계**는 이메일로 답해주세요.", metadata: args.assistantMessageMetadata };
      tables.company_messages.push(row);
      if (revokeAfterGeneration) tables.company_user_workspace = [];
      return { kind: "message", assistantMessage: convert(row) };
    };
  globalThis.fetch = (async (url: any, init: any) => {
    assert.match(String(url), /\/emails$/);
    sent.push(JSON.parse(init.body));
    if (failSend) throw new Error("temporary provider failure");
    return new Response(JSON.stringify({ id: "provider-id" }), { status: 200 });
  }) as typeof fetch;
  runtime = await import("./companyReply");
  outbound = await import("../company");
});
after(() => { mod._load = originalLoad; globalThis.fetch = originalFetch; });

function fixture() {
  generated = 0; sent = []; failSend = false; revokeAfterGeneration = false;
  account = { id: "company-user", email: "team@example.test", email_confirmed_at: "2026-01-01" };
  tables = {
    company_users: [{ user_id: account.id, email: account.email, locale: "ko" }],
    company_user_workspace: [{ company_user_id: account.id, company_workspace_id: "workspace", authority: "owner", access_scope: "organization" }],
    email_reply_aliases: [{ id: "alias", token_hash: hashReplyToken(token), company_user_id: account.id,
      company_workspace_id: "workspace", company_conversation_id: "conversation", metadata: { recipient: account.email, originalEmail: { subject: "채용", body: "현재 역할을 검토해보세요." } } }],
    email_reply_jobs: [{ id: "job", status: "processing", locked_by: "owner", worker_target: "vercel_queue", metadata: { companyEmail: true } }],
    company_messages: [],
  };
  const admin: any = {
    auth: { admin: { getUserById: async () => ({ data: { user: account }, error: null }) } },
    from(table: string) {
      assert.notEqual(table, "talent_users", "company mail must never resolve the talent account");
      let patch: any;
      const filters: Array<(row: any) => boolean> = [];
      const result = () => {
        const rows = (tables[table] ?? []).filter(row => filters.every(fn => fn(row)));
        if (patch) rows.forEach(row => Object.assign(row, patch));
        return { data: rows[0] ?? null, error: null };
      };
      return {
        select() { return this; },
        eq(k: string, v: any) { filters.push(row => (k.startsWith("metadata->>") ? row.metadata?.[k.slice(11)] : row[k]) === v); return this; },
        insert(value: any) { (tables[table] ??= []).push({ id: `new-${tables[table].length}`, ...value }); return this; },
        contains(k: string, v: any) { filters.push(row => Object.entries(v).every(([key, value]) => row[k]?.[key] === value)); return this; },
        update(value: any) { patch = value; return this; },
        maybeSingle: async () => result(),
        then(resolve: any, reject: any) { return Promise.resolve(result()).then(resolve, reject); },
      };
    },
    async rpc() {
      const existing = tables.company_messages.find(row => row.role === "user");
      const row = existing ?? { id: 1, role: "user", status: "completed", conversation_id: "conversation", company_user_id: "company-user", content: "역할을 알려주세요", metadata: { emailReplyJobId: "job" } };
      if (!existing) tables.company_messages.push(row);
      return { data: row, error: null };
    },
  };
  return { admin, job: tables.email_reply_jobs[0], owner: "owner", inbound: { message_id: "<inbound>" },
    received: { reply_to: "attacker@example.test", message_id: "<inbound>", headers: { References: "<original>" }, attachments: [{ filename: "role.pdf", contentType: "application/pdf" }] },
    body: "역할을 알려주세요", subject: "Re: 채용", sender: account.email, recipients: [address], fullBody: "역할을 알려주세요\n\n> 과거 메일" } as any;
}

test("company replies keep sender, thread and outbound context; send failure reuses saved response", async () => {
  const args = fixture(); failSend = true;
  await assert.rejects(runtime.processCompanyEmailReply(args, { runChat }), /temporary provider failure/);
  assert.equal(generated, 1);
  assert.match(seenTurn.llmUserMessage, /현재 역할을 검토해보세요/);
  assert.match(seenTurn.message, /contents not loaded/);
  failSend = false;
  await runtime.processCompanyEmailReply(args, { runChat });
  assert.equal(generated, 1);
  assert.equal(sent[1].to[0], "team@example.test");
  assert.equal(sent[1].reply_to, address);
  assert.equal(sent[1].headers["In-Reply-To"], "<inbound>");
  assert.equal(sent[1].headers.References, "<original> <inbound>");
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(args.job.status, "sent");
  assert.equal(args.job.resend_email_id, "provider-id");
});

test("company aliases reject forwarding, expiry, ambiguity and revoked membership", async () => {
  const args = fixture();
  await assert.rejects(runtime.resolveCompanyEmailAlias(args.admin, [address], "other@example.test"), /recipient_mismatch/);
  await assert.rejects(runtime.resolveCompanyEmailAlias(args.admin, [address, address.replace(token, "zyxwvutsrqponmlk")], args.sender), /ambiguous/);
  await assert.rejects(runtime.resolveCompanyEmailAlias(args.admin, [address, `reply+${token}@reply.matchharper.com`], args.sender), /mixed_company_talent/);
  tables.email_reply_aliases[0].expires_at = "2020-01-01";
  await assert.rejects(runtime.resolveCompanyEmailAlias(args.admin, [address], args.sender), /expired/);
  tables.email_reply_aliases[0].expires_at = null;
  tables.company_user_workspace = [];
  await assert.rejects(runtime.processCompanyEmailReply(args, { runChat }), /membership_revoked/);
  assert.equal(generated, 0); assert.equal(sent.length, 0);
});

test("authorization is rechecked after generation, but delivered checkpoints finalize without re-sending", async () => {
  const args = fixture(); revokeAfterGeneration = true;
  await assert.rejects(runtime.processCompanyEmailReply(args, { runChat }), /membership_revoked/);
  assert.equal(sent.length, 0);
  args.job.resend_email_id = "already-sent";
  args.job.metadata.delivery = { to: args.sender };
  await runtime.finishCompanyEmailReply(args.admin, args.job, args.owner);
  assert.equal(args.job.status, "sent"); assert.equal(sent.length, 0);
});


test("outbound retries retain the same route and reject changed message identity", async () => {
  const { admin } = fixture();
  const args = { admin, userId: "company-user", workspaceId: "workspace", subject: "채용", body: "역할을 검토해보세요", idempotencyKey: "outbound-event-1" };
  const first = await outbound.createCompanyEmailReplyAlias(args);
  assert.deepEqual(await outbound.createCompanyEmailReplyAlias(args), first);
  assert.equal(tables.email_reply_aliases.length, 2);
  await assert.rejects(outbound.createCompanyEmailReplyAlias({ ...args, body: "바뀐 메일" }), /identity_changed/);
});
