import assert from "node:assert/strict";
import test from "node:test";
import { executeConnectedGmailSearch } from "./gmail";
import { CAREER_INTERVIEW_EMAIL_QUERY } from "@/lib/career/background/inbox";

function setup(
  t: any,
  options: { accountOwner?: string; scope?: string; disconnect?: boolean } = {}
) {
  const oldKey = process.env.COMPOSIO_API_KEY,
    oldConfig = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  process.env.COMPOSIO_API_KEY = "synthetic";
  process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = "config";
  t.after(() => {
    for (const [key, value] of [
      ["COMPOSIO_API_KEY", oldKey],
      ["COMPOSIO_GMAIL_AUTH_CONFIG_ID", oldConfig],
    ]) {
      if (value === undefined) delete process.env[key!];
      else process.env[key!] = value;
    }
  });
  let reads = 0;
  const requests: any[] = [];
  const admin: any = {
    from(table: string) {
      assert.equal(table, "talent_integrations");
      const q: any = {
        select: () => q,
        eq: () => q,
        update: () => q,
        maybeSingle: async () => ({
          data:
            options.disconnect && ++reads > 1
              ? null
              : {
                  composio_connected_account_id: "ca_fixture",
                  status: "active",
                },
          error: null,
        }),
        then: (resolve: any) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return q;
    },
  };
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(String(url).startsWith("https://backend.composio.dev/"));
    if (init.method === "GET" || !init.method)
      return Response.json({
        id: "ca_fixture",
        user_id: options.accountOwner ?? "owner",
        toolkit: { slug: "gmail" },
        auth_config: { id: "config" },
        status: "ACTIVE",
        data: {
          scope:
            options.scope ?? "https://www.googleapis.com/auth/gmail.readonly",
        },
      });
    const body = JSON.parse(String(init.body));
    requests.push({ url, body });
    return Response.json({
      data: {
        messages: [
          {
            id: "mail-1",
            threadId: "thread-1",
            from: "recruiter@example.test",
            subject: "Changed time",
            messageText: "Updated to Tuesday.",
            internalDate: "1893888000000",
          },
        ],
        nextPageToken: String(url).includes("FETCH_EMAILS")
          ? "page-2"
          : undefined,
      },
      successful: true,
    });
  });
  return { admin, requests };
}

test("Gmail discovery and exact thread use the owned account through the production adapter", async (t) => {
  const { admin, requests } = setup(t);
  const result = await executeConnectedGmailSearch({
    admin,
    talentId: "owner",
    query: CAREER_INTERVIEW_EMAIL_QUERY,
    maxResults: 50,
    includeContent: false,
    pageToken: "page-1",
  });
  assert.equal(result.status, "ok");
  assert.equal(result.nextPageToken, "page-2");
  assert.deepEqual(requests[0].body.arguments, {
    query: CAREER_INTERVIEW_EMAIL_QUERY,
    max_results: 50,
    include_payload: false,
    page_token: "page-1",
    user_id: "me",
  });
  const thread = await executeConnectedGmailSearch({
    admin,
    talentId: "owner",
    query: CAREER_INTERVIEW_EMAIL_QUERY,
    threadId: "thread-1",
    maxResults: 1,
    includeContent: false,
  });
  assert.equal(thread.emails[0].content, "Updated to Tuesday.");
  assert.ok(requests[1].url.endsWith("GMAIL_FETCH_MESSAGE_BY_THREAD_ID"));
  assert.deepEqual(requests[1].body.arguments, {
    thread_id: "thread-1",
    user_id: "me",
  });
});

test("foreign accounts and missing grants do not execute a Gmail read", async (t) => {
  for (const options of [
    { accountOwner: "other" },
    { scope: "https://www.googleapis.com/auth/gmail.send" },
  ]) {
    await t.test(
      options.accountOwner ? "foreign account" : "missing read permission",
      async (child) => {
        const { admin, requests } = setup(child, options);
        const result = await executeConnectedGmailSearch({
          admin,
          talentId: "owner",
          query: CAREER_INTERVIEW_EMAIL_QUERY,
          maxResults: 50,
          includeContent: false,
        });
        assert.equal(
          result.status,
          options.accountOwner ? "connection_required" : "permissions_required"
        );
        assert.equal(requests.length, 0);
        assert.deepEqual(result.emails, []);
      }
    );
  }
});

test("a disconnect during the thread fetch discards the retrieved content", async (t) => {
  const { admin } = setup(t, { disconnect: true });
  const result = await executeConnectedGmailSearch({
    admin,
    talentId: "owner",
    query: "",
    threadId: "thread-1",
    maxResults: 50,
    includeContent: true,
  });
  assert.equal(result.status, "connection_required");
  assert.deepEqual(result.emails, []);
  assert.ok(!result.modelOutput?.includes("Tuesday"));
});
