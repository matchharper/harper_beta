import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { OrgBoardItem } from "@/lib/org/server";

function item(overrides: Partial<OrgBoardItem> = {}): OrgBoardItem {
  return {
    capabilities: { contactCandidate: true, moveStage: true, pass: false, requestIntro: false, scheduleInterview: true, viewResume: true },
    companyIntro: null,
    companyPresentedAt: "2026-11-06T00:00:00.000Z",
    criteriaEvaluations: [{ name: "평가 체계", fitness: "good", content: "평가 세트를 설계했어요." }],
    createdAt: "2026-11-06T00:00:00.000Z",
    fitReasons: [],
    fitSummary: null,
    recommendedAt: "2026-11-06T00:00:00.000Z",
    recommendationId: "rec-1",
    processClosureNoticeUnresolved: false,
    roleId: "role-1",
    roleName: "ML Engineer",
    source: "recommendation",
    stage: "pending_connection",
    stageTag: null,
    talent: {
      email: null, headline: "ML Engineer", location: "서울", name: "이서준", profilePicture: null,
      recentCompanies: [{ label: "Nova AI", detail: "Senior ML Engineer", period: null, logoUrl: null }],
      recentSchools: [], userId: "talent-1",
    },
    talentId: "talent-1",
    upcomingMeeting: null,
    updatedAt: "2026-11-06T00:00:00.000Z",
    ...overrides,
  };
}

