import type { Locale } from "@/i18n/useMessage";

export type CompanyConcept = "1" | "2" | "3";
export const COMPANY_CONCEPTS: readonly CompanyConcept[] = ["1", "2", "3"];

const text = (locale: Locale, ko: string, en: string) =>
  locale === "ko" ? ko : en;

export const conceptMetadata = {
  "1": {
    ko: {
      name: "공고 너머의 사람",
      theme: "공감 · 발견 · 관계",
      description:
        "찾던 인재가 공고를 보고 있지 않을 수 있다는 공감에서 출발합니다. Harper가 아는 후보자의 다음 선택을 보여줍니다.",
    },
    en: {
      name: "Beyond the job post",
      theme: "Empathy · Discovery · Relationships",
      description:
        "Start with the people a job post may never reach. Show how Harper understands what they want to do next.",
    },
  },
  "2": {
    ko: {
      name: "채용을 함께 맡는 파트너",
      theme: "공감 · 위임 · 팀워크",
      description:
        "채용 때문에 본업을 놓치는 부담에 공감합니다. Harper가 맡는 일과 팀이 결정하는 일을 구체적으로 보여줍니다.",
    },
    en: {
      name: "A partner in the work",
      theme: "Empathy · Delegation · Teamwork",
      description:
        "Speak to the work behind every hire. Make it clear what Harper takes on and what your team decides.",
    },
  },
  "3": {
    ko: {
      name: "만날 이유가 보이는 채용",
      theme: "이해 · 근거 · 신뢰",
      description:
        "좋은 경력만으로는 알 수 없는 맥락을 보여줍니다. 후보자를 만나볼 이유와 연결의 결정권을 설명합니다.",
    },
    en: {
      name: "A reason to meet",
      theme: "Context · Evidence · Trust",
      description:
        "Go beyond a strong résumé. Show the context behind a match and how both sides decide to connect.",
    },
  },
} as const;

export function getConceptHero(concept: CompanyConcept, locale: Locale) {
  const titles = {
    "1":
      locale === "ko"
        ? ["찾던 인재가,", "공고를 보고 있지 않다면."]
        : ["Your next great hire", "might never apply."],
    "2":
      locale === "ko"
        ? ["다음 팀원을 찾는 동안,", "팀은 다음을 만드세요."]
        : ["You build what’s next.", "Harper finds who’s next."],
    "3":
      locale === "ko"
        ? ["좋은 경력, 그다음은", "우리 팀과 맞는 이유."]
        : ["Beyond a great résumé.", "A reason to meet."],
  };
  const descriptions = {
    "1": text(
      locale,
      "Harper는 인재들과 직접 대화하며 다음에 하고 싶은 일을 이해합니다. 우리 팀의 기회를 소개하고, 서로의 관심이 만나는 연결을 만듭니다.",
      "Harper talks with talented people about what they want next. We bring your opportunity into that conversation and connect you when the interest is mutual."
    ),
    "2": text(
      locale,
      "기준을 정리하고, 후보자를 찾고, 기회를 설명하는 일까지. Harper와 함께 채용을 진행하고, 팀은 만나볼 사람을 결정하세요.",
      "From shaping the role to reviewing candidates and introducing your opportunity, Harper helps with the work behind the hire. Your team decides who to meet."
    ),
    "3": text(
      locale,
      "어떤 경험을 했는지, 다음에 무엇을 원하는지, 우리 역할과 왜 맞는지. Harper가 경력과 대화의 맥락을 함께 살펴 적합한 사람을 연결합니다.",
      "What they’ve built. What they want next. Why your role fits. Harper brings career experience and real conversations together to make thoughtful introductions."
    ),
  };
  return {
    title: titles[concept],
    description: [descriptions[concept]],
    // cta: text(locale, "무료로 시작하기", "Start for free"),
    cta: text(locale, "미팅 신청하기", "Request a demo"),
  };
}

export function getConceptClosing(locale: Locale) {
  return locale === "ko"
    ? [
        "Harper는 팀의 채용을 함께 진행하는 AI 파트너입니다.",
        "맡길 일과 중요한 기준을 알려주세요. 적합한 사람을 찾고, 우리 팀의 기회를 설명하며, 서로의 관심을 연결합니다.",
        "팀은 왜 이 사람을 만나야 하는지 이해하고 다음 대화를 시작할 수 있습니다.",
      ]
    : [
        "Harper is your AI partner in building the team.",
        "Tell us what the role needs and what matters to you. Harper finds relevant people, explains the opportunity, and helps turn mutual interest into a conversation.",
        "Your team gets the context to decide who to meet next.",
      ];
}
