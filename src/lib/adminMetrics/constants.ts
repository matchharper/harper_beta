import type { AdminMetricDefinition, AdminMetricKey } from "./types";

export const ADMIN_METRIC_DEFAULT_START_DATE = "2026-03-01";
export const ADMIN_METRIC_DEFAULT_GRID_COLS = 2;
export const ADMIN_METRIC_MIN_GRID_COLS = 1;
export const ADMIN_METRIC_MAX_GRID_COLS = 4;

export const ADMIN_METRIC_DEFAULT_SELECTED_KEYS: AdminMetricKey[] = [
  "signupCount",
  "runCount",
  "uniqueProfileViewCount",
  "profileEntryToLinkClickRate",
];

export const ADMIN_METRIC_DEFINITIONS: AdminMetricDefinition[] = [
  {
    key: "signupCount",
    label: "회원가입 수",
    description: "company_users 생성 수",
    color: "#1f5eff",
    valueType: "count",
  },
  {
    key: "runCount",
    label: "검색 수",
    description: "runs 생성 수",
    color: "#0f9d7a",
    valueType: "count",
  },
  {
    key: "revealCount",
    label: "Reveal된 프로필 수",
    description: "unlock_profile 생성 수",
    color: "#d97706",
    valueType: "count",
  },
  {
    key: "uniqueProfileViewCount",
    label: "프로필 진입 수",
    description: "유저-후보자 기준 유니크 진입 수",
    color: "#7c3aed",
    valueType: "count",
  },
  {
    key: "markedCandidateCount",
    label: "마크 추가/변경 후보자 수",
    description: "유저-후보자 기준 유니크 mark 변경 수",
    color: "#ef4444",
    valueType: "count",
  },
  {
    key: "profileLinkClickCount",
    label: "프로필 링크 클릭 수",
    description: "profile_link_click 로그 수",
    color: "#db2777",
    valueType: "count",
  },
  {
    key: "chatInputCount",
    label: "입력한 채팅 수",
    description: "messages.role = 0 수",
    color: "#0891b2",
    valueType: "count",
  },
  {
    key: "loginUserCount",
    label: "로그인한 사람 수",
    description: "login_completed 유니크 유저 수",
    color: "#475569",
    valueType: "count",
  },
  {
    key: "avgProfileViewsPerUser",
    label: "유저별 평균 프로필 클릭 수",
    description: "유니크 프로필 진입 수 / 프로필 진입 유저 수",
    color: "#9333ea",
    valueType: "decimal",
  },
  {
    key: "avgRunsPerUser",
    label: "유저별 평균 검색 수",
    description: "runs 수 / 검색 유저 수",
    color: "#16a34a",
    valueType: "decimal",
  },
  {
    key: "profileEntryToLinkClickRate",
    label: "프로필 진입 대비 링크 클릭 비율",
    description: "링크 클릭이 발생한 유니크 프로필 진입 수 / 유니크 프로필 진입 수",
    color: "#ea580c",
    valueType: "percent",
  },
];