test("a candidate card opens in place in the profile's order, then decisions with their captions", async () => {
  let detail: unknown = {
    companyPresentation: { tldr: "LLM 검색을 운영한 엔지니어예요.", harperNote: "평가 체계를 직접 만들었어요.", finalFit: "good", criteriaEvaluations: [] },
    criteriaEvaluations: [{ name: "LLM 서비스 운영", fitness: "excellent", content: "2년 운영했어요." }],
    recommendation: { fitReason: "older note" },
  };
  const loader = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const original = loader._load;
  const marker = (part: string) =>
    function Marker({ children }: { children?: ReactNode }) {
      return <span data-part={part}>{children}</span>;
    };
  loader._load = function (name, ...args) {
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }),
      useOrgSourceT: () => (text: string) => text,
    };
    if (name === "@/hooks/org/useOrgWorkspace") return { useOrgWorkspace: () => ({ workspace: { workspaceId: "w" } }) };
    if (name === "@/hooks/org/useOrg") return { useOrgTalentDetail: () => ({ data: detail, isLoading: false }) };
    if (name === "@/hooks/org/useOrgCandidateSave") return {
      useOrgCandidateSave: () => ({ error: null, isPending: false, mutate: () => {} }),
    };
    if (name.endsWith("/OrgPassPopover")) return { OrgPassPopover: () => <button>이번엔 넘길게요</button> };
    if (name.endsWith("/OrgAcceptIntroButton")) return { OrgAcceptIntroButton: () => <button>연결하기</button> };
    if (name.endsWith("/OrgCandidateCard")) return {
      formatOrgUpcomingMeetingTime: () => "11월 10일 오후 2:00",
      OrgCandidateStageMenu: () => <span data-part="stage-menu" />,
    };
    if (name.endsWith("/OrgCriteriaEvaluation")) return {
      OrgCriteriaEvaluation: ({ evaluation }: { evaluation: { name: string } }) => <span data-part="criterion">{evaluation.name}</span>,
      OrgCriterionFitIcon: () => null,
    };
    if (name.endsWith("/OrgTalentProfile")) {
      // The real summary rule, with the markdown and legend as markers.
      const real = original.call(this, name, ...args) as typeof import("../OrgTalentProfile");
      return { ...real, MarkdownProfile: ({ value }: { value: string }) => <p data-part="note">{value}</p>, OrgCriteriaLegend: marker("legend") };
    }
    if (name === "react-markdown") return { __esModule: true, default: marker("markdown") };
    if (name === "next/image") return { __esModule: true, default: marker("image") };
    return original.call(this, name, ...args);
  };
  let Card: typeof import("./OrgRoleCandidateCard");
  try {
    Card = await import("./OrgRoleCandidateCard");
  } finally {
    loader._load = original;
  }
  const { OrgCandidateListContext, OrgRoleCandidateCard } = Card;
  const render = (candidate: OrgBoardItem, expanded: boolean) =>
    renderToStaticMarkup(
      <OrgCandidateListContext.Provider
        value={{ expandedId: expanded ? candidate.recommendationId : null, onAskHarper: () => {}, onToggle: () => {} }}
      >
        <OrgRoleCandidateCard
          canManageCandidates
          item={candidate}
          onAccept={() => {}}
          onMove={() => {}}
          onOpen={() => {}}
          onReject={() => {}}
          stages={[]}
        />
      </OrgCandidateListContext.Provider>
    );
  // Each part after the one before it (criterion names also sit in the header's marks).
  const order = (html: string, parts: string[]) => {
    let from = 0;
    for (const part of parts) {
      const index = html.indexOf(part, from);
      assert.ok(index >= 0, `missing ${part} after position ${from}: ${parts.join(" → ")}`);
      from = index + part.length;
    }
  };

  // Closed: the header line only.
  const closed = render(item(), false);
  assert.ok(closed.includes("이서준") && closed.includes("Senior ML Engineer at Nova AI") && closed.includes("서울"));
  assert.ok(closed.includes('data-expanded="false"') && closed.includes('aria-expanded="false"'));
  assert.ok(!closed.includes("한 줄 요약") && !closed.includes("연결하기"));
  // ◎ ○ △ beside the name, one per criterion, in both states.
  const marks = (html: string) => html.match(/class="org-candidate-marks"[\s\S]*?<\/span><\/span>/)?.[0] ?? "";
  assert.ok(marks(closed), "criteria marks beside the name");

  // Open: 한 줄 요약 → Harper 메모 → 확인할 기준 → 넘기기 · 연결하기 → caption → 저장, 전체 프로필, Harper에게 묻기.
  const open = render(item(), true);
  order(open, [
    "이서준",
    "한 줄 요약",
    "LLM 검색을 운영한 엔지니어예요.",
    "Harper 메모",
    "평가 체계를 직접 만들었어요.",
    "확인할 기준",
    "LLM 서비스 운영",
    "이번엔 넘길게요",
    "연결하기",
    "연결 1회 사용",
    "저장",
    "전체 프로필",
    "Harper에게 묻기",
  ]);
  assert.ok(open.includes('data-expanded="true"'));
  assert.equal(marks(open).length > 0, true, "the same marks when open");

  // A proposal (연결을 요청할 후보): 연결 요청 with its caption; text from the list when the detail is missing.
  detail = undefined;
  const proposal = render(
    item({
      companyIntro: {
        candidateSentAt: null, companyAppeal: null, id: "intro-1", nextStageId: null, requestedAt: null,
        selectionReason: "", status: "ready", tldr: "목록의 요약", harperNote: "목록의 메모",
      },
      recommendationId: "company_intro:intro-1",
      source: "company_intro",
      stage: "company_intro",
    }),
    true
  );
  order(proposal, ["목록의 요약", "목록의 메모", "평가 체계", "이번엔 넘길게요", "연결 요청", "요청하면 연결 1회를 써요", "저장"]);

  // In the pipeline: no decisions and no 저장 (only inbox candidates can be saved); the stage menu instead.
  const connected = render(item({ stage: "connected" }), true);
  assert.ok(!connected.includes("연결하기") && !connected.includes(">저장<"));
  assert.ok(connected.includes('data-part="stage-menu"'));

  // Someone outside Harper (외부 후보): the summary comes from the given detail with no profile
  // read, the same decisions, and no 저장 or Harper에게 묻기 (nothing to save or mention).
  detail = { companyPresentation: { tldr: "읽어 온 요약", harperNote: "", finalFit: null, criteriaEvaluations: [] } };
  const outsideItem = item({
    companyIntro: {
      candidateSentAt: null, companyAppeal: null, id: "external:p1", nextStageId: null, requestedAt: null,
      selectionReason: "", status: "ready",
    },
    criteriaEvaluations: [{ name: "React Native", fitness: "excellent", content: "앱 세 개를 냈어요." }],
    recommendationId: "external:p1",
    source: "company_intro",
    stage: "company_intro",
    talentId: "external:p1",
  });
  const outside = renderToStaticMarkup(
    <OrgCandidateListContext.Provider value={{ expandedId: "external:p1", onToggle: () => {} }}>
      <OrgRoleCandidateCard
        canManageCandidates
        criteriaOrder={["React Native", "TypeScript"]}
        item={outsideItem}
        onAccept={() => {}}
        onOpen={() => {}}
        onPass={async () => {}}
        profileDetail={{
          companyPresentation: { tldr: "공개 정보로 본 이유", harperNote: "", finalFit: null, criteriaEvaluations: [] },
          criteriaEvaluations: [{ name: "React Native", fitness: "excellent", content: "앱 세 개를 냈어요." }],
        }}
        stages={[]}
      />
    </OrgCandidateListContext.Provider>
  );
  order(outside, ["한 줄 요약", "공개 정보로 본 이유", "확인할 기준", "React Native", "이번엔 넘길게요", "연결 요청", "전체 프로필"]);
  assert.ok(!outside.includes("읽어 온 요약") && !outside.includes(">저장<") && !outside.includes("Harper에게 묻기"));
  // Marks follow the Role's criteria: a mark for the judged one, then a "·" where not judged.
  const outsideMarks = marks(outside);
  order(outsideMarks, ['title="React Native · ', 'class="org-candidate-mark-empty" title="TypeScript · 평가 없음">·<']);
});
