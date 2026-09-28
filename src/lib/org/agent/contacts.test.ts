import assert from "node:assert/strict";
import test from "node:test";
import { createClient, type User } from "@supabase/supabase-js";
import { listOrgAgentContacts, readOrgAgentContacts } from "./contacts";

const firstId = "00000000-0000-4000-8000-000000000501";
const secondId = "00000000-0000-4000-8000-000000000502";
const foreignId = "00000000-0000-4000-8000-000000000503";
const sent = "2026-09-24T03:00:00Z";
const user = { id: "company-user" } as User;
const workspaceId = "workspace";

function fixture(
  options: {
    denyAccess?: boolean;
    relayError?: boolean;
    relayCount?: number;
    relayStatus?: string;
  } = {}
) {
  const requests = [firstId, secondId, foreignId].map((id) => ({
    id,
    company_workspace_id: id === foreignId ? "other-workspace" : workspaceId,
    role_id: "role",
    talent_id: "talent",
    contact_kind: "contact",
    workflow_status: "awaiting_talent",
    created_at: sent,
    // The second company message replies to an existing candidate relay. That
    // inverse link is NOT a candidate response to this new company message.
    in_reply_to_company_talent_relay_id: id === secondId ? "relay-0000" : null,
    talent: { name: "Synthetic", email: "synthetic@example.invalid" },
    role: { name: "Synthetic role", status: "active" },
    delivery_body: `Company message ${id}`,
    delivery_subject: "Question",
    deliveries: [
      {
        type: "company_request_candidate_delivery",
        status: "sent",
        sent_at: sent,
        updated_at: sent,
      },
    ],
  }));
  const relays = Array.from({ length: options.relayCount ?? 1 }, (_, i) => ({
    id: `relay-${String(i).padStart(4, "0")}`,
    company_talent_request_id: firstId,
    created_at: sent,
    source_talent_message_id: i + 1,
    deliveries: [
      {
        type: "company_contact_company_delivery",
        status: options.relayStatus ?? "sent",
        sent_at: sent,
        updated_at: sent,
        payload: { delivery: { body: `Shared answer ${i}` } },
      },
    ],
  }));
  relays.push({
    ...relays[0],
    id: "foreign-relay",
    company_talent_request_id: foreignId,
  });
  const calls: URL[] = [];
  const admin = createClient("https://contact-test.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        calls.push(url);
        const table = url.pathname.split("/").at(-1);
        const select = url.searchParams.get("select") ?? "";
        const reply = (data: unknown, status = 200) =>
          new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        if (table === "company_user_workspace")
          return reply(
            options.denyAccess ? null : { id: "membership", authority: "owner" }
          );
        if (table === "list_company_contact_index_v2") {
          const args = JSON.parse(String(init?.body));
          assert.equal(args.p_company_workspace_id, workspaceId);
          return reply(
            requests
              .filter((row) => row.company_workspace_id === workspaceId)
              .map((row) => ({
                ...row,
                kind: "contact",
                source_id: row.id,
                sent_at: sent,
                delivery_status: "sent",
                has_response: false,
                talent_name: "Synthetic",
                role_name: "Synthetic role",
              }))
          );
        }
        if (table === "company_intro_candidates") return reply([]);
        if (
          table === "company_talent_requests" &&
          select.includes("company_talent_relays")
        ) {
          // Model the real schema with BOTH foreign keys, not the old permissive
          // mock that accepted any select and concealed PGRST201.
          return reply(
            {
              code: "PGRST201",
              message: "Ambiguous request/relay relationship",
            },
            300
          );
        }
        if (table === "company_talent_relays" && options.relayError)
          return reply({ code: "57014", message: "Query cancelled" }, 500);
        assert.ok(
          table === "company_talent_requests" ||
            table === "company_talent_relays",
          `Unexpected read: ${table}`
        );
        let rows: Array<Record<string, any>> =
          table === "company_talent_requests" ? requests : relays;
        for (const [key, value] of url.searchParams) {
          if (value.startsWith("eq."))
            rows = rows.filter((row) => String(row[key]) === value.slice(3));
          if (value.startsWith("in.(")) {
            const ids = value.slice(4, -1).split(",");
            rows = rows.filter((row) => ids.includes(String(row[key])));
          }
        }
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        return reply(rows.slice(offset, offset + limit));
      },
    },
  });
  return { admin, calls };
}

