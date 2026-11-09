import { WONDERFUL_KOREA_FDE_ROLE_ID } from "./devWonderfulRoleResetTargets";

export const APPLICATION_TEST_START = {
  key: "application-start-472788-v1",
  lastMessageId: 472788,
  label: "지원 테스트 시작 · 4개 공고",
  roles: [
    { id: "195e467b-0a83-4557-9dd7-93a107bd8f40", type: "external" },
    { id: "fa80f46d-8040-44af-a9df-9e6b1941b29e", type: "external" },
    { id: "c351ca7c-b561-4c68-ab04-6b2d3212efa9", type: "external" },
    { id: WONDERFUL_KOREA_FDE_ROLE_ID, type: "internal" },
  ],
} as const;
