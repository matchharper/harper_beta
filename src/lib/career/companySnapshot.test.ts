import assert from "node:assert/strict";
import test from "node:test";

import type { CompanySnapshotRow } from "@/lib/career/companySnapshot";

process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.OPENROUTER_API_KEY ||= "test-openrouter-key";

const companySnapshotModule = import("@/lib/career/companySnapshot");

const dossier = {
  company: {
    canonical_name: "테스트코",
    company_archetype: "한국 비상장 스타트업",
    current_stage: "Series B",
    location: "서울",
    one_liner: "B2B 업무 소프트웨어를 만드는 회사",
  },
  summary: "성장 신호와 자금 안정성을 함께 확인할 가치가 있습니다.",
  key_facts: [
    { label: "단계", value: "Series B", source_ids: ["S1"] },
    { label: "소재지", value: "서울", source_ids: ["S1"] },
    { label: "사업", value: "B2B SaaS", source_ids: ["S1"] },
  ],
  company_flow: {
    summary: "투자 이후 매출과 조직이 함께 확장됐습니다.",
    events: [
      {
        period: "2025.10",
        headline: "시리즈 B 200억원 투자",
        detail: "연매출 30억원과 영업이익 20억원을 함께 공개했습니다.",
        source_ids: ["S1"],
      },
      {
        period: "2026.03",
        headline: "팀원 100명에서 150명으로 확대",
        detail: "제품과 영업 채용을 늘렸습니다.",
        source_ids: ["S1"],
      },
      {
        period: "2026.08",
        headline: "일본 시장 진출 계획 발표",
        detail: "현지 고객 확보를 다음 성장축으로 제시했습니다.",
        source_ids: ["S1"],
      },
    ],
  },
  report_sections: [
    {
      title: "사업과 성장",
      summary: "최근 공개 수치상 매출은 증가했습니다.",
      facts: [
        {
          label: "매출",
          value: "80억원",
          detail: "전년보다 증가했지만 수익성은 확인되지 않았습니다.",
          source_ids: ["S1"],
        },
      ],
      source_ids: ["S1"],
    },
    {
      title: "시장과 제품",
      summary: "반복 업무를 줄이는 시장에서 제품을 판매합니다.",
      facts: [
        {
          label: "제품",
          value: "업무 소프트웨어",
          detail: "B2B 고객이 반복 업무를 줄이도록 돕습니다.",
          source_ids: ["S1"],
        },
      ],
      source_ids: ["S1"],
    },
    {
      title: "팀과 조직",
      summary: "제품과 영업 팀원이 함께 확장 중입니다.",
      facts: [
        {
          label: "조직",
          value: "제품·영업 확장",
          detail: "공개 채용과 회사 자료에서 확장 방향을 확인했습니다.",
          source_ids: ["S1"],
        },
      ],
      source_ids: ["S1"],
    },
  ],
  visualizations: [
    {
      title: "공개 매출 추이",
      insight: "2년간 매출이 증가했습니다.",
      unit: "억원",
      points: [
        { label: "2024", value: 50, display_value: "50억원" },
        { label: "2025", value: 80, display_value: "80억원" },
      ],
      source_ids: ["S1"],
    },
  ],
  harper_view: {
    title: "Harper의 생각",
    body: "성장하는 B2B 시장에서 제품 확장 경험을 만들기 좋은 시점입니다.",
    source_ids: ["S1"],
  },
  personalized: {
    harper_thoughts:
      "서연님은 B2B 경험이 맞닿아 있지만 역할 범위를 먼저 확인해야 합니다.",
    career_value: "**확장 기회:** 기존 B2B 제품 경험을 활용할 수 있습니다.",
    risks_fit:
      "- ✅ B2B 경험을 활용할 수 있습니다.\n- ⚠️ 관리자와 실무 범위가 핵심입니다.",
  },
  sources: [
    {
      id: "S1",
      title: "2025 사업보고서",
      url: "https://example.com/report",
      publisher: "example.com",
      published_date: "2026-03-01",
    },
  ],
};

