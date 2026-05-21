export type CareerUpdateNote = {
  id: string;
  dateLabel: string;
  title: string;
  summary: string;
  items: string[];
  tag?: string;
};

// Add the newest note at the top.
export const careerUpdateNotes: CareerUpdateNote[] = [
  {
    id: "2026-05-19-mobile-career",
    dateLabel: "2026.05.19",
    title: "모바일에서도 커리어 흐름을 보기 쉽게 정리했어요",
    summary:
      "작은 화면에서도 홈, 추천 포지션, 대화 흐름을 더 편하게 오갈 수 있도록 다듬었습니다.",
    tag: "New",
    items: [
      "모바일 홈에서 지금 확인할 내용과 다음 액션이 더 또렷하게 보이도록 정리했어요.",
      "추천 포지션과 히스토리로 이동하는 흐름을 작은 화면에 맞게 조정했어요.",
      "상단/하단 액션이 내용을 가리지 않도록 간격과 상태 표시를 다듬었어요.",
    ],
  },
  {
    id: "2026-05-16-update-notes",
    dateLabel: "2026.05.16",
    title: "업데이트 노트와 제안하기를 열었어요",
    summary:
      "Harper가 어떻게 바뀌고 있는지 확인하고, 필요한 개선을 바로 알려줄 수 있게 했습니다.",
    items: [
      "프로필 메뉴에서 최근 업데이트를 한 번에 확인할 수 있어요.",
      "개선이 필요한 부분은 제안하기로 바로 남길 수 있어요.",
      "LinkedIn과 웹사이트 링크를 함께 두어 Harper의 최근 활동도 쉽게 볼 수 있어요.",
    ],
  },
  {
    id: "2026-05-11-career-workspace",
    dateLabel: "2026.05.11",
    title: "홈과 추천 흐름을 정리했어요",
    summary:
      "지금 볼 내용과 다음 액션이 더 분명하게 보이도록 커리어 워크스페이스를 다듬었습니다.",
    items: [
      "홈에서 확인해야 할 내용을 더 빠르게 찾을 수 있어요.",
      "추천 포지션의 저장/지원 상태가 더 명확하게 보이도록 정리했어요.",
      "다음으로 할 수 있는 액션을 화면 안에서 더 자연스럽게 이어가도록 조정했어요.",
    ],
  },
  {
    id: "2026-05-07-profile-links",
    dateLabel: "2026.05.07",
    title: "프로필과 링크 관리를 정리했어요",
    summary:
      "이력서, LinkedIn, 포트폴리오 링크를 더 쉽게 확인하고 수정할 수 있게 했습니다.",
    items: [
      "프로필 설정과 이력서/링크 관리 영역을 분리했어요.",
      "저장 전 변경된 내용을 더 분명하게 확인할 수 있어요.",
    ],
  },
  {
    id: "2026-05-04-feedback",
    dateLabel: "2026.05.04",
    title: "추천 피드백 흐름을 개선했어요",
    summary:
      "관심 있는 포지션과 그렇지 않은 포지션을 더 쉽게 구분할 수 있도록 정리했습니다.",
    items: [
      "추천 카드에서 관심 여부를 남기는 과정이 더 짧아졌어요.",
      "남긴 피드백은 이후 추천 품질을 개선하는 데 사용됩니다.",
    ],
  },
];
