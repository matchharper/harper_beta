// Execute the actual delivery-finalization functions with a local DB/queue adapter.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/api/internal/company-first/deliver/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source + "\nexport { finishRunWhenDelivered };", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const enqueued = [];
let rows = [], currentRun = null, updates = [];
const admin = {
  from(table) {
    let mutation;
    const query = {
      select() { return query; }, eq() { return query; },
      update(value) { mutation = value; return query; },
      async maybeSingle() { return { data: currentRun, error: null }; },
      then(resolve, reject) {
        if (mutation) updates.push(mutation);
        return Promise.resolve({ data: table === "company_first_slack_outbox" ? rows : null, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
};
const module = { exports: {} };
vm.runInNewContext(compiled.outputText, {
  module, exports: module.exports, console,
  require(name) {
    if (name === "@/lib/org/agent/companyUpdate.server") return { enqueueCompanyUpdate: async event => enqueued.push(JSON.parse(JSON.stringify(event))) };
    return {};
  },
});
const finish = module.exports.finishRunWhenDelivered;
rows = [{ status: "failed", role_ids: ["role-a"], company_workspace_id: "workspace" }];
currentRun = { result: {} };
await finish(admin, "run");
assert.equal(enqueued.length, 0, "a pending or failed introduction must not awaken the optional agent");
assert.equal(updates.length, 0);
rows = [
  { status: "sent", role_ids: ["role-a", "role-b"], company_workspace_id: "workspace" },
  { status: "sent", role_ids: ["role-a"], company_workspace_id: "workspace" },
  { status: "canceled", role_ids: ["role-c"], company_workspace_id: "workspace" },
];
await finish(admin, "run");
assert.equal(updates.length, 1);
assert.equal(updates[0].status, "succeeded");
assert.deepEqual(enqueued.map(e => e.roleId), ["role-a", "role-b"]);
assert.ok(enqueued.every(e => e.messageAlreadyDelivered === true));
const keys = enqueued.map(e => e.eventKey);
currentRun = null;
await finish(admin, "run");
assert.equal(updates.length, 1, "already finalized delivery is not rewritten");
assert.deepEqual(enqueued.slice(2).map(e => e.eventKey), keys, "recovery reuses stable event keys");
assert.ok(enqueued.every(e => !JSON.stringify(e.facts).includes("role-c")));
console.log("Company-first introduction follow-up: delivered-only scope, deduplicated Roles and stable recovery keys passed.");