test("parses structured Chat Completions output", async () => {
  const { parseCompanyResearchOutput } = await companySnapshotModule;
  const parsed = parseCompanyResearchOutput({
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary: "지원 판단 요약",
            report_sections: [],
            sources: [],
          }),
        },
      },
    ],
  });

  assert.equal(parsed.summary, "지원 판단 요약");
  assert.deepEqual(parsed.report_sections, []);
});

test("renders facts before the personal assessment and ignores obsolete chart fields", async () => {
  const { buildCompanySnapshotMarkdown } = await companySnapshotModule;
  const markdown = buildCompanySnapshotMarkdown({
    companyName: "테스트코",
    content: dossier,
    includePersonalized: true,
    preferredLocale: "ko",
  });

  assert.match(markdown, /# 테스트코/);
  assert.match(markdown, /## 어떤 회사인가요\?/);
  assert.match(markdown, /## 최근 어떻게 달라지고 있나요\?/);
  assert.match(markdown, /2025\.10/);
  assert.match(markdown, /시리즈 B 200억원 투자/);
  assert.doesNotMatch(
    markdown,
    /숫자는 어떤 변화를 보여주나요|█|공개 매출 추이/
  );
  assert.match(markdown, /## Harper의 생각/);
  assert.match(
    markdown,
    /\[2025 사업보고서\]\(https:\/\/example\.com\/report\)/
  );
  assert.doesNotMatch(markdown, /\bS\d+\b/);
  assert.doesNotMatch(markdown, /상대 크기/);
  assert.ok(
    markdown.indexOf("## 최근 어떻게 달라지고 있나요?") >
      markdown.indexOf("## 어떤 회사인가요?")
  );
  assert.ok(
    markdown.indexOf("## Harper의 생각") >
      markdown.indexOf("## 어떤 회사인가요?")
  );
  assert.ok(markdown.indexOf("## Risks & Fit") < markdown.indexOf("## 출처"));
  assert.doesNotMatch(markdown, /면접에서 꼭 확인할 것/);

  const reusableMarkdown = buildCompanySnapshotMarkdown({
    companyName: "테스트코",
    content: dossier,
    includePersonalized: false,
    preferredLocale: "ko",
  });
  assert.doesNotMatch(reusableMarkdown, /서연님/);
  assert.doesNotMatch(reusableMarkdown, /기존 B2B 제품 경험/);

  const noContextMarkdown = buildCompanySnapshotMarkdown({
    companyName: "테스트코",
    content: {
      ...dossier,
      personalized: {
        harper_thoughts: "",
        career_value: "",
        risks_fit: "",
      },
    },
    includePersonalized: true,
    preferredLocale: "ko",
  });
  assert.doesNotMatch(noContextMarkdown, /서연님/);
  assert.doesNotMatch(noContextMarkdown, /개인 경력 정보/);

  const singleValueMarkdown = buildCompanySnapshotMarkdown({
    companyName: "테스트코",
    content: {
      ...dossier,
      visualizations: [
        {
          title: "단일 값",
          insight: "하나뿐인 값",
          unit: "명",
          points: [{ label: "현재", value: 80, display_value: "80명" }],
          source_ids: ["S1"],
        },
      ],
    },
    includePersonalized: false,
    preferredLocale: "ko",
  });
  assert.doesNotMatch(
    singleValueMarkdown,
    /## 숫자는 어떤 변화를 보여주나요\?/
  );
  assert.doesNotMatch(singleValueMarkdown, /단일 값/);
});

test("formats the complete decision brief instead of only the summary", async () => {
  const { formatCompanySnapshotMessage } = await companySnapshotModule;
  const snapshot: CompanySnapshotRow = {
    company_db_id: null,
    company_name: "테스트코",
    content: dossier,
    created_at: "2026-09-17T00:00:00.000Z",
    error_message: null,
    id: "snapshot-1",
    status: "completed",
    updated_at: "2026-09-17T00:00:00.000Z",
  };
  const message = formatCompanySnapshotMessage({
    preferredLocale: "ko",
    reused: false,
    snapshot,
  });

  assert.match(message, /사업과 성장/);
  assert.doesNotMatch(message, /면접에서 꼭 확인할 것/);
  assert.match(message, /서연님/);
});

test("research prompt defines stage-adaptive evidence and the private personalization contract", async () => {
  const {
    buildCompanyResearchPrompt,
    COMPANY_RESEARCH_MAX_OUTPUT_TOKENS,
    COMPANY_SNAPSHOT_SCHEMA_VERSION,
  } = await companySnapshotModule;
  const prompt = buildCompanyResearchPrompt({
    companyDbId: null,
    companyName: "테스트코",
    preferredLocale: "ko",
    reason: "시리즈 B 회사의 안정성이 걱정됩니다.",
    talentContext: "B2B PM 경력 5년",
  });

  assert.match(prompt, /scannable fact layer/);
  assert.match(prompt, /For an early startup/);
  assert.match(prompt, /For a public or mature company/);
  assert.match(prompt, /Do not generate decorative charts/);
  assert.match(prompt, /Do not cite an unrelated filing/);
  assert.match(prompt, /funding history and investors/);
  assert.match(prompt, /major recent news/);
  assert.match(prompt, /build company_flow/);
  assert.match(prompt, /oldest to newest/);
  assert.match(prompt, /otherwise omit the claim/);
  assert.match(prompt, /unknown only if resolving it could change the decision/);
  assert.match(
    prompt,
    /every personalized insight must connect one explicit fact/
  );
  assert.match(prompt, /B2B PM 경력 5년/);
  assert.match(prompt, /final personalized section only/);
  assert.match(prompt, /Never copy private talent context/);
  assert.equal(COMPANY_RESEARCH_MAX_OUTPUT_TOKENS, 128_000);
  assert.equal(COMPANY_SNAPSHOT_SCHEMA_VERSION, 7);

  const noContextPrompt = buildCompanyResearchPrompt({
    companyDbId: null,
    companyName: "테스트코",
    preferredLocale: "ko",
    reason: "지원 여부를 알고 싶습니다.",
    talentContext: "",
  });
  assert.match(
    noContextPrompt,
    /personalized\.harper_thoughts, personalized\.career_value and personalized\.risks_fit as empty strings/
  );
  assert.match(
    noContextPrompt,
    /never write an apology, disclaimer or generic substitute/
  );
  assert.doesNotMatch(noContextPrompt, /broadly relevant/);
});

test("links only a saved document and keeps the report readable if saving fails", async () => {
  const { formatCompanySnapshotMessage } = await companySnapshotModule;
  const snapshot: CompanySnapshotRow = {
    company_db_id: null,
    company_name: "테스트코",
    content: dossier,
    created_at: "2026-09-21T00:00:00Z",
    updated_at: "2026-09-21T00:00:00Z",
    error_message: null,
    id: "shared-snapshot",
    status: "completed",
  };
  const document = {
    id: "aaaa1111-2222-4333-8444-555555555555",
    title: "테스트코 합류 검토.md",
  };
  const saved = formatCompanySnapshotMessage({
    snapshot: { ...snapshot, document },
    reused: false,
    preferredLocale: "ko",
  });
  assert.ok(saved.includes(`[${document.title}](documentId:${document.id})`));
  assert.ok(saved.includes("## 커리어 가치"));
  assert.ok(saved.includes("## Risks & Fit"));
  const failed = formatCompanySnapshotMessage({
    snapshot: { ...snapshot, documentSaveFailed: true },
    reused: true,
    preferredLocale: "ko",
  });
  assert.ok(failed.includes("## Harper의 생각"));
  assert.ok(failed.includes("문서로 저장하지 못했습니다"));
  assert.ok(!failed.includes("documentId:"));
});
