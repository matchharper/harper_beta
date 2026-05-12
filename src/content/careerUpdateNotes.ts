export type CareerUpdateNote = {
  id: string;
  dateLabel: string;
  title: string;
  summary: string;
  items: string[];
  tag?: string;
};

// Add the newest note at the top. Change `id` when the latest note should show
// as unread again in the profile menu.
export const careerUpdateNotes: CareerUpdateNote[] = [
  {
    id: "2026-05-11-career-workspace",
    dateLabel: "2026.05.11",
    title: "커리어 워크스페이스를 더 정돈했어요",
    summary: "추천 포지션을 보고, 다음 액션을 고르는 흐름을 가볍게 다듬었습니다.",
    tag: "New",
    items: [
      "홈에서 지금 해야 할 일을 더 빠르게 확인할 수 있어요.",
      "포지션 탭의 저장/지원 상태가 더 명확하게 보이도록 정리했어요.",
      "프로필 메뉴에서 앞으로의 업데이트를 바로 확인할 수 있어요.",
    ],
  },
  {
    id: "2026-05-07-profile-links",
    dateLabel: "2026.05.07",
    title: "프로필과 링크 관리가 쉬워졌어요",
    summary: "이력서, LinkedIn, 포트폴리오 링크를 한 곳에서 정리할 수 있게 했습니다.",
    items: [
      "프로필 설정과 이력서/링크 관리를 분리했어요.",
      "저장 전 변경 사항을 더 분명하게 확인할 수 있어요.",
    ],
  },
  {
    id: "2026-05-04-feedback",
    dateLabel: "2026.05.04",
    title: "추천 피드백을 반영하기 시작했어요",
    summary: "관심 있는 포지션과 아닌 포지션을 더 잘 구분하도록 피드백 흐름을 개선했습니다.",
    items: [
      "추천 카드에서 관심 여부를 남기는 흐름이 더 짧아졌어요.",
      "남긴 피드백은 이후 추천 품질 개선에 사용됩니다.",
    ],
  },
];

export const latestCareerUpdateNote = careerUpdateNotes[0] ?? null;

export const CAREER_UPDATE_NOTES_STORAGE_KEY =
  "harper.career.updateNotes.latestSeenId";
