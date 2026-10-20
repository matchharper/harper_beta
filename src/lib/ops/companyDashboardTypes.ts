export const COMPANY_METRICS = {
  visits: {
    label: "웹 방문",
    description:
      "팀원별 하루 한 번의 워크스페이스 방문. 기록 추가 이후부터 집계합니다.",
  },
  chats: {
    label: "팀원 메시지",
    description:
      "웹·Slack에서 팀원이 보낸 완료된 메시지 수. Harper 응답은 제외합니다.",
  },
  presented: {
    label: "회사 추천 전달",
    description:
      "회사에 전달된 후보자 제안 수. 같은 실행의 여러 채널 전달은 중복 제거합니다.",
  },
  intros: {
    label: "Intro 요청",
    description: "회사가 명시적으로 Intro를 요청한 횟수.",
  },
  feedback: {
    label: "회사 피드백",
    description: "회사의 후보자 패스 및 단계 변경 기록 수.",
  },
  profileViews: {
    label: "후보자 최초 열람",
    description:
      "후보자 프로필 최초 열람 기록 수. 반복 열람은 포함하지 않습니다.",
  },
} as const;
export type CompanyMetric = keyof typeof COMPANY_METRICS;
export type CompanyDashboardRole = {
  id: string;
  name: string;
  status: string;
  hiringStartedAt: string | null;
  hiringStartBasis: "activation" | "status_change";
  candidateCounts: Array<{ id: string; label: string; count: number }>;
};
export type CompanyDashboardActivity = {
  id: string;
  title: string;
  occurredAt: string;
};
export type CompanyDashboard = {
  from: string;
  through: string;
  companies: Array<{
    id: string;
    name: string;
    roles: CompanyDashboardRole[];
    activities: CompanyDashboardActivity[];
  }>;
  points: Array<{
    date: string;
    workspaceId: string;
    metric: CompanyMetric;
    value: number;
  }>;
};
