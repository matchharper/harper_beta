import Link from "next/link";
import {
  ArrowUpRight,
  Handshake,
  MessageSquareText,
  ScanSearch,
} from "lucide-react";
import Face from "@/components/common/Face";
import type { Locale } from "@/i18n/useMessage";
import QuestionAnswer from "./Questions";
import styles from "./CompanyLandingSections.module.css";

const copy = {
  ko: {
    statement: ["뛰어난 인재는,", "공고에 지원하지 않습니다."],
    statementBody: [
      "그들은 단지 자신의 상황을 Harper에게 알려주고,",
      "일에 집중합니다.",
    ],
    process: "이렇게 채용하세요.",
    steps: [
      {
        title: "찾는 사람을 알려주세요",
        body: "맡길 일과 필요한 경험을 알려주세요.\n채용 공고 없이도 시작할 수 있습니다.",
      },
      {
        title: "추천받은 후보자를 살펴보세요",
        body: "어떤 일을 해왔는지,\n왜 우리 팀에 맞는지 확인하세요.\n서로 만날 이유가 있을 때만 연결합니다.",
      },
      {
        title: "만나보고 싶은 분을 선택하세요",
        body: "Harper가 대신 연결을 도와드릴게요.\n서로 연락할 수 있도록 소개합니다.",
      },
    ],
    faqTitle: "자주 묻는 질문",
    faqHelp: "다른 질문이 있으신가요?",
    contact: "Harper 팀에 문의하기",
    pricing: "요금제 자세히 보기",
    faq: [
      {
        question: "무료로 어디까지 써볼 수 있나요?",
        answer:
          "카드 등록 없이 포지션을 개수 제한 없이 만들고, 추천받은 후보자를 살펴볼 수 있어요. 후보자에게 채용 기회를 소개해 달라고 요청할 때 사용하는 크레딧은 매월 10개씩 제공되며, 모든 포지션에서 함께 쓸 수 있어요.",
        pricing: true,
      },
      {
        question: "아직 채용 공고가 없어도 되나요?",
        answer:
          "네. 어떤 일을 맡기려는지, 어떤 경험이 필요한지부터 말씀해 주세요. Harper와 대화하면서 채용 조건을 정리한 뒤, 내용을 확인하고 포지션을 등록하면 돼요.",
      },
      {
        question: "이직을 준비하는 사람만 만날 수 있나요?",
        answer:
          "지금 당장 이직할 생각은 없어도, 좋은 제안에는 마음이 열려 있는 사람들이 있어요. Harper는 이들과 나눈 대화를 바탕으로 어떤 회사와 일에 관심이 있는지 살펴보고 추천해요.",
      },
      {
        question: "추천된 후보자는 우리 회사를 알고 있나요?",
        answer:
          "이미 회사와 포지션에 관심을 밝힌 후보자도 있고, 아직 제안을 받지 않은 후보자도 있어요. 처음 제안하는 경우에는 Harper가 회사를 소개하고 만나볼 의향이 있는지 물어봐요. 양쪽이 원하면 서로 연락할 수 있도록 연결해요.",
      },
      {
        question: "채용이 성사되면 수수료를 내나요?",
        answer:
          "Free와 일반 유료 요금제는 채용이 성사돼도 추가 수수료가 없어요. Enterprise나 별도 계약을 맺은 경우에는 계약에서 정한 요금이 적용돼요.",
      },
    ],
  },
  en: {
    statement: ["Remarkable people", "aren’t applying to job posts."],
    statementBody: [
      "They tell Harper where they are and what’s next,",
      "then get back to doing great work.",
    ],
    process: "How to hire with Harper.",
    steps: [
      {
        title: "Tell us who you need",
        body: "Describe the work and experience you need.\nNo finished job description required.",
      },
      {
        title: "Get to know the candidates",
        body: "See what they’ve worked on\nand why they could fit your team.",
      },
      {
        title: "Choose who you’d like to meet",
        body: "If they’re interested too, Harper introduces\nyou so you can start a conversation.",
      },
    ],
    faqTitle: "Frequently asked questions",
    faqHelp: "Still have a question?",
    contact: "Talk to the Harper team",
    pricing: "Explore pricing",
    faq: [
      {
        question: "Can we start for free?",
        answer:
          "Free includes unlimited roles and candidate profile reviews, with no card required. You also receive 10 credits each month to request introductions, shared across all your roles.",
        pricing: true,
      },
      {
        question: "Do we need a finished job description?",
        answer:
          "No. Start with the problem your team needs to solve, what the person will own, and the experience that matters. Shape the role in a conversation with Harper, then review and register it.",
      },
      {
        question: "Who can we meet through Harper?",
        answer:
          "People who talk with Harper about their experience and what they want next. That includes active job seekers and people who are focused on their current work but open to the right opportunity.",
      },
      {
        question: "Are recommended candidates already interested?",
        answer:
          "Some candidates have already expressed interest in your role. Others are people your team can reach out to first. In those cases, Harper presents your opportunity and checks their interest. An introduction follows when both sides want to connect.",
      },
      {
        question: "Is there a fee when we make a hire?",
        answer:
          "Free and standard paid plans have no hiring success fee or salary-based commission. Enterprise and existing separate agreements follow their agreed terms.",
      },
    ],
  },
};

