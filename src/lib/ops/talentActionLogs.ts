export const OPS_TALENT_ACTION_SOURCE_GROUPS = [
  "product",
  "recommendations",
  "communication",
] as const;

export type OpsTalentActionSourceGroup =
  (typeof OPS_TALENT_ACTION_SOURCE_GROUPS)[number];

export type OpsTalentActionView = "summary" | "weekly";

export type OpsTalentActionId =
  | "brief_viewed"
  | "composer_add_clicked"
  | "email_replied"
  | "external_recommendation_received"
  | "external_recommendation_viewed"
  | "gmail_connect_clicked"
  | "gmail_connect_failed"
  | "gmail_connect_succeeded"
  | "history_company_modal_opened"
  | "history_pipeline_viewed"
  | "history_position_detail_viewed"
  | "internal_recommendation_feedback"
  | "internal_recommendation_received"
  | "job_posting_opened"
  | "priority_review_called"
  | "profile_context_changed"
  | "recommend_job_postings_called"
  | "recommendation_advanced"
  | "recommendation_feedback_any"
  | "referral_viewed"
  | "settings_opened"
  | "two_way_call"
  | "about_viewed"
  | "update_notes_viewed";

export type OpsTalentActionDefinition = {
  id: OpsTalentActionId;
  label: string;
  sourceGroup: OpsTalentActionSourceGroup;
  trackingSince?: string;
};

export type OpsTalentActionSection = {
  actions: OpsTalentActionDefinition[];
  id: string;
  label: string;
};

export const OPS_TALENT_ACTION_SECTIONS: OpsTalentActionSection[] = [
  {
    id: "brief-memory",
    label: "Brief · Memory",
    actions: [
      {
        id: "brief_viewed",
        label: "Brief 탭 봄",
        sourceGroup: "product",
      },
      {
        id: "profile_context_changed",
        label: "온보딩 후 Brief/Memory 변경",
        sourceGroup: "product",
      },
    ],
  },
  {
    id: "external-recommendations",
    label: "External 추천",
    actions: [
      {
        id: "external_recommendation_received",
        label: "추천 받음",
        sourceGroup: "recommendations",
      },
      {
        id: "external_recommendation_viewed",
        label: "추천 1개 이상 봄",
        sourceGroup: "recommendations",
      },
      {
        id: "recommendation_advanced",
        label: "다음 추천으로 넘김",
        sourceGroup: "product",
      },
      {
        id: "job_posting_opened",
        label: "채용 공고 원문 열기",
        sourceGroup: "product",
      },
      {
        id: "recommend_job_postings_called",
        label: "새 포지션 더 요청",
        sourceGroup: "product",
      },
      {
        id: "recommendation_feedback_any",
        label: "추천 피드백 남김",
        sourceGroup: "recommendations",
      },
    ],
  },
  {
    id: "internal-recommendations",
    label: "Internal 추천",
    actions: [
      {
        id: "internal_recommendation_received",
        label: "추천 받음",
        sourceGroup: "recommendations",
      },
      {
        id: "internal_recommendation_feedback",
        label: "추천 피드백 남김",
        sourceGroup: "recommendations",
      },
      {
        id: "priority_review_called",
        label: "우선 검토 요청",
        sourceGroup: "product",
      },
    ],
  },
  {
    id: "history",
    label: "History",
    actions: [
      {
        id: "history_pipeline_viewed",
        label: "저장 포지션 파이프라인 봄",
        sourceGroup: "product",
        trackingSince: "09.17",
      },
      {
        id: "history_position_detail_viewed",
        label: "저장 포지션 상세 봄",
        sourceGroup: "product",
        trackingSince: "09.17",
      },
      {
        id: "history_company_modal_opened",
        label: "회사 사이드 모달 열기",
        sourceGroup: "product",
      },
    ],
  },
  {
    id: "communication",
    label: "대화 · 이메일",
    actions: [
      {
        id: "composer_add_clicked",
        label: "채팅 + 버튼 클릭",
        sourceGroup: "product",
        trackingSince: "09.17",
      },
      {
        id: "two_way_call",
        label: "양방향 통화 완료",
        sourceGroup: "communication",
      },
      {
        id: "email_replied",
        label: "이메일 답장",
        sourceGroup: "communication",
      },
    ],
  },
  {
    id: "settings-other",
    label: "설정 · 기타",
    actions: [
      {
        id: "settings_opened",
        label: "설정 모달 열기",
        sourceGroup: "product",
      },
      {
        id: "referral_viewed",
        label: "레퍼럴 화면 봄",
        sourceGroup: "product",
      },
      {
        id: "gmail_connect_clicked",
        label: "Gmail 연결 클릭",
        sourceGroup: "product",
      },
      {
        id: "gmail_connect_succeeded",
        label: "Gmail 연결 성공",
        sourceGroup: "product",
      },
      {
        id: "gmail_connect_failed",
        label: "Gmail 연결 실패",
        sourceGroup: "product",
        trackingSince: "09.17",
      },
      {
        id: "update_notes_viewed",
        label: "업데이트 노트 봄",
        sourceGroup: "product",
        trackingSince: "09.17",
      },
      {
        id: "about_viewed",
        label: "About 봄",
        sourceGroup: "product",
        trackingSince: "09.17",
      },
    ],
  },
];

export type OpsTalentActionMetric = {
  actionId: OpsTalentActionId;
  percentage: number;
  userCount: number;
};

export type OpsTalentActionWeek = {
  cohortTotal: number;
  items: OpsTalentActionMetric[];
  weekStart: string;
};

export type OpsTalentActionLogsResponse = {
  cohortTotal: number;
  filters: {
    days: number;
    group: OpsTalentActionSourceGroup;
    view: OpsTalentActionView;
    weeks: number;
  };
  generatedAt: string;
  items: OpsTalentActionMetric[];
  weeks: OpsTalentActionWeek[];
};

export function isOpsTalentActionSourceGroup(
  value: unknown
): value is OpsTalentActionSourceGroup {
  return OPS_TALENT_ACTION_SOURCE_GROUPS.includes(
    value as OpsTalentActionSourceGroup
  );
}

export function isOpsTalentActionView(
  value: unknown
): value is OpsTalentActionView {
  return value === "summary" || value === "weekly";
}
