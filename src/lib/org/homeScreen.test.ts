import assert from "node:assert/strict";
import test from "node:test";
import { orgInboxHomeRedirect, orgJobsHomeRedirect } from "./routes";
import {
  orgHomeLocation,
  orgHomePaneQuery,
  orgHomeRolesHref,
  type OrgHomePane,
} from "./homeScreen";

// Links to Home were sent in Slack and email and stored before the pill became
// 소식 | 역할; each must still open a place.
test("every Home link already sent or stored opens the right place", () => {
  const detail = { talentId: "t1", recommendationId: "rec1", detailRoleId: "r1", detailWorkspaceId: "w1" };
  const at = (pane: OrgHomePane, roleId: string | null = null) => ({ pane, roleId });
  const cases: Array<[Record<string, string>, ReturnType<typeof orgHomeLocation>]> = [
    // Home opens on 소식.
    [{ orgId: "w1" }, at("feed")],
    // 소식, for every role or (an older link's feedRole) one.
    [{ orgId: "w1", tab: "feed" }, at("feed")],
    [{ tab: "feed", feedRole: "r2", feedList: "1" }, at("feed", "r2")],
    [{ tab: "feed", roleId: "r2" }, at("feed", "r2")],
    // The former 후보: 역할, narrowed to the role the link named (its card links to its lists).
    [{ orgId: "w1", tab: "candidates" }, at("roles")],
    [{ queue: "r1:company_intro" }, at("roles", "r1")],
    [{ queue: "r1:pending_connection", ...detail }, at("roles", "r1")],
    [{ inboxStage: "company_intro", roleId: "r3" }, at("roles", "r3")],
    [{ inboxStage: "pending_connection" }, at("roles")],
    [{ tab: "grid", inboxStage: "saved", queue: "" }, at("roles")],
    // A candidate link: Home, with the person open in place.
    [detail, at("feed")],
    // 할 일, and the former 채팅 (Home has no chat; 할 일 was beside it).
    [{ tab: "chat" }, at("todo")],
    [{ tab: "todo", roleId: "r1" }, at("todo", "r1")],
    // 역할.
    [{ tab: "roles" }, at("roles")],
    [{ tab: "roles", roleId: "r1" }, at("roles", "r1")],
    // An unknown tab: 소식.
    [{ tab: "grid" }, at("feed")],
  ];
  for (const [query, expected] of cases) assert.deepEqual(orgHomeLocation(query), expected, JSON.stringify(query));
});

test("each pane writes an address that opens it again, keeping the role filter", () => {
  const apply = (query: Record<string, string>, patch: Record<string, string | undefined>) => {
    const next: Record<string, string> = { ...query };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    return next;
  };
  const from = { orgId: "w1", queue: "r1:company_intro", inboxStage: "company_intro", feedRole: "r2" };
  for (const pane of ["feed", "roles", "todo"] as const) {
    // 소식 is the plain Home address; a former link's keys go.
    assert.deepEqual(
      apply(from, orgHomePaneQuery(pane)),
      pane === "feed" ? { orgId: "w1" } : { orgId: "w1", tab: pane }
    );
    const filtered = apply(from, orgHomePaneQuery(pane, "r9"));
    assert.deepEqual(orgHomeLocation(filtered), { pane, roleId: "r9" });
    assert.equal(filtered.feedRole, undefined, "the filter is written as roleId");
  }
  // Where the 역할 page used to be.
  assert.equal(orgHomeLocation(Object.fromEntries(new URL(orgHomeRolesHref("w1"), "https://x.invalid").searchParams)).pane, "roles");
});

test("the former inbox and roles pages open Home's 역할", () => {
  const at = (href: string) =>
    orgHomeLocation(Object.fromEntries(new URL(href, "https://x.invalid").searchParams));
  assert.equal(orgInboxHomeRedirect({ orgId: "w" }), "/org/home?orgId=w&tab=roles");
  const inbox = orgInboxHomeRedirect({ orgId: "w", inboxStage: "company_intro", roleId: "r" });
  assert.equal(inbox, "/org/home?orgId=w&inboxStage=company_intro&roleId=r&tab=roles");
  assert.deepEqual(at(inbox), { pane: "roles", roleId: "r" });
  assert.equal(orgJobsHomeRedirect({ orgId: "w", roleId: "all", view: "role" }), "/org/home?orgId=w&tab=roles");
  assert.equal(orgJobsHomeRedirect({}), "/org/home?tab=roles");
  assert.equal(at(orgJobsHomeRedirect({ orgId: "w" })).pane, "roles");
});
