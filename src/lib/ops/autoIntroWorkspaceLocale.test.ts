import assert from "node:assert/strict";
import test from "node:test";
import {
  attachAutoIntroSlackReviewAction,
  buildAutoIntroRoleSummarySlackBlocks,
  buildAutoIntroRoleSummaryText,
  type AutoIntroRoleSummary,
} from "./autoIntroToCompanyMessage";

const summary: AutoIntroRoleSummary = {
  companyName: "Acme",
  roles: [
    {
      pendingDecisionCount: 2,
      roleId: "role-id",
      roleTitle: "Backend Engineer",
      status: "active",
      workspaceId: "workspace-id",
    },
  ],
  workspaceId: "workspace-id",
};

test("English role summary and Slack actions use Ready to connect", () => {
  const text = buildAutoIntroRoleSummaryText({ locale: "en", summary });
  const blocks = buildAutoIntroRoleSummarySlackBlocks({
    locale: "en",
    summary,
  });
  const review = attachAutoIntroSlackReviewAction({
    candidateCount: 2,
    locale: "en",
    messageBody: "Candidates are ready to connect.",
  });
  assert.match(text, /2 ready to connect/);
  assert.match(JSON.stringify(blocks), /Ready to connect/);
  assert.match(JSON.stringify(review), /Review 2 candidates/);
  assert.doesNotMatch(
    `${text}\n${JSON.stringify(blocks)}\n${JSON.stringify(review)}`,
    /[가-힣]/
  );
});

test("capacity notice adds a conditional fourth column in both locales", () => {
  for (const locale of ["ko", "en"] as const) {
    const capped = {
      ...summary,
      roles: [
        { ...summary.roles[0], talentFirstCapacityBlocked: true },
        {
          ...summary.roles[0],
          roleId: "other-role",
          talentFirstCapacityBlocked: false,
        },
      ],
    };
    const table = buildAutoIntroRoleSummarySlackBlocks({
      locale,
      summary: capped,
    }).find((b) => b.type === "table") as any;
    assert.equal(table.rows[0].length, 4);
    assert.equal(table.column_settings[3].is_wrapped, true);
    assert.equal(table.rows[2][3].text, "—");
    const notice = table.rows[1][3].text;
    assert.ok(notice.length > 30);
    assert.ok(
      buildAutoIntroRoleSummaryText({ locale, summary: capped }).includes(
        notice
      )
    );
    if (locale === "en") assert.doesNotMatch(notice, /[가-힣]/);
    const ordinary = buildAutoIntroRoleSummarySlackBlocks({
      locale,
      summary,
    }).find((b) => b.type === "table") as any;
    assert.equal(ordinary.rows[0].length, 3);
  }
});

test("capacity notice counts toward the Slack table character limit", () => {
  assert.throws(
    () =>
      buildAutoIntroRoleSummarySlackBlocks({
        locale: "en",
        summary: {
          ...summary,
          roles: Array.from({ length: 99 }, () => ({
            ...summary.roles[0],
            talentFirstCapacityBlocked: true,
          })),
        },
      }),
    /character limit/
  );
});
