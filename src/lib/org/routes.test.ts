import assert from "node:assert/strict";
import test from "node:test";
import { buildAutoIntroCandidateProfileUrl, buildAutoIntroRoleJobsUrl } from "@/lib/ops/autoIntroToCompanyMessage";
import { buildCompanyTalentProfileHref } from "@/lib/companyTalentRequests/server";
import { renderOrgAgentWebLinks } from "@/lib/org/agent/navigationMarkdown";
import { roleStartBriefReadyMessage } from "@/lib/org/roleStart/sessionChat";
import {
  buildOrgHref,
  orgBillingOpensSlots,
  orgJobsRoleRedirect,
  orgPageFromPath,
  orgSlotsRedirectQuery,
  resolveOrgRoleLocation,
  type OrgRoleLocation,
} from "@/lib/org/routes";
import { buildSlackRolePipelineUrl, buildSlackTalentProfileUrl } from "@/lib/org/slackTalentLinks";

test("uses separate canonical URLs for company information and members", () => {
  assert.equal(
    buildOrgHref({ orgId: "workspace-id", page: "team" }),
    "/org/team?orgId=workspace-id"
  );
  assert.equal(
    buildOrgHref({ orgId: "workspace-id", page: "member" }),
    "/org/member?orgId=workspace-id"
  );
});

test("keeps new role creation separate from an existing role workspace", () => {
  assert.equal(
    buildOrgHref({ orgId: "workspace-id", page: "new-role" }),
    "/org/new?orgId=workspace-id"
  );
  assert.equal(
    buildOrgHref({
      orgId: "workspace-id",
      page: "role",
      roleId: "role-id",
    }),
    "/org/role?orgId=workspace-id&roleId=role-id"
  );
});

test("builds the role pipeline tab URL separately from the all-roles page", () => {
  assert.equal(
    buildOrgHref({
      orgId: "workspace-id",
      page: "role",
      roleId: "role-id",
      tab: "pipeline",
      view: "board",
    }),
    "/org/role?orgId=workspace-id&roleId=role-id&tab=pipeline&view=board"
  );
});

test("builds the Calendar settings tab URL", () => {
  assert.equal(
    buildOrgHref({
      orgId: "workspace-id",
      page: "settings",
      tab: "calendar",
    }),
    "/org/settings?orgId=workspace-id&tab=calendar"
  );
});

const SITE = "https://harper.example";

function resolve(url: string, options: { externalEnabled?: boolean; isDraft?: boolean } = {}) {
  const parsed = new URL(url, SITE);
  return resolveOrgRoleLocation(Object.fromEntries(parsed.searchParams), {
    externalEnabled: options.externalEnabled ?? true,
    hash: parsed.hash,
    isDraft: options.isDraft ?? false,
  });
}

const at = (tab: OrgRoleLocation["tab"], rest: Partial<OrgRoleLocation> = {}): OrgRoleLocation => ({
  tab,
  inboxStage: null,
  review: null,
  section: null,
  ...rest,
});

/**
 * Every role link shape already sent or stored. These live in Slack, email,
 * chat history and the database, so a row is never removed, only added.
 */