test("list reads multiple contacts without request/relay embedding or per-contact queries", async () => {
  const { admin, calls } = fixture();
  const result = await listOrgAgentContacts({
    admin: admin as any,
    user,
    workspaceId,
  });
  assert.equal(result.items.length, 2);
  assert.notEqual(result.items[0].state, result.items[1].state);
  assert.equal(
    result.items[1].state,
    "후보자에게 연락을 보냄",
    "company reply is not a candidate response"
  );
  const relayReads = calls.filter((url) =>
    url.pathname.endsWith("/company_talent_relays")
  );
  assert.equal(relayReads.length, 1);
  assert.equal(
    relayReads[0].searchParams.get("company_talent_request_id"),
    `in.(${firstId},${secondId})`
  );
  assert.ok(
    !relayReads[0].searchParams.get("select")!.includes("payload"),
    "index must not load response bodies"
  );
  assert.ok(!JSON.stringify(result).includes("Shared answer"));
});

test("detail and scope timeline retain the correct inbound parent and do not duplicate company replies", async () => {
  const { admin, calls } = fixture();
  const result = await readOrgAgentContacts({
    admin: admin as any,
    user,
    workspaceId,
    contactRefs: [`contact:${firstId}`, `contact:${secondId}`],
  });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.notFound, []);
  for (const item of result.items) {
    assert.equal(item.kind, "contact");
    if (item.kind !== "contact") throw Error("Expected contact");
    const inbound = item.conversationTimeline.filter(
      (event) => event.direction === "candidate_to_company"
    );
    assert.equal(inbound.length, 1);
    assert.equal(inbound[0].contactRef, `contact:${firstId}`);
    assert.equal(inbound[0].body, "Shared answer 0");
    assert.equal(item.conversationTimeline.length, 3);
  }
  assert.ok(
    calls
      .filter((url) => url.pathname.endsWith("/company_talent_requests"))
      .every(
        (url) =>
          url.searchParams.get("company_workspace_id") === `eq.${workspaceId}`
      )
  );
  assert.ok(!JSON.stringify(result).includes(foreignId));
});

test("child pagination does not truncate a busy contact at the REST page size", async () => {
  const { admin, calls } = fixture({ relayCount: 201 });
  await listOrgAgentContacts({ admin: admin as any, user, workspaceId });
  const relayReads = calls.filter((url) =>
    url.pathname.endsWith("/company_talent_relays")
  );
  assert.deepEqual(
    relayReads.map((url) => url.searchParams.get("offset")),
    ["0", "200"]
  );
  assert.ok(
    relayReads.every((url) => url.searchParams.get("order") === "id.asc")
  );
});

test("contacts without a candidate response still appear in list and detail", async () => {
  const { admin } = fixture({ relayCount: 0 });
  const result = await listOrgAgentContacts({
    admin: admin as any,
    user,
    workspaceId,
  });
  assert.equal(result.items.length, 2);
  assert.ok(
    result.items.every((item) => item.state === "후보자에게 연락을 보냄")
  );
  const detail = await readOrgAgentContacts({
    admin: admin as any,
    user,
    workspaceId,
    contactRefs: [`contact:${secondId}`],
  });
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0].message.body, `Company message ${secondId}`);
});

test("undelivered relay payload is not exposed as shared conversation evidence", async () => {
  const { admin } = fixture({ relayStatus: "queued" });
  const result = await readOrgAgentContacts({
    admin: admin as any,
    user,
    workspaceId,
    contactRefs: [`contact:${firstId}`],
  });
  assert.equal(result.items.length, 1);
  assert.ok(!JSON.stringify(result).includes("Shared answer"));
});

test("another workspace's contact does not authorize a child read", async () => {
  const { admin, calls } = fixture();
  const result = await readOrgAgentContacts({
    admin: admin as any,
    user,
    workspaceId,
    contactRefs: [`contact:${foreignId}`],
  });
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.notFound, [`contact:${foreignId}`]);
  assert.ok(
    !calls.some((url) => url.pathname.endsWith("/company_talent_relays"))
  );
});

test("workspace authorization happens before all contact reads", async () => {
  const { admin, calls } = fixture({ denyAccess: true });
  await assert.rejects(
    listOrgAgentContacts({ admin: admin as any, user, workspaceId }),
    /Workspace access denied/
  );
  assert.equal(calls.length, 1);
});

test("a failed relay lookup is an error, not evidence of no response", async () => {
  const { admin } = fixture({ relayError: true });
  await assert.rejects(
    listOrgAgentContacts({ admin: admin as any, user, workspaceId }),
    (error: any) => error.code === "57014"
  );
});
