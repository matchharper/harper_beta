import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createFixtures } from "@/app/dev/role-start/fixtures";
import { RoleStartCandidateProfile } from "./RoleStartCandidateProfile";

// The existing synthetic Align response, without a workspace or query provider.
test("Align preserves profile facts and verdicts in the shared information body", () => {
  const { response } = createFixtures();
  const candidate = response.session!.firstCandidates[0];
  const profile = {
    ...response.profiles![candidate.talentId],
    experiences: response.profiles![candidate.talentId].experiences.map(item => ({
      ...item, description: "인터뷰 결과를 제품 설계에 반영한 업무 기록",
    })),
    recentSchools: [{ label: "예시대학교", detail: "시각디자인", period: "2015 – 2019", logoUrl: null }],
  };
  const dom = new JSDOM(renderToStaticMarkup(
    <RoleStartCandidateProfile candidate={candidate} profile={profile} />
  ));
  try {
    const body = dom.window.document.body;
    const text = body.textContent ?? "";
    for (const value of [candidate.name, candidate.headline, candidate.location,
      candidate.verdict!.tldr, profile.experiences[0].company,
      profile.experiences[0].description, "예시대학교", "시각디자인", "2015 – 2019"]) {
      assert.ok(value && text.includes(value));
    }
    for (const criterion of candidate.verdict!.criteria) {
      assert.ok(text.includes(criterion.name));
    }
    assert.equal(text.split(candidate.verdict!.tldr).length - 1, 1, "show the verdict once");
    assert.equal(body.querySelector('[role="dialog"],textarea,[aria-keyshortcuts]'), null);
    assert.ok(!text.includes("Send Intro"));
    assert.ok(!text.includes("후보자 상세 보기"));
  } finally {
    dom.window.close();
  }
});

test("Align can show identity before profile details and the verdict are ready", () => {
  const { response } = createFixtures();
  const candidate = { ...response.session!.firstCandidates[0], verdict: null };
  const html = renderToStaticMarkup(
    <RoleStartCandidateProfile candidate={candidate} profile={undefined} />
  );
  assert.ok(html.includes(candidate.name!));
  assert.ok(html.includes(candidate.headline!));
  assert.ok(!html.includes("TL;DR"));
});
