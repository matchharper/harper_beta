import type { OfficialJobsLocale } from "./copy";

const copy = {
  ko: {
    howTitle: "How Harper Works",
    steps: [
      {
        title: "가입하고, Harper와 대화하세요.",
        body: "어떤 일을 해왔는지, 다음에는 어떤 환경에서 일하고 싶은지 알려주세요.",
      },
      {
        title: "마음에 드는 역할에 관심을 표시하세요.",
        body: "관심을 표시하시면 Harper가 먼저 해당 역할을 검토합니다. 회사에서 Harper에게 알려준 내부 정보를 바탕으로 회원님과 역할의 적합도를 판단합니다.",
      },
      {
        title: "회사와 인재를 연결합니다.",
        body: "적합하다고 판단했다면 회사에 회원님을 먼저 추천하거나 회원님에게 먼저 역할을 진행할지 다시 물어봅니다.(직접 설정) 수락하면 Harper가 바로 연결을 도와드립니다.",
      },
      {
        title: "일하는 동안에도, 다음 기회는 열어두세요.",
        body: "Harper는 항상 회원님의 기준에 맞는 기회를 살펴보고 새로운 연결을 제안합니다. 당장 이직할 생각이 없어도 괜찮아요. 회사의 제안들을 받아본 뒤 결정하세요. 프로세스를 진행하는 과정까지 Harper가 도와드립니다.",
      },
    ],
    faqs: [
      {
        question: "여기 있는 채용 기회, 진짜인가요?",
        answer:
          "네. 실제로 회사에서 요청한 역할이고, Harper가 회사와 직접 이야기하고 있어요.",
      },
      {
        question: "여기서 제가 직접 지원을 하는 건가요?",
        answer:
          "Harper는 회사에서 알려준 내부 정보를 바탕으로 회원님과 역할의 적합도를 판단해요. 적합하다고 판단하면 회사에 회원님을 먼저 추천하거나, 회원님에게 먼저 이 역할을 진행할지 물어봅니다. 수락하시면 Harper가 바로 연결을 도와드려요. 여기서는 관심 있는 역할을 알려주세요. 그 역할을 먼저 검토하고, 회원님을 잘 소개하는 데 필요한 정보를 준비할게요.",
      },
      {
        question: "해당 회사의 역할에 직접 지원하는 것과 뭐가 다른가요?",
        answer:
          "미팅까지 이어질 가능성이 더 높고, 진행 과정도 Harper가 함께 도와드려요.",
      },
      {
        question: "제 정보가 회사에 공개되나요?",
        answer:
          "두 가지 방식 중 직접 선택할 수 있어요. Exceptional only에서는 좋은 기회를 회원님에게 먼저 추천하고, 수락과 프로필 공개를 허용하신 뒤 회사에 전달해요. Open to matches에서는 잘 맞는 기회일 때 Harper가 프로필을 먼저 회사에 소개할 수 있어요. 더 많은 기회에 연결될 수 있고, 회사의 제안을 받아본 뒤 진행할지 결정하실 수 있습니다.",
      },
      {
        question: "지금 이직할 생각이 없어도 괜찮나요?",
        answer:
          "네. 지금은 옮길 계획이 없다고 알려주세요. 마음에 드는 제안이 있을 때 살펴보고, 그때 결정하셔도 돼요.",
      },
      {
        question: "중간 과정에서 사람이 제 프로필을 직접 검토하나요?",
        answer:
          "Harper Agent가 먼저 역할과의 적합도를 검토해요. 회사에 실제로 소개하기 전에는 Harper 팀원이 최종 확인합니다. 프로필은 회원님의 설정과 동의에 따라 회사에 공유돼요.",
      },
    ],
    more: "역할 더 보기",
    loading: "역할을 불러오는 중…",
    retry: "다시 시도",
    loadError: "역할을 불러오지 못했어요. 다시 시도해 주세요.",
  },
  en: {
    howTitle: "How Harper Works",
    steps: [
      {
        title: "Sign up and talk to Harper.",
        body: "Tell Harper about the work you've done and the kind of environment you'd like to work in next.",
      },
      {
        title: "Show interest in a role you like.",
        body: "Harper will review the role and assess how well it fits you, using information the company has shared privately with Harper.",
      },
      {
        title: "Harper connects you with the company.",
        body: "If it looks like a good fit, Harper may recommend you to the company first or ask whether you'd like to move forward with the role, depending on your settings. If you say yes, Harper helps make the connection right away.",
      },
      {
        title: "Keep the door open while you work.",
        body: "Harper keeps looking for opportunities that match what you want and suggests new connections. You don't have to be actively job searching. You can consider each company's proposal before deciding whether to move forward, and Harper will help you through the process.",
      },
    ],
    faqs: [
      {
        question: "Are these real job opportunities?",
        answer:
          "Yes. These are roles companies have asked Harper to help with, and Harper is in direct contact with them.",
      },
      {
        question: "Am I applying directly here?",
        answer:
          "No. Harper uses information the company has shared privately to assess how well the role fits you. If it looks like a good fit, Harper may recommend you to the company first or ask whether you'd like to move forward with the role first. If you accept, Harper helps make the connection right away. For now, tell Harper which role interests you. Harper will review it first and prepare what it needs to introduce you well.",
      },
      {
        question:
          "How is this different from applying directly to the company?",
        answer:
          "You're more likely to reach a meeting, and Harper helps you through the process.",
      },
      {
        question: "Will my information be shared with the company?",
        answer:
          "You can choose between two approaches. With Exceptional only, Harper shows you a strong opportunity first and shares your profile with the company only after you accept and allow profile sharing. With Open to matches, Harper may introduce your profile to a company first when there's a strong fit. This can lead to more opportunities, and you can review the company's proposal before deciding whether to move forward.",
      },
      {
        question: "What if I'm not looking to move right now?",
        answer:
          "That's fine. Tell Harper you're not planning a move right now. You can look at a proposal you like and decide then.",
      },
      {
        question: "Does a person review my profile along the way?",
        answer:
          "Harper Agent reviews the fit first. Before an introduction to a company, a Harper team member gives the connection a final check. Your profile is shared with the company according to your settings and consent.",
      },
    ],
    more: "Load more roles",
    loading: "Loading roles…",
    retry: "Try again",
    loadError: "We could not load the roles. Please try again.",
  },
};

export function getOfficialJobsExperienceCopy(locale: OfficialJobsLocale) {
  return copy[locale];
}
