import test from "node:test";
import assert from "node:assert/strict";
import { executeWriteEmail } from "./tool";
import { getComposioGmailWriteAccess } from "@/lib/integrations/composio";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
const userId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000002";
function database(connected = true) {
  const operations: Record<string, unknown>[] = [];
  const admin = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      let row = operations.find(
        (op) => op.idempotency_key === args.p_idempotency_key
      );
      if (!row) {
        row = {
          id: `00000000-0000-4000-8000-${String(operations.length + 3).padStart(12, "0")}`,
          user_id: userId,
          conversation_id: conversationId,
          parent_id: null,
          kind: args.p_kind,
          idempotency_key: args.p_idempotency_key,
          status: "reserved",
          revision: 1,
          request: args.p_request,
          result: {},
          provider_refs: {},
          created_at: "2026-10-29T00:00:00Z",
          updated_at: "2026-10-29T00:00:00Z",
        };
        operations.push(row);
      }
      return { data: { ...row }, error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      let change: Record<string, unknown> | undefined;
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return chain;
        },
        in: () => chain,
        update: (value: Record<string, unknown>) => {
          change = value;
          return chain;
        },
        maybeSingle: async () => {
          if (table === "talent_messages") return {data:{payload:{}},error:null};
          if (table === "talent_users") return {data:{deleted_at:null},error:null};
          if (table === "talent_integrations")
            return {
              data: connected ? {
                composio_connected_account_id: "ca_fixture",
                status: "active",
              } : null,
              error: null,
            };
          const row = operations.find((op) =>
            Object.entries(filters).every(([k, v]) => op[k] === v)
          );
          if (row && change) Object.assign(row, change);
          return { data: row ? { ...row } : null, error: null };
        },
      };
      return chain;
    },
  };
  return { admin: admin as unknown as TalentAdminClient, operations };
}
test("Gmail permissions distinguish drafting, reading and direct sending", () => {
  const send = {
    grantedScopes: ["https://www.googleapis.com/auth/gmail.send"],
  };
  assert.equal(getComposioGmailWriteAccess(send, "send"), "granted");
  assert.equal(getComposioGmailWriteAccess(send, "draft"), "missing");
  assert.equal(
    getComposioGmailWriteAccess(
      { grantedScopes: ["https://www.googleapis.com/auth/gmail.compose"] },
      "read_draft"
    ),
    "granted"
  );
  assert.equal(getComposioGmailWriteAccess({}), "unknown");
});
for(const changed of [false,true])test(`reply uses the actual provider thread; changed before dispatch=${changed}`,async t=>{
  process.env.COMPOSIO_API_KEY="fixture-key";process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID="fixture-auth";
  const db=database();let sends=0,reads=0;
  const message=(id:string,date:string)=>({id,threadId:'thread-actual',internalDate:date,payload:{headers:[{name:'Subject',value:'Original subject'},{name:'Message-ID',value:`<${id}@example.test>`}]}});
  t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
    if(url.endsWith('/connected_accounts/ca_fixture'))return Response.json({id:'ca_fixture',user_id:userId,toolkit:{slug:'gmail'},auth_config:{id:'fixture-auth'},status:'ACTIVE',data:{scope:'https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.readonly'}});
    const request=JSON.parse(String(init.body));
    if(url.endsWith('/tools/execute/GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID'))return Response.json({successful:true,data:message(request.arguments.message_id,'1794574800000')});
    if(url.endsWith('/tools/execute/GMAIL_FETCH_THREAD')){
      reads++;return Response.json({successful:true,data:{messages:[message('incoming','1794574800000'),...(changed&&reads>1?[message('newer','1794574900000')]:[])]}});
    }
    assert.ok(url.endsWith('/tools/execute/GMAIL_REPLY_TO_THREAD'));sends++;
    assert.equal(request.arguments.thread_id,'thread-actual');assert.equal(request.arguments.message_body,'Exact reply');
    assert.equal(request.arguments.subject,undefined);assert.equal(request.version,'20261105_00');
    return Response.json({successful:true,data:{id:'sent-reply',threadId:'thread-actual'}});
  });
  const result=await executeWriteEmail({to:['founder@example.test'],subject:'Not a fabricated Re: subject',body:'Exact reply',reply_to_message_ref:{kind:'email_message',id:'ca_fixture/incoming'}},
    {admin:db.admin,userId,conversationId,requestId:'reply-call',userMessageId:42});
  assert.equal(sends,changed?0:1);assert.equal(result.status,changed?'failed':'succeeded');
  const receipt=db.operations[0].provider_refs as Record<string,unknown>;
  if(!changed){assert.equal(receipt.thread_id,'thread-actual');assert.equal(receipt.rfc_message_id,'<sent-reply@example.test>');}
});
test("a frozen direct-send snapshot is idempotent across different tool calls and never adds a signature", async (t) => {
  process.env.COMPOSIO_API_KEY = "fixture-key";
  process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = "fixture-auth";
  const db = database();
  let sends = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url.endsWith("/connected_accounts/ca_fixture"))
      return Response.json({
        id: "ca_fixture",
        user_id: userId,
        toolkit: { slug: "gmail" },
        auth_config: { id: "fixture-auth" },
        status: "ACTIVE",
        data: { scope: "https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.readonly" },
      });
    if(url.endsWith("/tools/execute/GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID"))return Response.json({successful:true,data:{id:"gmail-message-1",threadId:"thread-1",payload:{headers:[{name:"Message-ID",value:"<sent@example.test>"}]}}});
    assert.ok(url.endsWith("/tools/execute/GMAIL_SEND_EMAIL"));
    sends++;
    const request = JSON.parse(String(init.body));
    assert.equal(request.arguments.include_signature, false);
    assert.equal(request.arguments.body, "Exact body\nsecond line");
    assert.equal(request.arguments.recipient_email, "person@example.test");
    assert.deepEqual(request.arguments.cc, []);
    assert.deepEqual(request.arguments.bcc, []);
    assert.equal(request.version, "20261029_00");
    return Response.json({ successful: true, data: { id: "gmail-message-1" } });
  });
  const input = {
    to: ["person@example.test"],
    subject: "Application",
    body: "Exact body\nsecond line",
  };
  const first = await executeWriteEmail(input, {
    admin: db.admin,
    userId,
    conversationId,
    requestId: "call-1",
    userMessageId: 42,
  });
  const second = await executeWriteEmail(input, {
    admin: db.admin,
    userId,
    conversationId,
    requestId: "call-2",
    userMessageId: 42,
  });
  assert.equal(first.status, "succeeded");
  assert.equal(second.status, "succeeded");
  assert.equal(sends, 1);
  assert.match(first.modelOutput, /Gmail accepted the email/);
  assert.deepEqual(db.operations[0].provider_refs, {
    account_id: "ca_fixture", message_id: "gmail-message-1",
    thread_id:"thread-1",requested_thread_id:null,account_generation:"",
    rfc_message_id:"<sent@example.test>",in_reply_to:null,references:null,
  });
  assert.doesNotMatch(first.modelOutput,/fixture-key/);
  assert.match(first.modelOutput,/gmail-message-1/);
  assert.match(first.modelOutput,/thread-1/);
  const { serializeCareerToolResultForModel } = await import("../llm");
  assert.equal(serializeCareerToolResultForModel(first), first.modelOutput);
  const laterRequest = await executeWriteEmail(input, {
    admin: db.admin, userId, conversationId, userMessageId: 43,
    requestId: "later-user-request",
  });
  assert.equal(laterRequest.status, "succeeded");
  assert.equal(sends, 2);
});
test("ambiguous Gmail send remains uncertain and is never replayed", async (t) => {
  process.env.COMPOSIO_API_KEY = "fixture-key";
  process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = "fixture-auth";
  let sends = 0;
  const db = database();
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("connected_accounts"))
      return Response.json({
        id: "ca_fixture",
        user_id: userId,
        toolkit: { slug: "gmail" },
        auth_config: { id: "fixture-auth" },
        status: "ACTIVE",
        data: { scope: "https://www.googleapis.com/auth/gmail.send" },
      });
    sends++;
    throw new Error("connection lost after delivery");
  });
  const input = {
    to: ["person@example.test"],
    cc: [],
    bcc: [],
    subject: "Exact subject",
    body: "Exact body",
  };
  const first = await executeWriteEmail(input, {
    admin: db.admin,
    userId,
    conversationId,
    requestId: "call-1",
    userMessageId: 42,
  });
  const second = await executeWriteEmail(input, {
    admin: db.admin,
    userId,
    conversationId,
    requestId: "call-2",
    userMessageId: 42,
  });
  assert.equal(first.status, "uncertain");
  assert.equal(second.status, "uncertain");
  assert.equal(sends, 1);
  const { serializeCareerToolResultForModel } = await import("../llm");
  assert.equal(serializeCareerToolResultForModel(first), first.modelOutput);
});

