export const TASK_COST_GROUPS = [
  {
    id: "career-chat",
    label: "후보자 대화",
    description: "Career 채팅과 설정·활동 조회",
    color: "#3478f6",
  },
  {
    id: "voice",
    label: "음성 대화",
    description: "실시간 음성 대화와 통화 요청",
    color: "#0891b2",
  },
  {
    id: "recommendation",
    label: "추천·매칭",
    description: "후보자 추천 검색, 적합도 판단, 추천 Worker",
    color: "#10a37f",
  },
  {
    id: "company",
    label: "회사 채용·소개",
    description: "회사 중심 후보자 탐색, Intro와 회사 연락",
    color: "#6d5bd0",
  },
  {
    id: "profile",
    label: "프로필 정리",
    description: "프로필 수집·갱신과 경력 정리",
    color: "#e38b2c",
  },
  {
    id: "research",
    label: "웹·회사 조사",
    description: "웹 검색, 페이지 읽기와 회사 조사",
    color: "#c15f3c",
  },
  {
    id: "email",
    label: "이메일 응대",
    description: "이메일 답장 처리",
    color: "#be4890",
  },
  {
    id: "other",
    label: "기타 작업",
    description: "위 분류에 포함되지 않은 비용 기록",
    color: "#64748b",
  },
] as const;
export type TaskCostGroupId = (typeof TASK_COST_GROUPS)[number]["id"];
export type TaskCostRow = {
  date: string;
  taskId: TaskCostGroupId;
  source: string;
  model: string;
  amount: number;
  records: number;
  unpricedRecords: number;
};
export type OpsTaskCostResponse = {
  from: string;
  through: string;
  generatedAt: string;
  rows: TaskCostRow[];
  excludedAttributions: number;
};

// These are technical source identifiers, not classification of conversation text.
export function taskGroupForSource(source: string): TaskCostGroupId {
  if (
    source === "career/realtime" ||
    source === "career/live" ||
    source === "career/internal-opportunity-call-request"
  )
    return "voice";
  if (
    [
      "career/profile_ingestion",
      "career/gmail-career-history",
      "career_tool:update_talent_profile",
    ].includes(source)
  )
    return "profile";
  if (
    [
      "career_tool:web_search",
      "career_tool:open_url",
      "career_tool:research_company",
    ].includes(source)
  )
    return "research";
  if (source.startsWith("org/") || source === "company_first_search")
    return "company";
  if (source === "email_reply") return "email";
  if (
    source === "opportunity_discovery" ||
    source === "career_tool" ||
    [
      "career_tool:recommend_job_postings",
      "career_tool:read_recommended_opportunities",
      "career_tool:get_internal_roles",
      "career_tool:internal_role_priority_review",
      "career_tool:request_internal_role_reconsideration",
      "career_tool:get_role_context",
      "career_tool:update_recommended_opportunity_feedback",
      "career_tool:record_internal_fit_reevaluation_information",
    ].includes(source)
  )
    return "recommendation";
  if (
    [
      "career/chat",
      "career_tool:update_setting",
      "career_tool:read_talent_activity_events",
    ].includes(source)
  )
    return "career-chat";
  return "other";
}

export function summarizeTaskCosts(rows: TaskCostRow[], date: string | null) {
  return TASK_COST_GROUPS.map((group) => {
    const details = rows.filter(
      (row) => row.taskId === group.id && (!date || row.date === date)
    );
    const sources = new Map<string, Omit<TaskCostRow, "date">>();
    for (const row of details) {
      const key = JSON.stringify([row.source, row.model]);
      const entry = sources.get(key) ?? {
        ...row,
        amount: 0,
        records: 0,
        unpricedRecords: 0,
      };
      entry.amount += row.amount;
      entry.records += row.records;
      entry.unpricedRecords += row.unpricedRecords;
      sources.set(key, entry);
    }
    return {
      ...group,
      amount: details.reduce((sum, row) => sum + row.amount, 0),
      records: details.reduce((sum, row) => sum + row.records, 0),
      unpricedRecords: details.reduce(
        (sum, row) => sum + row.unpricedRecords,
        0
      ),
      details: [...sources.values()].sort((a, b) => b.amount - a.amount),
    };
  })
    .filter((group) => group.records > 0)
    .sort((a, b) => b.amount - a.amount);
}
