import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessagesProvider } from "@/i18n/useMessage";
import { deriveHistoryOpportunityCounts } from "@/hooks/career/careerSessionData";
import {
  getHistoryFiltersForJobsTab,
  getJobsTabTotal,
  isOpportunityInJobsTab,
} from "@/hooks/career/useCareerMobileHistoryOpportunities";
import {
  getMyOpportunityTab,
  getMyOpportunityTabs,
} from "./savedOpportunityStatus";
import { getOpportunityDeadlineLabel } from "./opportunityPostingStatus";
import OpportunityListCard from "./OpportunityListCard";
import type { CareerHistoryOpportunity } from "../types";

const day = 86_400_000;
const now = Date.now();
const iso = (days: number) => new Date(now + days * day).toISOString();
function fixture(
  stage: CareerHistoryOpportunity["savedStage"],
  overrides: Partial<CareerHistoryOpportunity> = {}
): CareerHistoryOpportunity {
  return {
    id: stage ?? "new",
    roleId: `role-${stage}`,
    title: "Product Engineer",
    companyName: "Example",
    status: "active",
    feedback: "positive",
    savedStage: stage,
    sourceType: "external",
    isInternal: false,
    location: "서울",
    workMode: "onsite",
    employmentTypes: [],
    recommendationReasons: [],
    postedAt: iso(-20),
    recommendedAt: new Date(now - 2 * 3_600_000).toISOString(),
    expiresAt: iso(5),
    ...overrides,
  } as CareerHistoryOpportunity;
}

test("My Opportunities groups application and archive stages without moving expired saved jobs", () => {
  const items = [
    fixture("saved", { isExpired: true }),
    fixture("applied", { listPosition: "previous" }),
    fixture("connected", { listPosition: "previous" }),
    fixture("closed"),
    fixture("hidden"),
    fixture("saved", { id: "negative", feedback: "negative" }),
    fixture("saved", { id: "previous", listPosition: "previous" }),
  ];
  const counts = deriveHistoryOpportunityCounts(items);
  assert.deepEqual(
    items.filter((x) => isOpportunityInJobsTab(x, "saved")).map((x) => x.id),
    ["saved", "previous"]
  );
  assert.deepEqual(
    items.filter((x) => isOpportunityInJobsTab(x, "applied")).map((x) => x.id),
    ["applied", "connected"]
  );
  assert.deepEqual(
    items.filter((x) => isOpportunityInJobsTab(x, "hidden")).map((x) => x.id),
    ["closed", "hidden"]
  );
  assert.equal(getJobsTabTotal("applied", counts), 2);
  assert.equal(getJobsTabTotal("hidden", counts), 2);
  assert.equal(getMyOpportunityTab("connected"), "applied");
  assert.equal(getMyOpportunityTab("closed"), "hidden");
  assert.deepEqual(
    getMyOpportunityTabs((_key, source) => source).map((x) => x.label),
    ["저장함", "진행중", "종료/보관"]
  );
  assert.deepEqual(
    getHistoryFiltersForJobsTab("hidden").map((x) => x.savedStage),
    ["closed", "hidden"]
  );
});

test("deadline labels cover the ten-day boundary, missing dates and expired dates", () => {
  assert.equal(
    getOpportunityDeadlineLabel({ expiresAt: iso(9) }, "ko", undefined, now),
    "9일 후 마감"
  );
  const exactDate = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(iso(10)));
  assert.equal(
    getOpportunityDeadlineLabel({ expiresAt: iso(10) }, "ko", undefined, now),
    exactDate
  );
  assert.equal(
    getOpportunityDeadlineLabel({ expiresAt: null }, "ko", undefined, now),
    null
  );
  assert.equal(
    getOpportunityDeadlineLabel({ expiresAt: "invalid" }, "ko", undefined, now),
    null
  );
  assert.equal(
    getOpportunityDeadlineLabel({ expiresAt: iso(-1) }, "ko", undefined, now),
    null
  );
});

function card(item: CareerHistoryOpportunity, locale: "ko" | "en" = "ko") {
  return renderToStaticMarkup(
    <MessagesProvider locale={locale} persistPreference={false}>
      <OpportunityListCard
        item={item}
        pending={false}
        savedStatus={item.savedStage ?? "saved"}
        onOpenDetail={() => {}}
      />
    </MessagesProvider>
  );
}

test("cards use posting age and deadline, hide onsite and recommendation age, and show progress instead of dates", () => {
  const saved = card(fixture("saved"));
  assert.match(saved, /에 게시됨/);
  assert.match(saved, /5일 후 마감/);
  assert.doesNotMatch(saved, /onsite|2시간 전/);
  assert.ok(saved.indexOf("에 게시됨") < saved.indexOf("5일 후 마감"));
  assert.match(card(fixture("saved", { isExpired: true })), /마감됨/);
  assert.doesNotMatch(
    card(fixture("saved", { postedAt: null, expiresAt: null })),
    /게시됨|후 마감/
  );
  for (const [stage, label] of [
    ["applied", "지원함"],
    ["connected", "진행중"],
  ] as const) {
    const html = card(fixture(stage, { isExpired: true }));
    assert.match(html, new RegExp(label));
    assert.doesNotMatch(html, /게시됨|후 마감|마감됨/);
  }
  const english = card(fixture("saved"), "en");
  assert.match(english, /Posted /);
  assert.match(english, /Closes in 5 days/);
});
