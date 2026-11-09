import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgTalentProfileContentProps } from "./OrgTalentProfile";

// Render the real body; header, career sections and criterion rows are markers.
async function loadProfile() {
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  const marker = (name: string) => () => <div data-part={name} />;
  loader._load = function (name, ...args) {
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }),
      useOrgSourceT: () => (text: string) => text,
    };
    if (name === "next/image") return { __esModule: true, default: marker("image") };
    if (name === "react-markdown") return { __esModule: true, default: ({ children }: { children: ReactNode }) => <p>{children}</p> };
    if (name === "lucide-react") return new Proxy({}, { get: () => marker("icon") });
    if (name === "@/components/profile/TalentProfileHeader") return {
      TalentProfileHeader: marker("header"),
      getTalentProfileLinkImageSrc: () => null,
    };
    if (name === "@/components/profile/TalentExperienceSection") return {
      TalentEducationSection: marker("education"),
      TalentExperienceSection: marker("experience"),
      TalentExtraSection: marker("extras"),
    };
    if (name.endsWith("/OrgCareerLineage")) return { OrgCareerLineage: marker("lineage") };
    if (name.endsWith("/OrgCriteriaEvaluation")) return {
      OrgCriteriaEvaluation: ({ evaluation }: { evaluation: { name: string } }) => <div data-part="criterion">{evaluation.name}</div>,
      OrgCriterionFitIcon: ({ fitness }: { fitness: string }) => <i data-fit={fitness} />,
    };
    return original.call(this, name, ...args);
  };
  try {
    return (await import("./OrgTalentProfile")).OrgTalentProfileContent;
  } finally {
    loader._load = original;
  }
}

const detail = (overrides: Partial<OrgTalentProfileContentProps["detail"]> = {}): OrgTalentProfileContentProps["detail"] => ({
  talent: { userId: "t", name: "이서연", headline: null, bio: null, email: null, profilePicture: null },
  profile: {
    bio: null, location: "서울", experiences: [], educations: [], extras: [], documents: [], registeredLinks: [],
  },
  profileMarkdown: "",
  resume: { fileName: null, hasStorageFile: false, links: [] },
  criteriaEvaluations: [{ name: "ML 실무", fitness: "good", content: "근거" }],
  companyPresentation: {
    tldr: "결제 시스템을 만든 엔지니어",
    harperNote: "직접 만든 모델을 운영했어요.",
    finalFit: null,
    criteriaEvaluations: [],
  },
  ...overrides,
}) as OrgTalentProfileContentProps["detail"];

test("every candidate detail reads header, 한 줄 요약, Harper 메모, 확인할 기준, career, notes", async () => {
  const Profile = await loadProfile();
  const html = renderToStaticMarkup(
    <Profile detail={detail()} footer={<div data-part="notes" />} onResumeClick={() => {}} />
  );
  const order = [
    'data-part="header"',
    "한 줄 요약",
    "결제 시스템을 만든 엔지니어",
    "Harper 메모",
    "확인할 기준",
    "아주 잘 맞음",
    'data-part="criterion"',
    'data-part="lineage"',
    'data-part="experience"',
    'data-part="education"',
    'data-part="extras"',
    'data-part="notes"',
  ].map((part) => {
    const at = html.indexOf(part);
    assert.ok(at >= 0, `missing ${part}`);
    return at;
  });
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  // The legend: ◎ 아주 잘 맞음 · ○ 잘 맞음 · △ 확인 필요.
  assert.match(html, /data-fit="excellent".*아주 잘 맞음.*data-fit="good".*잘 맞음.*data-fit="uncertain".*확인 필요/);
});

test("한 줄 요약 hides when empty; Harper 메모 falls back to the recommendation reason", async () => {
  const Profile = await loadProfile();
  const html = renderToStaticMarkup(
    <Profile
      detail={detail({
        companyPresentation: null,
        recommendation: { fitReason: "*팀 리드* 경험이 있어요." },
      })}
      onResumeClick={() => {}}
    />
  );
  assert.ok(!html.includes("한 줄 요약"));
  assert.ok(html.indexOf("Harper 메모") < html.indexOf("팀 리드"));
  assert.ok(html.indexOf("팀 리드") < html.indexOf("확인할 기준"));

  // A role-start or external preview has a summary but no note: nothing is invented.
  const preview = renderToStaticMarkup(
    <Profile
      detail={detail({
        companyPresentation: { tldr: "", harperNote: "", finalFit: null, criteriaEvaluations: [] },
        criteriaEvaluations: [],
      })}
      onResumeClick={() => {}}
    />
  );
  assert.ok(!preview.includes("한 줄 요약"));
  assert.ok(!preview.includes("Harper 메모"));
  assert.ok(!preview.includes("확인할 기준"));
  assert.ok(preview.includes('data-part="experience"'));
});
