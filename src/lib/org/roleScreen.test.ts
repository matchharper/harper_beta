import assert from "node:assert/strict";
import test from "node:test";
import {
  isOrgRoleOpenPipelineStage,
  orgRoleDecisionListTab,
  orgRoleCandidateTab,
  orgRoleCandidateTabQuery,
  orgRolePane,
  type OrgRoleCandidateTab,
} from "@/lib/org/roleScreen";
import { resolveOrgRoleLocation } from "@/lib/org/routes";

function open(url: string, externalEnabled = true) {
  const parsed = new URL(url, "https://harper.example");
  const query = Object.fromEntries(parsed.searchParams);
  const location = resolveOrgRoleLocation(query, {
    externalEnabled,
    hash: parsed.hash,
    isDraft: false,
  });
  return {
    pane: orgRolePane(location),
    tab: orgRoleCandidateTab(location, query.pipelineStage),
  };
}

// Links already sent or stored (see routes.test.ts) land on the new frame's right place.
test("every role link opens a pane of the 채팅 | 후보 frame", () => {
  const cases: Array<[string, ReturnType<typeof open>]> = [
    ["/org/role?orgId=w&roleId=r", { pane: "candidates", tab: "pending_connection" }],
    ["/org/role?roleId=r&tab=chat", { pane: "chat", tab: "pending_connection" }],
    // Slack, email, worker, result notice: the pipeline with a candidate open.
    [
      "/org/role?orgId=w&roleId=r&tab=pipeline&view=pipeline&talentId=t&detailRoleId=r&detailWorkspaceId=w&source=slack",
      { pane: "candidates", tab: "pipeline" },
    ],
    ["/org/role?roleId=r&tab=pipeline&view=board", { pane: "candidates", tab: "pipeline" }],
    ["/org/role?roleId=r&tab=pipeline&pipelineStage=closed", { pane: "candidates", tab: "closed" }],
    ["/org/role?roleId=r&tab=inbox&inboxStage=company_intro", { pane: "candidates", tab: "company_intro" }],
    ["/org/role?roleId=r&tab=inbox&inboxStage=pending_connection", { pane: "candidates", tab: "pending_connection" }],
    ["/org/role?roleId=r&tab=inbox&review=saved", { pane: "candidates", tab: "saved" }],
    ["/org/role?roleId=r&tab=inbox&review=external", { pane: "candidates", tab: "external" }],
    ["/org/role?roleId=r&tab=external", { pane: "candidates", tab: "external" }],
    ["/org/role?roleId=r&tab=start", { pane: "candidates", tab: "pending_connection" }],
    ["/org/role?roleId=r&tab=matching", { pane: "role", tab: "pending_connection" }],
    ["/org/role?roleId=r&tab=role#criteria", { pane: "role", tab: "pending_connection" }],
    ["/org/role?roleId=r&tab=settings", { pane: "settings", tab: "pending_connection" }],
  ];
  for (const [url, expected] of cases) assert.deepEqual(open(url), expected, url);
  // Without external sourcing an old 외부 후보 link opens the plain inbox.
  assert.deepEqual(open("/org/role?roleId=r&tab=external", false), {
    pane: "candidates",
    tab: "pending_connection",
  });
});

test("each 후보 list writes an address that opens it again", () => {
  const tabs: OrgRoleCandidateTab[] = [
    "pending_connection",
    "company_intro",
    "saved",
    "external",
    "pipeline",
    "closed",
  ];
  for (const tab of tabs) {
    const query = Object.fromEntries(
      Object.entries(orgRoleCandidateTabQuery(tab)).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    );
    const location = resolveOrgRoleLocation(query, { externalEnabled: true, isDraft: false });
    assert.equal(orgRolePane(location), "candidates", tab);
    assert.equal(orgRoleCandidateTab(location, query.pipelineStage), tab, tab);
  }
  // Switching lists drops what belonged to the previous one.
  assert.deepEqual(orgRoleCandidateTabQuery("pipeline"), {
    inboxStage: undefined,
    pipelineStage: undefined,
    review: undefined,
    section: undefined,
    tab: "pipeline",
    view: undefined,
  });
});

test("파이프라인 holds the open stages; inbox, closed and internal stages stay out", () => {
  for (const stage of ["intro_requested", "connected", "final_offer", "custom:interview"])
    assert.equal(isOrgRoleOpenPipelineStage(stage), true, stage);
  for (const stage of ["pending_connection", "company_intro", "process_stopped", "archived", "accepted"])
    assert.equal(isOrgRoleOpenPipelineStage(stage), false, stage);
  assert.equal(isOrgRoleOpenPipelineStage("accepted", true), true);
});

test("a decision's 보기 opens the list the person moved to", () => {
  assert.equal(orgRoleDecisionListTab("process_stopped"), "closed");
  assert.equal(orgRoleDecisionListTab("intro_requested"), "pipeline");
  assert.equal(orgRoleDecisionListTab("custom:interview"), "pipeline");
  assert.equal(orgRoleDecisionListTab(null), "saved");
});
