import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { OrgLocaleScope } from "@/i18n/org/OrgLocaleProvider";
import type { OrgBoardItem } from "@/lib/org/server";
import { OrgCandidateCard } from "./OrgCandidateCard";
import { WorkspacePlans } from "./billing/WorkspacePlans";

// Synthetic rendering only: no accounts, DB writes or external contact.
test("an unpurchased company-first profile renders its real identity and original Intro action", () => {
  const item = {
    source: "company_intro", recommendationId: "intro-fixture", roleId: "role-fixture",
    roleName: "Engineering", stage: "company_intro", recommendedAt: "2026-10-22T00:00:00Z",
    companyIntro: { status: "ready", createdAt: "2026-10-22T00:00:00Z" },
    capabilities: { moveStage: false },
    talent: { talentId: "synthetic-talent", name: "Visible Candidate", email: null,
      profilePicture: null, headline: "Backend engineer", recentSchools: [],
      recentCompanies: [{ label: "Visible Employer", detail: "Engineer", period: "2024 – Present" }] },
  } as unknown as OrgBoardItem;
  for (const locale of ["ko", "en"] as const) {
    const dom = new JSDOM(renderToStaticMarkup(
      <OrgLocaleScope locale={locale}>
        <OrgCandidateCard item={item} onSelect={() => {}} onRequestIntro={() => {}} canManageCandidates />
      </OrgLocaleScope>
    ));
    try {
      const body = dom.window.document.body;
      assert.ok(body.textContent?.includes("Visible Candidate"));
      assert.ok(body.textContent?.includes("Visible Employer"));
      assert.ok(body.textContent?.includes(locale === "ko" ? "Intro 보내기" : "Send intro"));
      assert.equal(body.querySelector('[class*="blur"]'), null);
      assert.ok(!body.textContent?.includes("프로필 열람"));
    } finally { dom.window.close(); }
  }
});

test("the Free plan displays one active Role and ten monthly Intros in both languages", () => {
  for (const locale of ["ko", "en"] as const) {
    const dom = new JSDOM(renderToStaticMarkup(
      <OrgLocaleScope locale={locale}>
        <WorkspacePlans catalog={undefined} onAddSlot={() => {}} contactHref="/contact" />
      </OrgLocaleScope>
    ));
    try {
      const text = dom.window.document.body.textContent ?? "";
      assert.ok(text.includes(locale === "ko" ? "활성 Role 1개" : "1 active Role"));
      assert.ok(text.includes(locale === "ko" ? "월 10 Intro" : "10 shared Intros every month"));
    } finally { dom.window.close(); }
  }
});
