import assert from "node:assert/strict";
import test from "node:test";
import {
  orgHomeCandidateTabQuery,
  orgHomeLocation,
  orgHomePaneQuery,
  type OrgHomeCandidateTab,
} from "./homeScreen";

// Links to Home were sent in Slack and email and stored before Home took the
// candidate side's frame; each must still open its place.
test("every Home link already sent or stored opens the right place", () => {
  const detail = { talentId: "t1", recommendationId: "rec1", detailRoleId: "r1", detailWorkspaceId: "w1" };
  const cases: Array<[Record<string, string>, ReturnType<typeof orgHomeLocation>]> = [
    // Today's Home: the inbox.
    [{ orgId: "w1" }, { pane: "candidates", tab: "pending_connection", focusRoleId: null, feedRoleId: null }],
    [{ orgId: "w1", tab: "feed" }, { pane: "candidates", tab: "feed", focusRoleId: null, feedRoleId: null }],
    [{ tab: "feed", feedRole: "r2", feedList: "1" }, { pane: "candidates", tab: "feed", focusRoleId: null, feedRoleId: "r2" }],
    // A role's group on today's Home.
    [{ queue: "r1:company_intro" }, { pane: "candidates", tab: "company_intro", focusRoleId: "r1", feedRoleId: null }],
    [{ queue: "r1:pending_connection", ...detail }, { pane: "candidates", tab: "pending_connection", focusRoleId: "r1", feedRoleId: null }],
    // /org/inbox?… redirects here with its query.
    [{ inboxStage: "company_intro", roleId: "r3" }, { pane: "candidates", tab: "company_intro", focusRoleId: "r3", feedRoleId: null }],
    [{ inboxStage: "pending_connection" }, { pane: "candidates", tab: "pending_connection", focusRoleId: null, feedRoleId: null }],
    // A candidate link: its list, with the candidate open over it.
    [detail, { pane: "candidates", tab: "pending_connection", focusRoleId: null, feedRoleId: null }],
    [{ tab: "chat" }, { pane: "chat", tab: "pending_connection", focusRoleId: null, feedRoleId: null }],
    [{ tab: "todo" }, { pane: "todo", tab: "pending_connection", focusRoleId: null, feedRoleId: null }],
    // Unknown values fall back to today's Home.
    [{ tab: "grid", inboxStage: "saved", queue: "" }, { pane: "candidates", tab: "pending_connection", focusRoleId: null, feedRoleId: null }],
  ];
  for (const [query, expected] of cases) assert.deepEqual(orgHomeLocation(query), expected, JSON.stringify(query));
});

test("each pane and list writes an address that opens it again, without the last list's keys", () => {
  const apply = (query: Record<string, string>, patch: Record<string, string | undefined>) => {
    const next: Record<string, string> = { ...query };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    return next;
  };
  const from = { orgId: "w1", queue: "r1:company_intro", roleId: "r1", inboxStage: "company_intro", feedRole: "r2" };
  for (const tab of ["pending_connection", "company_intro", "feed"] as OrgHomeCandidateTab[]) {
    const next = apply(from, orgHomeCandidateTabQuery(tab));
    assert.equal(orgHomeLocation(next).tab, tab);
    assert.equal(orgHomeLocation(next).pane, "candidates");
    assert.equal(next.queue, undefined);
    assert.equal(next.roleId, undefined);
    assert.equal(next.orgId, "w1");
  }
  assert.deepEqual(apply({ orgId: "w1" }, orgHomeCandidateTabQuery("pending_connection")), { orgId: "w1" });
  assert.equal(orgHomeLocation(apply(from, orgHomeCandidateTabQuery("feed", "r9"))).feedRoleId, "r9");
  for (const pane of ["chat", "todo"] as const) {
    const next = apply(from, orgHomePaneQuery(pane));
    assert.equal(orgHomeLocation(next).pane, pane);
    assert.deepEqual(next, { orgId: "w1", tab: pane });
  }
  // 후보 reopens the list it was given.
  assert.equal(orgHomeLocation(apply({}, orgHomePaneQuery("candidates", "company_intro"))).tab, "company_intro");
});