const LEGACY_LINKS: Array<{ source: string; url: string; registered: OrgRoleLocation; externalOff?: OrgRoleLocation; draft?: OrgRoleLocation }> = [
  {
    source: "slackTalentLinks.buildSlackTalentProfileUrl",
    url: "/org/role?orgId=w&roleId=r&tab=pipeline&view=pipeline&talentId=t&recommendationId=rec",
    registered: at("pipeline"),
  },
  {
    source: "slackTalentLinks.buildSlackRolePipelineUrl, chat marker ](role:<id>)",
    url: "/org/role?orgId=w&roleId=r&tab=pipeline&view=pipeline",
    registered: at("pipeline"),
    draft: at("start"),
  },
  {
    source: "slackCandidateWorkObject.server.ts (Slack card)",
    url: "/org/role?orgId=w&roleId=r&tab=pipeline&view=pipeline&talentId=t&detailRoleId=r&detailWorkspaceId=w&source=slack",
    registered: at("pipeline"),
  },
  {
    source: "harper_worker opp/company_first_search/slack_writer.py _candidate_url",
    url: "/org/role?orgId=w&roleId=r&tab=pipeline&view=pipeline&talentId=t&detailRoleId=r&detailWorkspaceId=w&source=slack",
    registered: at("pipeline"),
  },
  {
    source: "company-first result-notice route, slackCandidateWorkObject.server.ts (result card)",
    url: "/org/role?detailRoleId=r&detailWorkspaceId=w&orgId=w&roleId=r&source=company_matching_result&tab=pipeline&talentId=t&view=pipeline",
    registered: at("pipeline"),
  },
  {
    source: "autoIntroToCompanyMessage.buildAutoIntroCandidateProfileUrl",
    url: "/org/role?orgId=w&roleId=r&tab=pipeline&view=pipeline&talentId=t&recommendationId=rec&detailRoleId=r&detailWorkspaceId=w",
    registered: at("pipeline"),
  },
  {
    source: "companyTalentRequests/server.buildCompanyTalentProfileHref",
    url: "/org/role?roleId=r&tab=pipeline&view=pipeline&talentId=t&recommendationId=rec&detailRoleId=r&detailWorkspaceId=w",
    registered: at("pipeline"),
  },
  {
    source: "roleStart/sessionChat stored tab=start",
    url: "/org/role?orgId=w&roleId=r&tab=start",
    registered: at("inbox"),
    draft: at("start"),
  },
  {
    source: "OrgTodoChip brief_changed (before 역할 정보 held 확인할 기준)",
    url: "/org/role?orgId=w&roleId=r&tab=matching",
    registered: at("role", { section: "criteria" }),
    draft: at("role", { section: "criteria" }),
  },
  {
    source: "OrgTodoChip brief_changed, now",
    url: "/org/role?orgId=w&roleId=r&tab=role&section=criteria",
    registered: at("role", { section: "criteria" }),
  },
  {
    source: "#criteria anchor",
    url: "/org/role?orgId=w&roleId=r&tab=role#criteria",
    registered: at("role", { section: "criteria" }),
  },
  {
    source: "tab=role (역할 정보 before the merge)",
    url: "/org/role?orgId=w&roleId=r&tab=role",
    registered: at("role"),
  },
  {
    source: "OrgTodoChip, OrgCriteriaRecheck: tab=inbox&inboxStage",
    url: "/org/role?orgId=w&roleId=r&tab=inbox&inboxStage=company_intro",
    registered: at("inbox", { inboxStage: "company_intro" }),
    draft: at("start"),
  },
  {
    source: "OrgTodoChip pending_connection",
    url: "/org/role?orgId=w&roleId=r&tab=inbox&inboxStage=pending_connection",
    registered: at("inbox", { inboxStage: "pending_connection" }),
  },
  {
    source: "OrgSavedCandidates",
    url: "/org/role?orgId=w&roleId=r&tab=inbox&inboxStage=company_intro&talentId=t&review=saved",
    registered: at("inbox", { inboxStage: "company_intro", review: "saved" }),
  },
  {
    source: "review=external (external candidates inside the inbox)",
    url: "/org/role?orgId=w&roleId=r&tab=inbox&review=external",
    registered: at("inbox", { inboxStage: "external" }),
    externalOff: at("inbox"),
  },
  {
    source: "tab=external (외부 후보 as its own tab)",
    url: "/org/role?orgId=w&roleId=r&tab=external&externalCandidateId=x",
    registered: at("inbox", { inboxStage: "external" }),
    externalOff: at("inbox"),
    draft: at("start"),
  },
  {
    source: "tab=inbox&inboxStage=external, now",
    url: "/org/role?orgId=w&roleId=r&tab=inbox&inboxStage=external",
    registered: at("inbox", { inboxStage: "external" }),
    externalOff: at("inbox"),
  },
  {
    source: "sidebar, OrgRoleActionsMenu: no tab",
    url: "/org/role?orgId=w&roleId=r",
    registered: at("inbox"),
    draft: at("start"),
  },
];

test("every role link already sent or stored opens the right place", () => {
  for (const row of LEGACY_LINKS) {
    assert.deepEqual(resolve(row.url), row.registered, `${row.source}: ${row.url}`);
    assert.deepEqual(
      resolve(row.url, { externalEnabled: false }),
      row.externalOff ?? row.registered,
      `${row.source} (external off): ${row.url}`
    );
    if (row.draft) {
      assert.deepEqual(resolve(row.url, { isDraft: true }), row.draft, `${row.source} (draft): ${row.url}`);
    }
  }
});

