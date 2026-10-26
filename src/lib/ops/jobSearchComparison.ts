import { z } from "zod";

export const comparisonOptions = [
  ["postingRecency", "게시 기간", "게시일 제한과 최신 공고 가중치"],
  ["excludeIntern", "인턴 제외", "당시 검색 조건 적용"],
  ["excludeParttime", "파트타임 제외", "당시 검색 조건 적용"],
  ["excludeContract", "계약직 제외", "당시 검색 조건 적용"],
  ["remote", "원격 근무 조건", "당시 전체·국가별 원격 조건 적용"],
  ["seniority", "Seniority 가중치", "당시 경력 선호 점수 적용"],
  ["salary", "연봉 가중치", "기존 연봉 만족도 점수 · 가중치 0.35"],
  ["fts", "FTS keywords", "당시 키워드로 점수 추가"],
  [
    "countries",
    "국가 코드 일치",
    "해당 국가만 포함 · 국가 비중으로 HNSW 후보부터 배분",
  ],
  [
    "eligibility",
    "추천·회사 제한",
    "기추천·차단 회사 제외, 회사 추천 허용 여부",
  ],
  ["companyCap", "회사당 최대 3개", "최종 결과에 적용"],
] as const;

export type ComparisonOption = (typeof comparisonOptions)[number][0];
export const comparisonGroups = [
  {
    id: "filters",
    label: "기본 필터 추가",
    description:
      "Posting recency · 인턴/파트타임/계약직 제외 · 원격 조건 · seniority 가중치 · 추천/회사 제한 · 회사당 최대 3개",
    keys: [
      "postingRecency",
      "excludeIntern",
      "excludeParttime",
      "excludeContract",
      "remote",
      "seniority",
      "eligibility",
      "companyCap",
    ],
  },
  {
    id: "salary",
    label: "연봉 가중치 추가",
    description: "기존 연봉 만족도 점수 · 가중치 0.35",
    keys: ["salary"],
  },
  {
    id: "fts",
    label: "FTS keywords 추가",
    description: "당시 키워드로 점수 추가",
    keys: ["fts"],
  },
  {
    id: "countries",
    label: "국가 조건·비중 추가",
    description: "국가별 인덱스 · 저장된 국가 비중으로 후보부터 배분",
    keys: ["countries"],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  keys: readonly ComparisonOption[];
}[];
export type ComparisonToggles = Record<ComparisonOption, boolean>;
export const defaultComparisonToggles: ComparisonToggles = {
  postingRecency: false,
  excludeIntern: false,
  excludeParttime: false,
  excludeContract: false,
  remote: false,
  seniority: false,
  salary: false,
  fts: false,
  countries: false,
  eligibility: false,
  companyCap: false,
};
export const comparisonRequestSchema = z
  .object({
    caseId: z.string().min(1).max(80),
    mode: z.enum(["toggles", "original"]).default("toggles"),
    toggles: z
      .object({
        postingRecency: z.boolean(),
        excludeIntern: z.boolean(),
        excludeParttime: z.boolean(),
        excludeContract: z.boolean(),
        remote: z.boolean(),
        seniority: z.boolean(),
        salary: z.boolean(),
        fts: z.boolean(),
        countries: z.boolean(),
        eligibility: z.boolean(),
        companyCap: z.boolean(),
      })
      .strict()
      .default(defaultComparisonToggles),
  })
  .strict();
export type ComparisonRequest = z.infer<typeof comparisonRequestSchema>;
export type ComparisonCase = {
  id: string;
  capturedAt: string;
  failure: string;
  countries: string[];
  candidateLimit: number;
  resultLimit: number;
  available: ComparisonToggles;
};
export type ComparisonRow = {
  role_id: string;
  role_name: string;
  company_name: string | null;
  country_code: string | null;
  title_similarity: number;
  search_rank: number;
  fts_score: number;
  salary_utility: number;
};
export type ComparisonResult = {
  request: ComparisonRequest;
  startedAt: string;
  databaseMs: number;
  rows: ComparisonRow[];
  counts: { filtered: number | null; candidates: number | null };
  sql: string;
  error: string | null;
};