test("Stop after Gmail dispatch retains the confirmed send instead of reporting cancellation", async (t) => {
  process.env.COMPOSIO_API_KEY = "fixture-key";
  process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = "fixture-auth";
  const db = database(), controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("connected_accounts")) return Response.json({
      id: "ca_fixture", user_id: userId, toolkit: { slug: "gmail" }, auth_config: { id: "fixture-auth" },
      status: "ACTIVE", data: { scope: "https://www.googleapis.com/auth/gmail.send" },
    });
    assert.ok(url.endsWith("/tools/execute/GMAIL_SEND_EMAIL"));
    controller.abort(new DOMException("User stopped", "AbortError"));
    return Response.json({ successful: true, data: { id: "confirmed-message" } });
  });
  const result = await executeWriteEmail({ to: ["person@example.test"],
    subject: "Requested subject", body: "Requested body" },
    { admin: db.admin, userId, conversationId, requestId: "stop-during-send", signal: controller.signal });
  assert.equal(controller.signal.aborted, true);
  assert.equal(result.status, "succeeded");
  assert.match(result.modelOutput, /Gmail accepted the email/);
  assert.deepEqual(db.operations[0].provider_refs, {
    account_id: "ca_fixture", message_id: "confirmed-message",
    account_generation:"",thread_id:null,requested_thread_id:null,
  });
});
test("obsolete draft actions cannot silently become email sends", async (t) => {
  const db = database();
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw new Error("No provider request expected");
  });
  for (const action of ["create_draft", "update_draft", "read_draft"])
    await assert.rejects(executeWriteEmail({
      action, to: ["person@example.test"], subject: "Draft", body: "Unsent text",
    }, { admin: db.admin, userId, conversationId, requestId: action }));
  assert.equal(requests, 0);
  assert.equal(db.operations.length, 0);
});

