// Synthetic, browser-only examples. Never passed to a database or a scoring API.
export type PreviewJob = {
  id: string;
  company: string;
  mark: string;
  title: string;
  location: string;
  pay: string;
  reason: string;
  concern: string;
  date: string;
  country: "KR" | "US";
  fresh?: boolean;
};

export const jobs: PreviewJob[] = [
  {
    id: "demo-1",
    company: "Orbit Studio",
    mark: "O",
    title: "Senior Product Engineer",
    location: "서울 · 하이브리드",
    pay: "9,000만–1.3억원",
    reason:
      "제품 방향을 정하는 단계부터 참여하고, AI 기능을 직접 출시할 수 있어요.",
    concern: "초기 팀이라 제품 개발 외 운영 업무도 맡아요.",
    date: "10월 9일",
    country: "KR",
  },
  {
    id: "demo-2",
    company: "Morrow",
    mark: "M",
    title: "Frontend Engineer, AI Workspace",
    location: "서울 · 주 2회 출근",
    pay: "8,500만–1.2억원",
    reason:
      "프론트엔드 경험을 살리면서, 대화형 AI 제품으로 역할을 넓힐 수 있어요.",
    concern: "모델 개발보다 사용자 경험 구현에 가까운 역할이에요.",
    date: "10월 28일",
    country: "KR",
    fresh: true,
  },
  {
    id: "demo-3",
    company: "Layer Works",
    mark: "L",
    title: "Founding Product Engineer",
    location: "한국 · 원격",
    pay: "1억–1.4억원",
    reason:
      "작은 팀에서 설계부터 출시까지 맡고, 한국에서 원격으로 일할 수 있어요.",
    concern: "미국 팀과 주 2회 저녁 회의가 있어요.",
    date: "10월 21일",
    country: "KR",
  },
  {
    id: "demo-4",
    company: "Fieldnote",
    mark: "F",
    title: "Senior Frontend Engineer",
    location: "서울 · 하이브리드",
    pay: "연봉 미공개",
    reason: "복잡한 B2B 제품을 단순하게 만드는 경험이 잘 맞아요.",
    concern: "제품 로드맵의 최종 결정은 별도 PM이 맡아요.",
    date: "10월 25일",
    country: "KR",
  },
  {
    id: "demo-5",
    company: "Forma",
    mark: "f",
    title: "Design Engineer",
    location: "서울 · 주 3회 출근",
    pay: "8,000만–1.1억원",
    reason: "디자인과 개발 사이의 일을 좋아한다면 검토할 만한 역할이에요.",
    concern: "직접적인 AI 기능 개발 비중은 낮아요.",
    date: "10월 18일",
    country: "KR",
  },
  {
    id: "demo-6",
    company: "Common Ground",
    mark: "C",
    title: "Product Engineer",
    location: "부산 · 원격 협의",
    pay: "8,000만–1.2억원",
    reason: "고객과 직접 소통하며 제품을 개선하는 범위가 넓어요.",
    concern: "온보딩 기간에는 부산 출근이 필요해요.",
    date: "10월 24일",
    country: "KR",
  },
  {
    id: "demo-7",
    company: "Northstar Labs",
    mark: "N",
    title: "Senior Software Engineer",
    location: "샌프란시스코 · 하이브리드",
    pay: "$180k–230k",
    reason: "초기 AI 제품을 맡는 역할이고, 프론트엔드 경험을 폭넓게 활용해요.",
    concern: "미국 근무 자격과 이주 지원 여부를 확인해야 해요.",
    date: "10월 12일",
    country: "US",
  },
  {
    id: "demo-8",
    company: "Daylight",
    mark: "D",
    title: "Product Engineer, AI",
    location: "뉴욕 · 대면근무",
    pay: "$170k–220k",
    reason: "AI 도구의 전체 사용자 경험을 책임지는 역할이에요.",
    concern: "뉴욕으로 이주해야 해요.",
    date: "10월 16일",
    country: "US",
  },
  {
    id: "demo-9",
    company: "Paperplane",
    mark: "P",
    title: "Staff Frontend Engineer",
    location: "미국 · 원격",
    pay: "$190k–250k",
    reason: "개발 경험과 기술 리더십을 함께 활용할 수 있어요.",
    concern: "원격근무 가능 지역이 미국으로 한정돼요.",
    date: "10월 20일",
    country: "US",
  },
  {
    id: "demo-11",
    company: "Canvas Lab",
    mark: "C",
    title: "Senior Product Engineer, AI",
    location: "서울 · 하이브리드",
    pay: "9,500만–1.3억원",
    reason: "AI 기반 디자인 도구의 사용자 경험을 직접 설계하고 출시해요.",
    concern: "디자이너와 협업한 포트폴리오를 중요하게 봐요.",
    date: "10월 28일",
    country: "KR",
    fresh: true,
  },
  {
    id: "demo-10",
    company: "Relay",
    mark: "R",
    title: "Product Engineer, Collaboration",
    location: "서울 · 하이브리드",
    pay: "9,000만–1.2억원",
    reason: "새 협업 제품의 첫 사용자 경험을 주도할 수 있어요.",
    concern: "담당 제품이 아직 출시 전이에요.",
    date: "10월 28일",
    country: "KR",
    fresh: true,
  },
];

export const history: PreviewJob[] = Array.from({ length: 90 }, (_, i) => ({
  ...jobs[i % 9],
  id: i < 9 ? jobs[i].id : `demo-history-${i}`,
  title:
    i < 9
      ? jobs[i].title
      : `${jobs[i % 9].title} · ${["Platform", "Core Product", "Developer Tools"][i % 3]}`,
  date: i < 9 ? jobs[i].date : `10월 ${Math.max(1, 27 - Math.floor(i / 4))}일`,
  fresh: false,
}));