test("the link builders still write a shape in the legacy table", () => {
  const shapes = new Set(LEGACY_LINKS.map((row) => new URL(row.url, SITE).search));
  // The table uses short ids; keep the keys and their order, shorten the values.
  const short: Record<string, string> = {
    "workspace-id": "w", "role-id": "r", "talent-id": "t", "recommendation-id": "rec",
  };
  const search = (url: string) =>
    `?${new URLSearchParams(
      [...new URL(url, SITE).searchParams].map(([key, value]) => [key, short[value] ?? value])
    )}`;
  const ids = { recommendationId: "recommendation-id", roleId: "role-id", talentId: "talent-id", workspaceId: "workspace-id" };
  const built = [
    buildSlackTalentProfileUrl({
      publicSiteUrl: SITE,
      target: { recommendationId: ids.recommendationId, roleId: ids.roleId, talentId: ids.talentId },
      workspaceId: ids.workspaceId,
    }),
    buildSlackRolePipelineUrl({ publicSiteUrl: SITE, roleId: ids.roleId, workspaceId: ids.workspaceId }),
    buildAutoIntroCandidateProfileUrl({ ...ids, publicSiteUrl: SITE }),
    buildAutoIntroRoleJobsUrl({ publicSiteUrl: SITE, roleId: ids.roleId, workspaceId: ids.workspaceId }),
    buildCompanyTalentProfileHref(ids),
    renderOrgAgentWebLinks({ markdown: "[Role](role:role-id)", workspaceId: ids.workspaceId }).match(/\]\(([^)]+)\)/)![1],
    roleStartBriefReadyMessage(ids.roleId, ids.workspaceId).metadata.roleStartBriefReady.href,
    buildOrgHref({ orgId: ids.workspaceId, page: "role", roleId: ids.roleId, tab: "role", section: "criteria" }),
    buildOrgHref({ orgId: ids.workspaceId, page: "role", roleId: ids.roleId, tab: "inbox", inboxStage: "external" }),
  ];
  for (const url of built) assert.ok(shapes.has(search(url)), `not in the legacy table: ${url}`);
});

test("older page links keep their destination", () => {
  // /org/jobs?roleId&view=pipeline opens the role's pipeline.
  const jobs = orgJobsRoleRedirect({ roleId: "r", view: "pipeline", orgId: "w" });
  assert.equal(jobs, "/org/role?roleId=r&view=pipeline&orgId=w&tab=pipeline");
  assert.deepEqual(resolve(jobs!), at("pipeline"));
  assert.equal(orgJobsRoleRedirect({ roleId: "r", tab: "matching" }), "/org/role?roleId=r");
  assert.equal(orgJobsRoleRedirect({ roleId: "all" }), null);
  assert.equal(orgJobsRoleRedirect({}), null);

  // Stripe returns to /org/slots while a checkout is in flight; the page stays.
  assert.equal(orgPageFromPath("/org/slots"), "slots");
  // Slots live inside billing: links that meant slots land on billing's slots.
  assert.equal(orgBillingOpensSlots({ section: "slots" }), true);
  assert.equal(orgBillingOpensSlots({ tab: "credits" }), true);
  assert.equal(orgBillingOpensSlots({ checkout: "success", session_id: "cs_test" }), true);
  assert.equal(orgBillingOpensSlots({ purchase: "agent" }), true);
  assert.equal(orgBillingOpensSlots({}), false);
  // The old slot page keeps every checkout and purchase key on the way.
  assert.deepEqual(
    orgSlotsRedirectQuery({
      orgId: "w",
      purchase: "slot",
      checkout: "success",
      session_id: "cs_test",
      interval: "year",
      quantity: "2",
      tab: "credits",
    }),
    {
      orgId: "w",
      purchase: "slot",
      checkout: "success",
      session_id: "cs_test",
      interval: "year",
      quantity: "2",
      section: "slots",
    }
  );
  assert.equal(buildOrgHref({ orgId: "w", page: "billing" }), "/org/billing?orgId=w");
});
