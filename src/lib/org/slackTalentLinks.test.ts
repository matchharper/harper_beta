import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSlackRolePipelineUrl,
  buildSlackTalentProfileUrl,
  buildSlackWorkspacePageUrl,
  extractSlackRoleMarkerIds,
  extractSlackTalentMarkerIds,
  renderSlackOrgLinks,
  renderSlackTalentLinks,
  selectSlackTalentLinkTargets,
} from "./slackTalentLinks";

const ROLE_A = "825d1723-5cea-4e83-9d7c-84988ce77b1d";
const ROLE_B = "c3aa7f09-ed15-4f6f-843e-89536cabc66c";
const TALENT_A = "4fcc61fe-4282-4b4b-b0bc-49f35e297901";
const TALENT_B = "72f3a534-66e2-4eca-92be-cb054b31fd36";

test("extracts unique valid role IDs from company-side LLM markers", () => {
  assert.deepEqual(
    extractSlackRoleMarkerIds(
      `[Backend](role:${ROLE_A}) [Design](role:${ROLE_B}) ` +
        `[Backend](role:${ROLE_A}) [잘못된 값](role:not-an-id)`
    ),
    [ROLE_A, ROLE_B]
  );
});

test("extracts unique valid talent IDs from company-side LLM markers", () => {
  assert.deepEqual(
    extractSlackTalentMarkerIds(
      `[김하퍼](talent:${TALENT_A})와 [이하퍼](talent:${TALENT_B}), ` +
        `[김하퍼](talent:${TALENT_A}) [잘못된 값](talent:not-an-id)`
    ),
    [TALENT_A, TALENT_B]
  );
});

test("prefers the Slack thread role and otherwise keeps the newest row", () => {
  const targets = selectSlackTalentLinkTargets({
    preferredRoleId: "role-preferred",
    rows: [
      {
        recommendationId: "recommendation-newest",
        recommendedAt: "2026-08-06T01:00:00.000Z",
        roleId: "role-other",
        talentId: TALENT_A,
      },
      {
        recommendationId: "recommendation-preferred",
        recommendedAt: "2026-08-05T01:00:00.000Z",
        roleId: "role-preferred",
        talentId: TALENT_A,
      },
      {
        recommendationId: "recommendation-b",
        recommendedAt: "2026-08-04T01:00:00.000Z",
        roleId: "role-other",
        talentId: TALENT_B,
      },
    ],
  });

  assert.deepEqual(targets, [
    {
      recommendationId: "recommendation-preferred",
      roleId: "role-preferred",
      talentId: TALENT_A,
    },
    {
      recommendationId: "recommendation-b",
      roleId: "role-other",
      talentId: TALENT_B,
    },
  ]);
});

test("builds the shorter exact pipeline detail URL", () => {
  const url = new URL(
    buildSlackTalentProfileUrl({
      publicSiteUrl: "https://matchharper.com/a/path",
      target: {
        recommendationId: "recommendation-id",
        roleId: "role-id",
        talentId: TALENT_A,
      },
      workspaceId: "workspace-id",
    })
  );

  assert.equal(url.origin, "https://matchharper.com");
  assert.equal(url.pathname, "/org/role");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    orgId: "workspace-id",
    roleId: "role-id",
    tab: "pipeline",
    view: "pipeline",
    talentId: TALENT_A,
    recommendationId: "recommendation-id",
  });
  assert.equal(url.searchParams.has("detailRoleId"), false);
  assert.equal(url.searchParams.has("detailWorkspaceId"), false);
});

test("builds workspace and role navigation URLs", () => {
  assert.equal(
    buildSlackWorkspacePageUrl({
      page: "home",
      publicSiteUrl: "https://matchharper.com/a/path",
      workspaceId: "workspace-id",
    }),
    "https://matchharper.com/org/home?orgId=workspace-id"
  );
  assert.equal(
    buildSlackWorkspacePageUrl({
      page: "roles",
      workspaceId: "workspace-id",
    }),
    "https://matchharper.com/org/jobs?orgId=workspace-id&roleId=all"
  );
  assert.equal(
    buildSlackWorkspacePageUrl({
      page: "team",
      workspaceId: "workspace-id",
    }),
    "https://matchharper.com/org/team?orgId=workspace-id"
  );
  assert.equal(
    buildSlackRolePipelineUrl({
      roleId: ROLE_A,
      workspaceId: "workspace-id",
    }),
    `https://matchharper.com/org/role?orgId=workspace-id&roleId=${ROLE_A}&tab=pipeline&view=pipeline`
  );
});

test("renders Slack links and removes unresolved private talent markers", () => {
  const rendered = renderSlackTalentLinks({
    message:
      `현재 역할에는 [김하퍼 | CTO](talent:${TALENT_A})님이 있습니다. ` +
      `[미확인 <후보>](talent:${TALENT_B})도 확인 중입니다.`,
    publicSiteUrl: "://invalid",
    targets: [
      {
        recommendationId: "recommendation-id",
        roleId: "role-id",
        talentId: TALENT_A,
      },
    ],
    workspaceId: "workspace-id",
  });

  assert.match(
    rendered,
    /^현재 역할에는 <https:\/\/matchharper\.com\/org\/role\?[^>]+\|김하퍼 &#124; CTO>님이 있습니다\./
  );
  assert.match(rendered, /미확인 &lt;후보&gt;도 확인 중입니다\.$/);
  assert.doesNotMatch(rendered, /talent:/);
  assert.doesNotMatch(rendered, new RegExp(TALENT_B));
});

test("renders all company-side LLM navigation markers as Slack links", () => {
  const rendered = renderSlackOrgLinks({
    message:
      `[홈](home)에서 [전체 역할](roles)을 보고 ` +
      `[Backend | API](role:${ROLE_A})의 후보자를 확인하세요. ` +
      `[팀 <설정>](team)과 [없는 역할](role:${ROLE_B})도 있습니다. ` +
      `[김하퍼](talent:${TALENT_A})`,
    roleTargets: [{ roleId: ROLE_A }],
    talentTargets: [
      {
        recommendationId: "recommendation-id",
        roleId: ROLE_A,
        talentId: TALENT_A,
      },
    ],
    workspaceId: "workspace-id",
  });

  assert.match(
    rendered,
    /<https:\/\/matchharper\.com\/org\/home\?orgId=workspace-id\|홈>/
  );
  assert.match(
    rendered,
    /<https:\/\/matchharper\.com\/org\/jobs\?orgId=workspace-id&roleId=all\|전체 역할>/
  );
  assert.match(
    rendered,
    new RegExp(
      `<https://matchharper\\.com/org/role\\?orgId=workspace-id&roleId=${ROLE_A}&tab=pipeline&view=pipeline\\|Backend &#124; API>`
    )
  );
  assert.match(
    rendered,
    /<https:\/\/matchharper\.com\/org\/team\?orgId=workspace-id\|팀 &lt;설정&gt;>/
  );
  assert.match(rendered, /없는 역할도 있습니다\./);
  assert.match(rendered, new RegExp(`talentId=${TALENT_A}`));
  assert.doesNotMatch(rendered, new RegExp(ROLE_B));
  assert.doesNotMatch(rendered, /\]\((?:home|roles|team|role:|talent:)/);
});
