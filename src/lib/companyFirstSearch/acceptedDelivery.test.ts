import assert from "node:assert/strict";
import test from "node:test";
import { recordAcceptedCandidateDelivery } from "./acceptedDelivery";

const outbox = { delivery_kind: "accepted_connection", candidate_ids: ["candidate"], id: "outbox", run_id: "run" };
function database(reports: any[], others: any[] = [], updateError: unknown = null) {
  const updates: any[] = [];
  return {
    updates,
    from(table: string) {
      let update: any;
      const query: any = {};
      for (const method of ["select", "in", "eq", "neq", "contains", "limit"])
        query[method] = () => query;
      query.update = (value: unknown) => { update = value; return query; };
      query.then = (resolve: any, reject: any) => {
        if (update) updates.push(update);
        return Promise.resolve({ data: table === "talent_progress" ? reports : others,
          error: update ? updateError : null }).then(resolve, reject);
      };
      return query;
    },
  };
}

test("ordinary proposals do not change accepted delivery reports", async () => {
  await recordAcceptedCandidateDelivery({ from() { throw new Error("Unexpected DB read"); } },
    { ...outbox, delivery_kind: "company_first" }, "sent");
});

test("verified delivery retains the authored report and changes only receipt facts", async () => {
  const report = { tldr: "Built APIs.", harper_note: "Wants product responsibility.", finalFit: "good", criteriaEvaluations: [] };
  const admin = database([{ id: "candidate", metadata: { deliveryOwner: "role_matching_outbox", deliveryStatus: "pending", companyPresentation: report } }]);
  await recordAcceptedCandidateDelivery(admin, outbox, "sent");
  assert.equal(admin.updates[0].metadata.companyPresentation, report);
  assert.equal(admin.updates[0].metadata.slackSent, true);
  assert.equal(admin.updates[0].metadata.deliveryStatus, "sent");
  assert.ok(Number.isFinite(Date.parse(admin.updates[0].metadata.slackSentAt)));
});

test("missing reports and changed delivery ownership cannot become delivered", async () => {
  await assert.rejects(recordAcceptedCandidateDelivery(database([]), outbox, "sent"), /report is missing/);
  const admin = database([{ id: "candidate", metadata: { deliveryOwner: "other" } }]);
  await assert.rejects(recordAcceptedCandidateDelivery(admin, outbox, "sent"), /owner changed/);
  assert.equal(admin.updates.length, 0);
});

test("canceling another channel preserves a prior delivery or pending sibling", async () => {
  for (const [sent, siblings] of [[true, []], [false, [{ id: "other-outbox" }]]] as const) {
    const admin = database([{ id: "candidate", metadata: { deliveryOwner: "role_matching_outbox", slackSent: sent } }], [...siblings]);
    await recordAcceptedCandidateDelivery(admin, outbox, "canceled");
    assert.equal(admin.updates.length, 0);
  }
});

test("a failed receipt update remains a delivery failure", async () => {
  const error = new Error("Local DB write failed");
  const admin = database([{ id: "candidate", metadata: { deliveryOwner: "role_matching_outbox" } }], [], error);
  await assert.rejects(recordAcceptedCandidateDelivery(admin, outbox, "sent"), error);
});
