import assert from "node:assert/strict";
import test from "node:test";
import { createCompanyTalentRelayRecord } from "./relayRecord";

const input = {
  p_document_id: "resume-id",
  p_recommendation_id: "connection-id",
  p_relay_content: "Please share my resume.",
  p_request_id: null,
  p_source_message_id: 123,
  p_talent_id: "owner-id",
};
const unavailable = { code: "P0002", message: "candidate_relay_document_not_found" };

function fixture(overrides: Record<string, unknown> = {}, firstError = unavailable) {
  const document = {
    id: "resume-id", talent_id: "owner-id", kind: "resume",
    is_public: false, is_deleted: false, is_primary: false,
    ...overrides,
  };
  const calls: string[] = [];
  const saved = { id: "relay-id", status: "queued" };
  let rpcCalls = 0;
  const admin = {
    async rpc(name: string, actual: Record<string, unknown>) {
      calls.push(name);
      assert.deepEqual(actual, input);
      rpcCalls++;
      return rpcCalls === 1 ? { data: null, error: firstError } : { data: saved, error: null };
    },
    from(table: string) {
      assert.equal(table, "talent_documents");
      calls.push("publish");
      const filters: Record<string, unknown> = {};
      let changes: Record<string, unknown> = {};
      const query = {
        update(value: Record<string, unknown>) { changes = value; return query; },
        eq(key: string, value: unknown) { filters[key] = value; return query; },
        select() { return query; },
        async maybeSingle() {
          const matches = Object.entries(filters).every(([key, value]) => document[key as keyof typeof document] === value);
          if (!matches) return { data: null, error: null };
          Object.assign(document, changes);
          return { data: { id: document.id }, error: null };
        },
      };
      return query;
    },
  };
  return { admin, calls, document, saved };
}

test("an authorized private resume is published and the same relay is retried immediately", async () => {
  const state = fixture();
  const result = await createCompanyTalentRelayRecord(state.admin, input);
  assert.equal(result, state.saved);
  assert.equal(state.document.is_public, true);
  assert.equal(state.document.is_primary, false);
  assert.deepEqual(state.calls, ["create_company_talent_relay_v2", "publish", "create_company_talent_relay_v2"]);
});

test("an explicitly selected generated resume can also be published for delivery", async () => {
  const state = fixture({ origin_type: "harper_generated_resume" });
  await createCompanyTalentRelayRecord(state.admin, input);
  assert.equal(state.document.is_public, true);
  assert.equal(state.document.is_primary, false);
});

for (const [name, changes] of [
  ["another candidate's resume", { talent_id: "other-owner" }],
  ["a deleted resume", { is_deleted: true }],
  ["a non-resume document", { kind: "document" }],
  ["a different resume", { id: "other-resume" }],
] as const) {
  test(`${name} cannot be published or relayed`, async () => {
    const state = fixture(changes);
    await assert.rejects(createCompanyTalentRelayRecord(state.admin, input), error => error === unavailable);
    assert.equal(state.document.is_public, false);
    assert.deepEqual(state.calls, ["create_company_talent_relay_v2", "publish"]);
  });
}

test("invalid connections and test-only contacts cannot publish the resume", async () => {
  for (const message of ["company_talent_connection_not_found", "test_only_company_contact_not_relayable", "candidate_message_evidence_not_found"]) {
    const error = { code: "P0002", message };
    const state = fixture({}, error);
    await assert.rejects(createCompanyTalentRelayRecord(state.admin, input), value => value === error);
    assert.equal(state.document.is_public, false);
    assert.deepEqual(state.calls, ["create_company_talent_relay_v2"]);
  }
});

test("publication failures retain the original error and do not attempt delivery", async () => {
  const error = { code: "42501", message: "permission denied" };
  let retries = 0;
  const query = {
    update() { return query; }, eq() { return query; }, select() { return query; },
    async maybeSingle() { return { data: null, error }; },
  };
  const admin = {
    async rpc() { retries++; return { data: null, error: unavailable }; },
    from() { return query; },
  };
  await assert.rejects(createCompanyTalentRelayRecord(admin, input), value => value === error);
  assert.equal(retries, 1);
});

test("existing successful or idempotent relays do not change document visibility", async () => {
  const result = { id: "existing-relay", idempotent: true, status: "sent" };
  const admin = {
    async rpc() { return { data: result, error: null }; },
    from() { throw new Error("No document mutation expected"); },
  };
  assert.equal(await createCompanyTalentRelayRecord(admin, input), result);
});

test("a failure after publication is propagated without retrying indefinitely", async () => {
  const state = fixture();
  const failed = { code: "08006", message: "connection lost" };
  let attempts = 0;
  state.admin.rpc = async () => {
    attempts++;
    return { data: null, error: attempts === 1 ? unavailable : failed };
  };
  await assert.rejects(createCompanyTalentRelayRecord(state.admin, input), error => error === failed);
  assert.equal(attempts, 2);
  assert.equal(state.document.is_public, true);
});