test("disconnected Gmail returns its availability without attempting a send", async (t) => {
  const db = database(false);
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    throw new Error("No provider request expected");
  });
  const result = await executeWriteEmail({
    to: ["person@example.test"], subject: "Subject", body: "Body",
  }, { admin: db.admin, userId, conversationId, requestId: "disconnected" });
  assert.equal(result.status, "connection_required");
  assert.equal(requests, 0);
  assert.equal(db.operations.length, 0);
});

test("a connected read-only Gmail account cannot send", async (t) => {
  process.env.COMPOSIO_API_KEY = "fixture-key";
  process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = "fixture-auth";
  const db = database();
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.ok(url.endsWith("/connected_accounts/ca_fixture"));
    return Response.json({
      id: "ca_fixture", user_id: userId, toolkit: { slug: "gmail" },
      auth_config: { id: "fixture-auth" }, status: "ACTIVE",
      data: { scope: "https://www.googleapis.com/auth/gmail.readonly" },
    });
  });
  const result = await executeWriteEmail({
    to: ["person@example.test"], subject: "Subject", body: "Body",
  }, { admin: db.admin, userId, conversationId, requestId: "read-only" });
  assert.equal(result.status, "permissions_required");
  assert.equal(db.operations.length, 0);
});

test("Gmail file uploads preserve exact bytes and honor the provider's Azure upload contract", async (t) => {
  const { createComposioClient } = await import("@/lib/integrations/composio");
  process.env.COMPOSIO_API_KEY = "fixture-key";
  let requestCount = 0;
  const provider = createComposioClient({
    fetch: (async (url: string, init: RequestInit) => {
      requestCount++;
      if (url.endsWith("/files/upload/request")) {
        const body = JSON.parse(String(init.body));
        assert.equal(body.tool_slug, "GMAIL_SEND_EMAIL");
        assert.equal(body.mimetype, "application/pdf");
        assert.equal(body.md5.length, 32);
        return Response.json({
          key: "private-object-key",
          new_presigned_url: "https://upload.example.test/signed",
          metadata: { storage_backend: "azure_blob_storage" },
        });
      }
      assert.equal(init.method, "PUT");
      assert.equal(
        (init.headers as Record<string, string>)["x-ms-blob-type"],
        "BlockBlob"
      );
      assert.deepEqual(
        Buffer.from(init.body as Uint8Array),
        Buffer.from("pdf-bytes")
      );
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });
  const file = await provider.uploadGmailFile({
    name: "resume.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("pdf-bytes"),
    toolSlug: "GMAIL_SEND_EMAIL",
  });
  assert.equal(requestCount, 2);
  assert.deepEqual(file, {
    name: "resume.pdf",
    mimetype: "application/pdf",
    s3key: "private-object-key",
  });
});
