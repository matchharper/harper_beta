import assert from "node:assert/strict";
import test from "node:test";
import { orgInboxHomeRedirect, orgJobsHomeRedirect } from "./routes";
import {
  orgHomeCandidateTabQuery,
  orgHomeLocation,
  orgHomePaneQuery,
  orgHomeRolesHref,
  type OrgHomeCandidateTab,
  type OrgHomePane,
} from "./homeScreen";

// Links to Home were sent in Slack and email and stored before the pill became
// 소식 | 후보 | 역할; each must still open its place.
test("every Home link already sent or stored opens the right place", () => {
  const detail = { talentId: "t1", recommendationId: "rec1", detailRoleId: "r1", detailWorkspaceId: "w1" };
  const at = (pane: OrgHomePane, more: Partial<ReturnType<typeof orgHomeLocation>> = {}) => ({
    pane,
    tab: "pending_connection" as OrgHomeCandidateTab,
    focusRoleId: null,
    roleId: null,
    ...more,
  });
  const cases: Array<[Record<string, string>, ReturnType<typeof orgHomeLocation>]> = [
    // Home opens on 소식; tab=candidates is 후보 (where /org/inbox now lands).
    [{ orgId: "w1" }, at("feed")],
    [{ orgId: "w1", tab: "candidates" }, at("candidates")],
    // 소식, for every role or (an older link's feedRole) one.
    [{ orgId: "w1", tab: "feed" }, at("feed")],
    [{ tab: "feed", feedRole: "r2", feedList: "1" }, at("feed", { roleId: "r2" })],
    [{ tab: "feed", roleId: "r2" }, at("feed", { roleId: "r2" })],
    // A role's group on today's Home.
    [{ queue: "r1:company_intro" }, at("candidates", { tab: "company_intro", focusRoleId: "r1" })],
    [{ queue: "r1:pending_connection", ...detail }, at("candidates", { focusRoleId: "r1" })],
    // /org/inbox?… redirects here with its query: the role is the filter.
    [{ inboxStage: "company_intro", roleId: "r3" }, at("candidates", { tab: "company_intro", roleId: "r3" })],
    [{ inboxStage: "pending_connection" }, at("candidates")],
    // A candidate link: Home, with the candidate open over it.
    [detail, at("feed")],
    // 할 일, and the former 채팅 (Home has no chat; 할 일 was beside it).
    [{ tab: "chat" }, at("todo")],
    [{ tab: "todo" }, at("todo")],
    // 역할.
    [{ tab: "roles" }, at("roles")],
    [{ tab: "roles", roleId: "r1" }, at("roles", { roleId: "r1" })],
    // An old inbox list or an unknown tab: 후보 for an inbox list, 소식 otherwise.
    [{ tab: "grid", inboxStage: "saved", queue: "" }, at("candidates")],
    [{ tab: "grid" }, at("feed")],
  ];
  for (const [query, expected] of cases) assert.deepEqual(orgHomeLocation(query), expected, JSON.stringify(query));
});

test("each pane and list writes an address that opens it again, keeping the role filter", () => {
  const apply = (query: Record<string, string>, patch: Record<string, string | undefined>) => {
    const next: Record<string, string> = { ...query };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    return next;
  };
  const from = { orgId: "w1", queue: "r1:company_intro", inboxStage: "company_intro", feedRole: "r2" };
  for (const tab of ["pending_connection", "company_intro"] as OrgHomeCandidateTab[]) {
    const next = apply(from, orgHomeCandidateTabQuery(tab, "r2"));
    assert.deepEqual(orgHomeLocation(next), { pane: "candidates", tab, focusRoleId: null, roleId: "r2" });
    assert.equal(next.queue, undefined);
    assert.equal(next.feedRole, undefined, "the filter is written as roleId");
    assert.equal(next.orgId, "w1");
  }
  assert.deepEqual(apply({ orgId: "w1" }, orgHomeCandidateTabQuery("pending_connection")), {
    orgId: "w1",
    tab: "candidates",
  });
  for (const pane of ["feed", "roles", "todo"] as const) {
    // 소식 is the plain Home address.
    assert.deepEqual(
      apply(from, orgHomePaneQuery(pane)),
      pane === "feed" ? { orgId: "w1" } : { orgId: "w1", tab: pane }
    );
    const filtered = apply(from, orgHomePaneQuery(pane, "pending_connection", "r9"));
    assert.deepEqual(orgHomeLocation(filtered), {
      pane,
      tab: "pending_connection",
      focusRoleId: null,
      roleId: "r9",
    });
  }
  // 후보 reopens the list it was given.
  assert.equal(orgHomeLocation(apply({}, orgHomePaneQuery("candidates", "company_intro"))).tab, "company_intro");
  // Where the 역할 page used to be.
  assert.equal(orgHomeLocation(Object.fromEntries(new URL(orgHomeRolesHref("w1"), "https://x.invalid").searchParams)).pane, "roles");
});

// The former pages: /org/inbox is Home's 후보, /org/jobs (every role) Home's 역할.
test("the former inbox and roles pages open Home's 후보 and 역할", () => {
  const at = (href: string) =>
    orgHomeLocation(Object.fromEntries(new URL(href, "https://x.invalid").searchParams));
  assert.equal(orgInboxHomeRedirect({ orgId: "w" }), "/org/home?orgId=w&tab=candidates");
  const inbox = orgInboxHomeRedirect({ orgId: "w", inboxStage: "company_intro", roleId: "r" });
  assert.equal(inbox, "/org/home?orgId=w&inboxStage=company_intro&roleId=r&tab=candidates");
  assert.deepEqual(at(inbox), { pane: "candidates", tab: "company_intro", focusRoleId: null, roleId: "r" });
  assert.equal(orgJobsHomeRedirect({ orgId: "w", roleId: "all", view: "role" }), "/org/home?orgId=w&tab=roles");
  assert.equal(orgJobsHomeRedirect({}), "/org/home?tab=roles");
  assert.equal(at(orgJobsHomeRedirect({ orgId: "w" })).pane, "roles");
});
