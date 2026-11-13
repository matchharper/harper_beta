import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_DEMAND_COUNTS,
  compareDemand,
  demandNumberSentence,
  orgCompanyUrl,
  orgRoleUrl,
  sumDemandCounts,
} from "./demandLinks";

const vessl = { waiting: 1, toRequest: 12, external: 0, saved: 0 };

test("companies and Roles are ordered by people waiting on the company, then saved", () => {
  const rows = [
    { name: "B", counts: { ...EMPTY_DEMAND_COUNTS, saved: 9 } },
    { name: "A", counts: vessl },
    { name: "C", counts: { ...EMPTY_DEMAND_COUNTS, external: 2, saved: 1 } },
  ].sort(compareDemand);
  assert.deepEqual(rows.map((row) => row.name), ["A", "C", "B"]);
  assert.deepEqual(sumDemandCounts([vessl, { waiting: 0, toRequest: 1, external: 2, saved: 3 }]), {
    waiting: 1, toRequest: 13, external: 2, saved: 3,
  });
});

test("the /org link opens the list with people waiting", () => {
  assert.equal(
    orgRoleUrl({ workspaceId: "w", roleId: "r", counts: vessl }),
    "https://matchharper.com/org/role?orgId=w&roleId=r&tab=inbox&inboxStage=pending_connection",
  );
  assert.match(orgRoleUrl({ workspaceId: "w", roleId: "r", counts: { ...vessl, waiting: 0 }, utm: true }),
    /inboxStage=company_intro&utm_source=harper_gtm&utm_medium=email&utm_campaign=gtm_demand$/);
  assert.equal(orgCompanyUrl({ workspaceId: "w" }), "https://matchharper.com/org/jobs?orgId=w");
});

test("the number sentence uses /org's words, leaves out zeros, and is null when nobody waits", () => {
  assert.equal(
    demandNumberSentence({ language: "ko", roleName: "Project Manager", counts: vessl }),
    "지금 Harper의 Project Manager Role에 연결을 기다리는 후보 1명, 연결을 요청할 후보 12명이 있어요.",
  );
  assert.equal(
    demandNumberSentence({ language: "en", roleName: null, counts: vessl }),
    "Right now your roles on Harper have 1 candidate waiting to connect and 12 candidates ready for you to request an intro.",
  );
  assert.equal(demandNumberSentence({ language: "ko", roleName: null, counts: { ...EMPTY_DEMAND_COUNTS, saved: 4 } }), null);
});