const stepIcons = [MessageSquareText, ScanSearch, Handshake];

export function CompanyTalentStatement({ locale }: { locale: Locale }) {
  const content = copy[locale];
  return (
    <section
      id="company-talent"
      aria-labelledby="company-talent-title"
      data-company-added-section="talent-statement"
      className={styles.statement}
    >
      <div className={styles.container}>
        <Face size={76} aria-hidden="true" className={styles.face} />
        <h2 id="company-talent-title" className={styles.statementTitle}>
          <span>{content.statement[0]}</span>{" "}
          <span>{content.statement[1]}</span>
        </h2>
        <p className={styles.statementBody}>
          <span>{content.statementBody[0]}</span>{" "}
          <span>{content.statementBody[1]}</span>
        </p>
      </div>
    </section>
  );
}

export function CompanyHiringProcess({ locale }: { locale: Locale }) {
  const content = copy[locale];
  return (
    <section
      id="company-process"
      aria-labelledby="company-process-title"
      data-company-added-section="hiring-process"
      className={styles.process}
    >
      <div className={styles.container}>
        <h2 id="company-process-title" className={styles.sectionTitle}>
          {content.process}
        </h2>
        <ol className={styles.steps}>
          {content.steps.map((step, index) => {
            const Icon = stepIcons[index];
            return (
              <li key={step.title} className={styles.step}>
                <Icon size={30} strokeWidth={1.35} aria-hidden="true" />
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function CompanyLandingFaq({ locale }: { locale: Locale }) {
  const content = copy[locale];
  return (
    <section
      id="company-faq"
      aria-labelledby="company-faq-title"
      data-company-added-section="faq"
      className={styles.faq}
    >
      <div className={`${styles.container} ${styles.faqGrid}`}>
        <div>
          <h2 id="company-faq-title" className={styles.sectionTitle}>
            {content.faqTitle}
          </h2>
          {/* <p className={styles.faqHelp}>
            {content.faqHelp}
            <a>
              {content.contact}
            </a>
          </p> */}
        </div>
        <div className={styles.faqList}>
          {content.faq.map((item, index) => (
            <QuestionAnswer
              key={item.question}
              question={item.question}
              answer={
                <>
                  <p>{item.answer}</p>
                  {"pricing" in item && item.pricing ? (
                    <Link
                      href={`/pricing?lang=${locale}`}
                      className={styles.pricingLink}
                    >
                      {content.pricing}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  ) : null}
                </>
              }
              index={index}
              length={content.faq.length}
              variant="compact"
              theme="cream"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
