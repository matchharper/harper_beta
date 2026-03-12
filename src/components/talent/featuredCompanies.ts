export type FeaturedCompanyKey = "toss" | "karrot" | "rebellions" | "wonderful";

export type FeaturedCompanyProfile = {
  id: FeaturedCompanyKey;
  triggerLabel: string;
  name: string;
  headline: string;
  summary: string;
  description: string;
  fitNote: string;
  signals: string[];
  tags: string[];
  officialUrl: string;
  mark: string;
  badgeClassName: string;
};

export const FEATURED_COMPANIES: FeaturedCompanyProfile[] = [
  {
    id: "toss",
    triggerLabel: "토스",
    name: "토스",
    headline: "금융을 더 쉽고 자연스럽게 만드는 제품 팀",
    summary:
      "송금에서 시작해 결제, 뱅킹, 증권 등 여러 금융 경험을 하나의 제품 흐름으로 연결해 온 핀테크 플랫폼입니다.",
    description:
      "토스는 복잡한 금융 과정을 짧고 명확한 사용자 경험으로 바꾸는 데 강한 팀입니다. 작은 마찰도 제품 문제로 보고 집요하게 개선하는 문화가 중요한 회사입니다.",
    fitNote:
      "복잡한 도메인을 빠르게 이해하고, 제품 완성도와 실행 속도를 동시에 끌어올리는 사람에게 잘 맞습니다.",
    signals: [
      "복잡한 금융 규칙을 사용자 입장에서는 단순하게 느껴지도록 다시 설계합니다.",
      "제품, 데이터, 엔지니어링, 디자인이 촘촘하게 붙어 빠르게 실험하고 개선합니다.",
      "정답이 불분명한 문제에서도 사용자 경험 기준으로 끝까지 밀어붙이는 execution이 중요합니다.",
    ],
    tags: ["핀테크", "Consumer Product", "Execution", "Product Quality"],
    officialUrl: "https://toss.im/career/toss",
    mark: "T",
    badgeClassName: "bg-[#EEF2FF] text-[#2F5BFF]",
  },
  {
    id: "karrot",
    triggerLabel: "당근",
    name: "당근",
    headline: "동네의 모든 연결을 제품으로 만드는 로컬 팀",
    summary:
      "당근은 지역 기반 중고거래에서 출발해 커뮤니티, 모임, 알바, 광고, 결제까지 로컬 생활 전반을 잇는 서비스를 만들어 왔습니다.",
    description:
      "로컬이라는 제약을 오히려 제품 차별점으로 바꾸는 팀입니다. 온라인 네트워크가 아니라 실제 생활권에서 발생하는 문제를 풀어야 해서 사용자 맥락과 운영 감각이 중요합니다.",
    fitNote:
      "실제 사용자 행동을 집요하게 보고, 네트워크 효과가 생기는 제품을 만들고 싶은 사람에게 잘 맞습니다.",
    signals: [
      "거래, 커뮤니티, 광고, 결제처럼 서로 다른 문제를 하나의 로컬 그래프로 엮습니다.",
      "생활 밀착형 서비스라 작은 UX 변화도 사용자 체감 차이를 크게 만듭니다.",
      "지역성과 신뢰를 동시에 지키는 제품 판단이 중요합니다.",
    ],
    tags: ["Hyperlocal", "Community", "Marketplace", "Trust"],
    officialUrl: "https://about.daangn.com/company/",
    mark: "D",
    badgeClassName: "bg-[#FFF1E8] text-[#FF6A1A]",
  },
  {
    id: "rebellions",
    triggerLabel: "리벨리온",
    name: "리벨리온",
    headline: "생성형 AI 인프라를 위한 칩을 만드는 딥테크 팀",
    summary:
      "리벨리온은 생성형 AI 워크로드에 최적화된 에너지 효율형 AI 가속기를 개발하는 AI 반도체 회사입니다.",
    description:
      "모델 자체보다 인프라 레이어에서 차별화되는 기술을 만드는 팀에 가깝습니다. 하드웨어, 시스템, 소프트웨어가 함께 맞물려야 하므로 기술적 깊이와 제품화 감각이 동시에 요구됩니다.",
    fitNote:
      "낮은 레벨의 기술 난제를 끝까지 파고들면서도 실제 배포 환경까지 고려하는 사람에게 잘 맞습니다.",
    signals: [
      "칩 설계, 시스템 소프트웨어, 배포 환경이 긴밀하게 연결됩니다.",
      "성능뿐 아니라 전력 효율과 실제 운영 가능성이 중요한 문제입니다.",
      "연구와 제품화 사이 간극을 줄이는 execution이 핵심입니다.",
    ],
    tags: ["AI Chip", "Infra", "Deep Tech", "Systems"],
    officialUrl: "https://rebellions.ai/",
    mark: "R",
    badgeClassName: "bg-[#FEECEC] text-[#D92D20]",
  },
  {
    id: "wonderful",
    triggerLabel: "wonderful",
    name: "Wonderful",
    headline: "언어와 문화 맥락까지 반영하는 AI 에이전트 팀",
    summary:
      "Wonderful은 음성, 채팅, 이메일 전반에서 동작하는 엔터프라이즈용 AI 에이전트 플랫폼을 만드는 회사입니다.",
    description:
      "단순 챗봇이 아니라 실제 업무 플로우에 붙는 에이전트를 빠르게 배포하는 데 초점을 둔 팀입니다. 언어, 규제, 운영 환경이 다른 시장마다 제품을 적용해야 해서 현장성 있는 execution이 중요합니다.",
    fitNote:
      "모델 그 자체보다 고객 워크플로우에 AI를 제대로 안착시키는 데 관심이 큰 사람에게 잘 맞습니다.",
    signals: [
      "복잡한 기업 시스템과 연결되는 applied AI 문제가 많습니다.",
      "모델 성능보다 실제 운영 지표와 배포 속도가 중요합니다.",
      "여러 언어와 시장 특성을 고려한 로컬라이제이션이 핵심 경쟁력입니다.",
    ],
    tags: ["AI Agents", "Enterprise", "Multilingual", "Applied AI"],
    officialUrl: "https://www.wonderful.ai/about-us",
    mark: "W",
    badgeClassName: "bg-[#EAFBF3] text-[#0E9F6E]",
  },
];

export const FEATURED_COMPANY_BY_ID = FEATURED_COMPANIES.reduce<
  Record<FeaturedCompanyKey, FeaturedCompanyProfile>
>(
  (acc, company) => {
    acc[company.id] = company;
    return acc;
  },
  {} as Record<FeaturedCompanyKey, FeaturedCompanyProfile>
);
