import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  MessageCircle,
  Plus,
} from "lucide-react";
import Face from "@/components/common/Face";
import { MuteButton } from "@/components/ui/button";
import QuestionAnswer from "@/components/landing/Questions";
import type { Locale } from "@/i18n/useMessage";
import styles from "./CompanyLandingConcepts.module.css";

import {
  COMPANY_CONCEPTS,
  conceptMetadata,
  type CompanyConcept,
} from "./CompanyLandingConceptCopy";
export {
  COMPANY_CONCEPTS,
  conceptMetadata,
  getConceptHero,
  getConceptClosing,
} from "./CompanyLandingConceptCopy";
export type { CompanyConcept } from "./CompanyLandingConceptCopy";

const text = (locale: Locale, ko: string, en: string) =>
  locale === "ko" ? ko : en;

function ConceptSection({
  children,
  concept,
  id,
  tone = "plain",
  label,
}: {
  children: ReactNode;
  concept: CompanyConcept;
  id: string;
  tone?: "plain" | "warm" | "soft";
  label: string;
}) {
  return (
    <section
      id={id}
      aria-label={label}
      data-company-added-section={id}
      data-concept={concept}
      className={`${styles.section} ${styles[tone]}`}
    >
      <div className={styles.inner}>{children}</div>
    </section>
  );
}

function Eyebrow({
  children,
  number,
}: {
  children: ReactNode;
  number?: string;
}) {
  return (
    <div className={styles.eyebrow}>
      {number && <span className={styles.sectionNumber}>{number}</span>}
      {children}
    </div>
  );
}

function Heading({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h2 className={`${styles.heading} ${className}`}>{children}</h2>;
}

function ExampleLabel({ locale }: { locale: Locale }) {
  return (
    <span className={styles.exampleLabel}>
      {text(
        locale,
        "이해를 돕기 위한 가상 예시",
        "Illustrative example · fictional candidate"
      )}
    </span>
  );
}

function StartLink({
  locale,
  children,
}: {
  locale: Locale;
  children?: ReactNode;
}) {
  return (
    <MuteButton asChild variant="dark" size="lg">
      {/* Self-serve action preserved: <Link href={`/org?lang=${locale}`}> */}
      <Link href={`/${locale}/company#company-contact`}>
        {/* {children ?? text(locale, "무료로 시작하기", "Start for free")} */}
        {children ?? text(locale, "미팅 신청하기", "Request a demo")}
        <ArrowRight className="ml-3" />
      </Link>
    </MuteButton>
  );
}

function BeyondApplications({ locale }: { locale: Locale }) {
  return (
    <ConceptSection
      concept="1"
      id="beyond-applications"
      tone="warm"
      label={text(locale, "공고 너머의 인재", "Beyond applications")}
    >
      <Eyebrow number="01">
        {text(locale, "공고 너머에 있는 기회", "BEYOND THE JOB POST")}
      </Eyebrow>
      <div className={styles.editorialIntro}>
        <Heading>
          {text(locale, "좋은 공고와 좋은 사람이", "A great job post.")}
          <br />
          {text(
            locale,
            "늘 만나지는 않으니까.",
            "The right person. Still apart."
          )}
        </Heading>
        <p className={styles.body}>
          {text(
            locale,
            "지금 맡은 일에 몰두하느라 공고를 보지 않는 사람도 있습니다. 하지만 자신이 풀고 싶은 문제와 더 큰 책임에는 마음이 움직일 수 있습니다.",
            "Some people are too immersed in their work to browse job boards. A problem they care about, or the chance to own something bigger, can still make them curious."
          )}
        </p>
      </div>
      <div className={styles.contrastGrid}>
        <div className={styles.applicationPaper}>
          <div className={styles.paperHeader}>
            <span>
              {text(locale, "채용 공고가 아는 것", "WHAT A JOB POST CAN SEE")}
            </span>
            <span>↗</span>
          </div>
          <div className={styles.paperLines} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <h3>{text(locale, "누가 지원했는지.", "Who applied.")}</h3>
          <p>
            {text(
              locale,
              "우리 공고를 발견하고, 지금 지원할 준비가 된 사람.",
              "People who found your opening and are ready to apply today."
            )}
          </p>
        </div>
        <div className={styles.conversationPaper}>
          <div className={styles.paperHeader}>
            <span>
              {text(locale, "Harper가 알아가는 것", "WHAT HARPER GETS TO KNOW")}
            </span>
            <MessageCircle size={19} strokeWidth={1.4} />
          </div>
          <blockquote>
            {text(
              locale,
              "“지금 이직 중은 아니지만, 이런 일을 맡는다면 이야기해 보고 싶어요.”",
              "“I’m not looking right now. But for the chance to build that, I’d like to talk.”"
            )}
          </blockquote>
          <h3>
            {text(
              locale,
              "무엇에 마음이 움직이는지.",
              "What might make them curious."
            )}
          </h3>
          <p>
            {text(
              locale,
              "경력 뒤의 관심과 다음 선택. 대화에서 연결의 실마리를 찾습니다.",
              "The interests behind their experience. The next step they’re considering. A conversation makes room for both."
            )}
          </p>
          <ExampleLabel locale={locale} />
        </div>
      </div>
      <div className={styles.editorialFoot}>
        <span className={styles.orangeDot} />
        <p>
          {text(
            locale,
            "지원서를 기다리는 채용에, 대화에서 시작되는 연결을 더하세요.",
            "Add a conversation-led connection to the way you hire."
          )}
        </p>
        <a href="#next-chapter">
          {text(locale, "어떤 대화일까요", "See the conversation")}
          <ArrowDown size={16} />
        </a>
      </div>
    </ConceptSection>
  );
}

function NextChapter({ locale }: { locale: Locale }) {
  return (
    <ConceptSection
      concept="1"
      id="next-chapter"
      label={text(locale, "후보자의 다음 선택", "Their next chapter")}
    >
      <div className={styles.split}>
        <div className={styles.copyColumn}>
          <Eyebrow number="02">
            {text(
              locale,
              "경력보다 한 걸음 더",
              "THE PERSON BEHIND THE PROFILE"
            )}
          </Eyebrow>
          <Heading>
            {text(locale, "그 사람의 지난 경력과,", "Their career so far.")}
            <br />
            <span className={styles.accent}>
              {text(locale, "다음 챕터를 함께.", "Their next chapter, too.")}
            </span>
          </Heading>
          <p className={styles.body}>
            {text(
              locale,
              "같은 경력이어도 원하는 다음 일은 다릅니다. Harper는 무엇을 해왔는지만큼, 앞으로 어떤 문제를 풀고 어떤 팀에서 일하고 싶은지 듣습니다.",
              "People with similar experience can want very different things next. Harper listens for the problems they want to solve and the team they want to join."
            )}
          </p>
          <div className={styles.smallNote}>
            {text(
              locale,
              "우리 팀의 기회가 그 다음 선택과 만날 때, 자연스러운 소개가 시작됩니다.",
              "A warm introduction starts where your opportunity meets their next step."
            )}
          </div>
        </div>
        <div className={styles.chapterVisual}>
          <div className={styles.orbit} aria-hidden="true">
            <i />
            <i />
            <span>↗</span>
          </div>
          <div className={styles.chapterProfile}>
            <div className={styles.profileTop}>
              <div className={styles.monogram}>J</div>
              <div>
                <strong>Jamie Park</strong>
                <span>Senior Product Engineer</span>
              </div>
            </div>
            <div className={styles.profileDivider} />
            <span className={styles.microLabel}>
              {text(locale, "지금까지", "THE EXPERIENCE")}
            </span>
            <p>
              {text(
                locale,
                "제품 출시부터 운영까지 직접 맡아온 엔지니어.",
                "An engineer who has owned products from launch to everyday operation."
              )}
            </p>
            <div className={styles.skillTags}>
              <span>Product ownership</span>
              <span>0 → 1</span>
            </div>
          </div>
          <div className={styles.chapterConversation}>
            <div className={styles.harperLine}>
              <Face size={32} />
              <span>Harper</span>
              <span className={styles.microLabel}>
                {text(locale, "다음에 하고 싶은 일", "WHAT COMES NEXT")}
              </span>
            </div>
            <blockquote>
              {text(
                locale,
                "“작은 팀에서 사용자를 직접 만나고, 제품의 방향까지 함께 정하고 싶어요.”",
                "“I want to work close to users on a small team, with a say in where the product goes.”"
              )}
            </blockquote>
            <div className={styles.connectionNote}>
              <span className={styles.orangeDot} />
              {text(
                locale,
                "우리 팀이 맡기고 싶은 일과 만나는 지점",
                "Where your role meets their ambition"
              )}
            </div>
          </div>
          <ExampleLabel locale={locale} />
        </div>
      </div>
    </ConceptSection>
  );
}

function WorkBehindHiring({ locale }: { locale: Locale }) {
  const work = [
    [
      text(locale, "채용 기준 정리", "Shape the role"),
      text(
        locale,
        "팀의 상황과 꼭 필요한 경험을 함께 정리합니다.",
        "Clarify your team’s context and the experience that matters."
      ),
    ],
    [
      text(locale, "후보자의 경력 검토", "Review relevant experience"),
      text(
        locale,
        "맡길 일과 실제 경험이 만나는지 살펴봅니다.",
        "Look for experience that connects with the work ahead."
      ),
    ],
    [
      text(locale, "기회 소개와 의향 확인", "Introduce the opportunity"),
      text(
        locale,
        "우리 팀의 일을 설명하고 후보자의 관심을 확인합니다.",
        "Explain what your team is building and learn if they want to talk."
      ),
    ],
  ];
  return (
    <ConceptSection
      concept="2"
      id="hiring-work"
      tone="soft"
      label={text(
        locale,
        "Harper와 함께하는 채용 업무",
        "The work behind the hire"
      )}
    >
      <Eyebrow number="01">
        {text(locale, "채용의 긴 할 일 목록", "THE WORK BEHIND EVERY HIRE")}
      </Eyebrow>
      <div className={styles.editorialIntro}>
        <Heading>
          {text(locale, "채용이 하나 더 생길 때,", "Another open role.")}
          <br />
          {text(
            locale,
            "할 일만 늘어나지 않도록.",
            "A little more room to build."
          )}
        </Heading>
        <p className={styles.body}>
          {text(
            locale,
            "공고를 올리는 것보다 오래 걸리는 일들. Harper는 팀의 기준을 이해하고, 적합한 사람을 찾아 대화하는 일을 함께 맡습니다.",
            "The work doesn’t end with a job post. Harper helps understand your bar, review the right people, and start the conversations behind a hire."
          )}
        </p>
      </div>
      <div className={styles.workDesk}>
        <div className={styles.deskHeader}>
          <div>
            <Face size={30} />
            <span>
              Harper{" "}
              <span className={styles.muted}>
                {text(locale, "채용 파트너", "hiring partner")}
              </span>
            </span>
          </div>
          <span className={styles.microLabel}>
            {text(locale, "팀과 함께 진행하는 일", "WORK WE TAKE ON TOGETHER")}
          </span>
        </div>
        <div className={styles.workRows}>
          {work.map(([title, description], index) => (
            <div key={title} className={styles.workRow}>
              <span className={styles.workNumber}>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
              <ArrowRight size={18} strokeWidth={1.3} />
            </div>
          ))}
        </div>
        <div className={styles.yourDecision}>
          <span className={styles.outlineCircle}>
            <Check size={19} />
          </span>
          <div>
            <span className={styles.microLabel}>
              {text(locale, "팀이 결정하는 일", "YOUR TEAM’S DECISION")}
            </span>
            <h3>
              {text(
                locale,
                "“이 분과 이야기해 보고 싶어요.”",
                "“This is someone we’d like to meet.”"
              )}
            </h3>
          </div>
          <span className={styles.decisionAnnotation}>
            {text(
              locale,
              "사람을 선택하는 결정은 팀에게.",
              "The decision stays with you."
            )}
          </span>
        </div>
      </div>
    </ConceptSection>
  );
}

function InYourWorkflow({ locale }: { locale: Locale }) {
  const [view, setView] = useState<"workspace" | "slack">("workspace");
  return (
    <ConceptSection
      concept="2"
      id="team-workflow"
      label={text(
        locale,
        "Workspace와 Slack에서 함께 채용",
        "In your team’s workflow"
      )}
    >
      <div className={styles.split}>
        <div className={styles.copyColumn}>
          <Eyebrow number="02">
            {text(locale, "팀의 대화가 채용으로", "IN YOUR TEAM’S WORKFLOW")}
          </Eyebrow>
          <Heading>
            {text(locale, "채용을 위해,", "One hiring conversation.")}
            <br />
            {text(
              locale,
              "대화를 따로 만들지 마세요.",
              "Right where your team works."
            )}
          </Heading>
          <p className={styles.body}>
            {text(
              locale,
              "Workspace에서 후보자와 진행 상황을 확인하고, 연결한 Slack 채널에서 소개와 피드백을 이어가세요. 팀원이 같은 맥락에서 다음 채용을 이야기할 수 있습니다.",
              "Review candidates and progress in your Workspace. Continue introductions and feedback in your connected Slack channel, so your team can work from the same context."
            )}
          </p>
          <div
            className={styles.viewControls}
            role="group"
            aria-label={text(
              locale,
              "예시 화면 선택",
              "Choose a workflow example"
            )}
          >
            <MuteButton
              variant={view === "workspace" ? "neutral" : "transparent"}
              aria-pressed={view === "workspace"}
              onClick={() => setView("workspace")}
            >
              Workspace
            </MuteButton>
            <MuteButton
              variant={view === "slack" ? "neutral" : "transparent"}
              aria-pressed={view === "slack"}
              onClick={() => setView("slack")}
            >
              Slack
            </MuteButton>
          </div>
          <div className={styles.smallNote}>
            {text(
              locale,
              "Slack 연결은 선택입니다. 웹 Workspace만으로도 시작할 수 있습니다.",
              "Slack is optional. You can start with the web Workspace."
            )}
          </div>
        </div>
        <div className={styles.workflowVisual}>
          {view === "workspace" ? (
            <div className={styles.workspaceMock}>
              <div className={styles.windowBar}>
                <span className={styles.windowDots} aria-hidden="true">
                  ● ● ●
                </span>
                <span>Harper Workspace</span>
              </div>
              <div className={styles.workspaceBody}>
                <aside>
                  <span className={styles.workspaceBrand}>Harper</span>
                  <span>Roles</span>
                  <span className={styles.mockSelected}>Inbox</span>
                  <span>Pipeline</span>
                </aside>
                <div className={styles.mockInbox}>
                  <div className={styles.mockBreadcrumb}>
                    Inbox <ChevronRight size={12} /> Product Engineer
                  </div>
                  <h3>
                    {text(
                      locale,
                      "다음 대화를 시작할 사람",
                      "Someone to meet next"
                    )}
                  </h3>
                  <div className={styles.mockCandidate}>
                    <div className={styles.profileTop}>
                      <div className={styles.monogram}>J</div>
                      <div>
                        <strong>Jamie Park</strong>
                        <span>Senior Product Engineer</span>
                      </div>
                    </div>
                    <span className={styles.confirmedState}>
                      <Check size={13} />
                      {text(
                        locale,
                        "역할 수락 · 회사 결정 대기",
                        "Role accepted · awaiting your decision"
                      )}
                    </span>
                    <p>
                      {text(
                        locale,
                        "제품의 방향을 함께 만드는 역할에 관심을 밝혔습니다. 사용자를 직접 만나며 제품을 운영한 경험이 있습니다.",
                        "Interested in a role with product direction and ownership. Experienced in working directly with users and running what they build."
                      )}
                    </p>
                    <span className={styles.mockAction}>
                      {text(locale, "후보자 검토", "Review candidate")}
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.slackMock}>
              <div className={styles.slackChannel}>
                <span>#</span> hiring-product-engineer{" "}
                <span className={styles.microLabel}>Slack</span>
              </div>
              <div className={styles.slackMessage}>
                <Face size={38} />
                <div>
                  <strong>
                    Harper <span className={styles.slackApp}>APP</span>
                  </strong>
                  <p>
                    {text(
                      locale,
                      "우리 역할에 관심을 밝힌 Jamie님을 소개드려요.",
                      "Jamie is interested in your role and ready for your team’s review."
                    )}
                  </p>
                  <div className={styles.slackAttachment}>
                    <strong>Jamie Park</strong>
                    <span>Senior Product Engineer</span>
                    <p>
                      {text(
                        locale,
                        "사용자를 직접 만나며 제품을 운영한 경험. 다음에는 작은 팀에서 제품 방향까지 맡고 싶어 합니다.",
                        "Built and operated products close to users. Wants to help shape product direction on a smaller team."
                      )}
                    </p>
                    <span className={styles.confirmedState}>
                      <Check size={13} />
                      {text(
                        locale,
                        "역할 수락 · 회사 결정 대기",
                        "Role accepted · awaiting your decision"
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <div className={styles.slackReply}>
                <span className={styles.tinyMonogram}>M</span>
                <div>
                  <strong>{text(locale, "팀원", "Teammate")}</strong>
                  <p>
                    {text(
                      locale,
                      "사용자 가까이에서 일한 경험이 좋네요. 맡았던 범위를 더 알려주세요.",
                      "The work with users stands out. Tell us more about what Jamie owned."
                    )}
                  </p>
                </div>
              </div>
              <div className={styles.slackComposer}>
                {text(
                  locale,
                  "Harper와 대화 이어가기",
                  "Continue the conversation with Harper"
                )}
                <Plus size={16} />
              </div>
            </div>
          )}
          <ExampleLabel locale={locale} />
        </div>
      </div>
    </ConceptSection>
  );
}

const lensCopy = {
  ko: [
    {
      label: "실제 경험",
      title: "직함보다, 직접 맡았던 일.",
      question: "제품에서 어디까지 직접 맡아보셨나요?",
      answer:
        "초기 설계부터 출시 후 운영까지 맡았어요. 사용자 피드백을 직접 듣고 다음 기능도 정했습니다.",
      reason:
        "출시 뒤에도 제품을 책임진 경험은, 처음부터 끝까지 맡아줄 팀원을 찾는 역할과 만납니다.",
      note: "면접에서 확인할 점",
      detail: "함께한 팀의 규모와 개인의 실제 기여 범위",
    },
    {
      label: "다음 업무",
      title: "이직 여부보다, 움직일 이유.",
      question: "다음 역할에서는 어떤 일을 하고 싶으세요?",
      answer:
        "작은 팀에서 사용자와 더 가까이 일하고 싶어요. 제품 방향에 함께 목소리를 낼 수 있으면 좋겠고요.",
      reason:
        "작은 팀의 제품 방향에 참여하고 싶다는 관심은, 큰 책임과 사용자 접점을 제안하는 역할과 만납니다.",
      note: "연결에 필요한 점",
      detail: "실제 회사와 역할을 설명한 뒤의 대화 의사",
    },
    {
      label: "근무 조건",
      title: "좋은 경험에도, 맞아야 할 조건.",
      question: "어떤 근무 환경에서 잘 일하세요?",
      answer:
        "팀과 직접 만나 일하는 걸 좋아해요. 주 몇 회 함께 일하는 하이브리드 환경을 찾고 있습니다.",
      reason:
        "근무 방식까지 서로 맞는지 알아야, 경력이 적합해 보여도 놓칠 수 있는 차이를 함께 볼 수 있습니다.",
      note: "아직 확인할 점",
      detail: "구체적인 출근 요일과 합류 가능 시점",
    },
  ],
  en: [
    {
      label: "Experience",
      title: "Beyond a title. What they owned.",
      question: "What did you own on the product?",
      answer:
        "From early design through launch and day-to-day operation. I worked with users and helped decide what to build next.",
      reason:
        "Owning a product after launch connects with a role that needs someone to take responsibility from end to end.",
      note: "Explore in the interview",
      detail: "The team’s size and the scope of their own contribution",
    },
    {
      label: "What’s next",
      title: "A reason to move. A reason to stay.",
      question: "What would you like from your next role?",
      answer:
        "A smaller team where I can work close to users and have a voice in the product’s direction.",
      reason:
        "Wanting a say in product direction connects with a role that offers ownership and direct contact with users.",
      note: "Before an introduction",
      detail:
        "Interest in the actual company and role still needs confirmation",
    },
    {
      label: "Conditions",
      title: "The conditions matter, too.",
      question: "What kind of work environment suits you?",
      answer:
        "I enjoy working with people in person. I’m looking for a hybrid team that meets a few times a week.",
      reason:
        "Understanding working preferences helps reveal differences that a strong-looking career history might hide.",
      note: "Still to clarify",
      detail: "Specific office days and when they could join",
    },
  ],
};

function ContextLens({ locale }: { locale: Locale }) {
  const [active, setActive] = useState(0);
  const items = lensCopy[locale];
  const current = items[active];
  return (
    <ConceptSection
      concept="3"
      id="context-lens"
      tone="soft"
      label={text(locale, "후보자의 경험과 맥락", "The context behind a match")}
    >
      <Eyebrow number="01">
        {text(locale, "이력서 다음의 맥락", "THE CONTEXT BEHIND A MATCH")}
      </Eyebrow>
      <div className={styles.editorialIntro}>
        <Heading>
          {text(locale, "좋은 경력이 보이면,", "A strong résumé opens a door.")}
          <br />
          {text(locale, "좋은 질문이 시작됩니다.", "Context tells you why.")}
        </Heading>
        <p className={styles.body}>
          {text(
            locale,
            "직함과 회사 이름만으로는 알기 어려운 것들. Harper는 실제 경험과 다음 선택을 함께 읽어, 우리 역할과 만나는 이유를 보여줍니다.",
            "A title and a company name can only say so much. Harper brings experience and ambition together, so you can understand where a person meets your role."
          )}
        </p>
      </div>
      <div
        className={styles.lensControls}
        role="group"
        aria-label={text(
          locale,
          "후보자 맥락 보기 선택",
          "Choose a candidate context"
        )}
      >
        {items.map((item, index) => (
          <MuteButton
            key={item.label}
            variant={active === index ? "neutral" : "transparent"}
            size="md"
            aria-pressed={active === index}
            onClick={() => setActive(index)}
          >
            <span className={styles.lensIndex}>0{index + 1}</span>
            {item.label}
          </MuteButton>
        ))}
      </div>
      <div className={styles.lensGrid}>
        <div className={styles.lensConversation}>
          <div className={styles.profileTop}>
            <div className={styles.monogram}>J</div>
            <div>
              <strong>Jamie Park</strong>
              <span>Senior Product Engineer</span>
            </div>
          </div>
          <div className={styles.profileDivider} />
          <div className={styles.lensQuestion}>
            <Face size={28} />
            <p>{current.question}</p>
          </div>
          <blockquote>{current.answer}</blockquote>
          <ExampleLabel locale={locale} />
        </div>
        <div
          className={styles.lensReason}
          aria-live="polite"
          aria-atomic="true"
        >
          <span className={styles.microLabel}>
            {text(
              locale,
              "우리 역할과 만나는 지점",
              "WHERE YOUR ROLE MEETS THEIR STORY"
            )}
          </span>
          <h3>{current.title}</h3>
          <p>{current.reason}</p>
          <div className={styles.unconfirmed}>
            <span>{current.note}</span>
            <p>{current.detail}</p>
          </div>
        </div>
      </div>
    </ConceptSection>
  );
}

function MutualDecision({ locale }: { locale: Locale }) {
  return (
    <ConceptSection
      concept="3"
      id="mutual-decision"
      label={text(
        locale,
        "양쪽의 결정으로 이루어지는 연결",
        "A decision on both sides"
      )}
    >
      <div className={styles.split}>
        <div className={styles.copyColumn}>
          <Eyebrow number="02">
            {text(locale, "좋은 연결의 조건", "A DECISION ON BOTH SIDES")}
          </Eyebrow>
          <Heading>
            {text(
              locale,
              "서로 만나고 싶을 때,",
              "When both sides want to meet,"
            )}
            <br />
            <span className={styles.accent}>
              {text(
                locale,
                "소개가 의미 있어집니다.",
                "an introduction means more."
              )}
            </span>
          </Heading>
          <p className={styles.body}>
            {text(
              locale,
              "후보자가 우리 역할에 관심을 밝힌 소개를 검토하거나, 먼저 제안해 보고 싶은 사람을 고를 수 있습니다. Harper는 서로의 의사를 확인하며 연결을 이어갑니다.",
              "Review introductions from people who’ve expressed interest, or choose a suggested candidate you’d like Harper to approach. We help establish interest on both sides before connecting you."
            )}
          </p>
          <div className={styles.smallNote}>
            {text(
              locale,
              "회사의 판단과 후보자의 선택. 두 가지 모두 중요하게 다룹니다.",
              "Your team’s decision and the candidate’s choice both matter."
            )}
          </div>
        </div>
        <div className={styles.mutualVisual}>
          <div className={styles.mutualTop}>
            <div>
              <span className={styles.microLabel}>
                {text(locale, "우리 팀", "YOUR TEAM")}
              </span>
              <h3>
                {text(
                  locale,
                  "이 경험이 필요해요.",
                  "We need this experience."
                )}
              </h3>
              <p>
                {text(
                  locale,
                  "맡길 일과 기준을 정하고, 만나볼 사람을 판단합니다.",
                  "Define the work and your bar. Decide who is worth meeting."
                )}
              </p>
            </div>
            <div>
              <span className={styles.microLabel}>
                {text(locale, "후보자", "THE CANDIDATE")}
              </span>
              <h3>
                {text(locale, "이 일이 궁금해요.", "This work interests me.")}
              </h3>
              <p>
                {text(
                  locale,
                  "회사와 역할을 이해하고, 대화를 이어갈지 선택합니다.",
                  "Understand the opportunity. Choose whether to explore it."
                )}
              </p>
            </div>
          </div>
          <div className={styles.mutualLines} aria-hidden="true">
            <span />
            <span />
          </div>
          <div className={styles.mutualCenter}>
            <Face size={54} />
            <div>
              <strong>
                {text(
                  locale,
                  "서로의 의사가 만나는 소개",
                  "An introduction with mutual interest"
                )}
              </strong>
              <span>
                {text(
                  locale,
                  "다음 대화를 시작할 수 있도록.",
                  "The start of your next conversation."
                )}
              </span>
            </div>
          </div>
          <div className={styles.decisionFinePrint}>
            {text(
              locale,
              "‘먼저 제안 가능한 후보’는 아직 역할을 수락하지 않은 사람입니다. 제안 이후 후보자의 의사를 확인합니다.",
              "Suggested candidates haven’t accepted your role yet. Their interest is confirmed after you request an introduction."
            )}
          </div>
        </div>
      </div>
    </ConceptSection>
  );
}

export function CompanyConceptBeforeAgents({
  concept,
  locale,
}: {
  concept: CompanyConcept;
  locale: Locale;
}) {
  if (concept === "1") return <BeyondApplications locale={locale} />;
  if (concept === "2") return <WorkBehindHiring locale={locale} />;
  return <ContextLens locale={locale} />;
}

export function CompanyConceptAfterAgents({
  concept,
  locale,
}: {
  concept: CompanyConcept;
  locale: Locale;
}) {
  if (concept === "1") return <NextChapter locale={locale} />;
  if (concept === "2") return <InYourWorkflow locale={locale} />;
  return <MutualDecision locale={locale} />;
}

export function CompanyConceptGettingStarted({
  concept,
  locale,
}: {
  concept: CompanyConcept;
  locale: Locale;
}) {
  const steps =
    locale === "ko"
      ? [
          ["회사 이메일로 시작", "가입하고 우리 회사의 Workspace를 만드세요."],
          [
            "맡길 일을 대화로 설명",
            "팀의 상황과 필요한 경험을 알려주세요. Harper와 역할을 정리하고 등록합니다.",
          ],
          [
            "후보자를 검토하고 연결",
            "소개 이유를 살펴보고, 만나보고 싶은 사람과 다음 대화를 시작하세요.",
          ],
        ]
      : [
          [
            "Start with your work email",
            "Sign up and create your company’s Workspace.",
          ],
          [
            "Talk through the role",
            "Share your team’s needs. Shape the role with Harper, then confirm and register it.",
          ],
          [
            "Review and connect",
            "See the context behind an introduction and decide who you’d like to meet.",
          ],
        ];
  return (
    <ConceptSection
      concept={concept}
      id="start-a-conversation"
      tone="warm"
      label={text(locale, "Harper 시작 방법", "Getting started with Harper")}
    >
      <div className={styles.startIntro}>
        <div>
          <Eyebrow number="03">
            {text(locale, "첫 역할부터 함께", "START WITH YOUR NEXT ROLE")}
          </Eyebrow>
          <Heading>
            {text(locale, "완성된 JD보다,", "A conversation is enough")}
            <br />
            {text(locale, "지금 필요한 이야기부터.", "to get started.")}
          </Heading>
        </div>
        <p className={styles.body}>
          {text(
            locale,
            "아직 모든 조건을 정하지 않아도 괜찮습니다. 지금 팀이 풀어야 할 문제와 어떤 사람이 필요한지부터 이야기해 주세요.",
            "You don’t need a polished job description. Start with the problem your team needs to solve and the person you need to help solve it."
          )}
        </p>
      </div>
      <div
        className={`${styles.steps} ${concept === "2" ? styles.stepsWork : ""}`}
      >
        {steps.map(([title, description], index) => (
          <div key={title} className={styles.step}>
            <div className={styles.stepTop}>
              <span>0{index + 1}</span>
              {index < 2 ? (
                <ArrowRight size={22} strokeWidth={1.2} />
              ) : (
                <Check size={22} strokeWidth={1.2} />
              )}
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        ))}
      </div>
      <div className={styles.startPrompt}>
        <div className={styles.promptQuote}>
          <MessageCircle size={22} strokeWidth={1.3} />
          <p>
            {text(
              locale,
              "“사용자와 직접 이야기하며 제품을 만들어갈 엔지니어가 필요해요.”",
              "“We need an engineer who can build the product and work directly with our users.”"
            )}
          </p>
        </div>
        <StartLink locale={locale} />
      </div>
      <p className={styles.startFootnote}>
        {text(
          locale,
          "회사 이메일로 가입 · Free로 시작 · 유료 기능과 크레딧은 요금제에서 확인",
          "Sign up with your work email · Start on Free · See plans for paid features and credits"
        )}
      </p>
    </ConceptSection>
  );
}

export function CompanyConceptFaq({
  concept,
  locale,
}: {
  concept: CompanyConcept;
  locale: Locale;
}) {
  const faq =
    locale === "ko"
      ? [
          [
            "완성된 채용 공고나 JD가 있어야 하나요?",
            "없어도 시작할 수 있습니다. 왜 채용하는지, 맡길 일과 필요한 경험을 아는 만큼 알려주세요. Harper와 대화로 역할을 정리하고 최종 내용을 확인해 등록하면 됩니다.",
          ],
          [
            concept === "3"
              ? "추천된 후보자는 이미 우리 회사에 관심이 있나요?"
              : "적극적으로 이직 중인 사람만 만날 수 있나요?",
            concept === "3"
              ? "연결 대기에 소개된 후보자는 회사와 역할을 듣고 대화 의사를 밝힌 사람입니다. 별도의 ‘먼저 제안 가능한 후보’는 아직 이 역할을 수락하지 않은 사람으로, 회사가 제안을 요청한 뒤 관심을 확인합니다."
              : "지금 공고를 찾아보지 않더라도 적합한 역할에 열려 있는 사람이 있습니다. Harper는 후보자의 다음 선택과 우리 역할의 맥락을 살펴봅니다. 실제 소개는 양쪽의 연결 의사를 확인하며 진행합니다.",
          ],
          [
            "Slack을 꼭 연결해야 하나요?",
            "웹 Workspace만으로도 시작할 수 있습니다. Slack을 연결하면 선택한 채널에서 후보 소개를 받고 Harper와 대화를 이어갈 수 있습니다.",
          ],
          [
            "비용은 어떻게 되나요?",
            <span key="pricing">
              Free에서도 Role은 무제한이며 월 10크레딧을 함께 사용합니다. 유료
              기능이 필요한 Role에 슬롯을 추가할 수 있습니다. Free와 표준 슬롯
              구독에는 채용 성공보수가 없습니다. Enterprise와 기존 별도 계약은
              합의한 조건을 따릅니다.{" "}
              <Link href="/pricing?lang=ko" className={styles.inlineLink}>
                현재 요금제 보기 <ArrowRight size={13} />
              </Link>
            </span>,
          ],
        ]
      : [
          [
            "Do we need a finished job description?",
            "No. Tell Harper why you’re hiring, what the person will own, and the experience that matters. Shape the role through a conversation, then review and register it.",
          ],
          [
            concept === "3"
              ? "Have suggested candidates already opted in?"
              : "Does Harper only introduce active job seekers?",
            concept === "3"
              ? "Candidates ready to connect have heard about your company and role and expressed interest. Suggested candidates haven’t accepted the role yet; Harper confirms their interest after your team requests an introduction."
              : "Some people aren’t actively searching but are open to the right opportunity. Harper considers their next step alongside your role, and helps confirm interest on both sides before an introduction.",
          ],
          [
            "Is Slack required?",
            "You can start with the web Workspace. Connect Slack to receive introductions and continue conversations with Harper in your chosen channel.",
          ],
          [
            "How does pricing work?",
            <span key="pricing">
              Free includes unlimited roles with 10 monthly credits shared
              across them. Add slots to roles that need paid features. Free and
              standard slot subscriptions have no hiring success fee. Enterprise
              and existing agreements follow their agreed terms.{" "}
              <Link href="/pricing?lang=en" className={styles.inlineLink}>
                See current plans <ArrowRight size={13} />
              </Link>
            </span>,
          ],
        ];
  return (
    <ConceptSection
      concept={concept}
      id="company-preview-faq"
      label={text(locale, "시작 전 궁금한 점", "Questions before you start")}
    >
      <div className={styles.faqGrid}>
        <div>
          <Eyebrow number="04">
            {text(locale, "시작 전 궁금한 점", "A FEW THINGS TO KNOW")}
          </Eyebrow>
          <Heading>
            {text(locale, "궁금한 점이", "Before you")}
            <br />
            {text(locale, "남아 있다면.", "get started.")}
          </Heading>
          <p className={styles.faqHelp}>
            {text(
              locale,
              "도입 상담이 필요하신가요?",
              "Want to talk it through?"
            )}
            <br />
            <a href="mailto:chris@matchharper.com">
              {text(locale, "Harper 팀에 문의하기", "Contact the Harper team")}{" "}
              ↗
            </a>
          </p>
        </div>
        <div className={styles.faqList}>
          {faq.map(([question, answer], index) => (
            <QuestionAnswer
              key={String(question)}
              question={String(question)}
              answer={answer}
              index={index}
              length={faq.length}
              theme="cream"
              variant="compact"
            />
          ))}
        </div>
      </div>
    </ConceptSection>
  );
}

export function CompanyLandingPreviewBar({
  concept,
  locale,
}: {
  concept: CompanyConcept;
  locale: Locale;
}) {
  return (
    <nav
      className={styles.previewBar}
      aria-label={text(
        locale,
        "랜딩페이지 시안 비교",
        "Compare landing concepts"
      )}
    >
      <Link
        href={`/company/preview?lang=${locale}`}
        className={styles.previewHome}
      >
        {text(locale, "시안 비교", "Concepts")}
        <span className={styles.previewBadge}>PREVIEW</span>
      </Link>
      <div className={styles.previewVersions}>
        {COMPANY_CONCEPTS.map((id) => (
          <MuteButton
            key={id}
            asChild
            size="sm"
            variant={id === concept ? "neutral" : "transparent"}
          >
            <Link
              href={`/company/preview/${id}?lang=${locale}`}
              aria-current={id === concept ? "page" : undefined}
            >
              <span>0{id}</span>
              <span className={styles.versionName}>
                {conceptMetadata[id][locale].name}
              </span>
            </Link>
          </MuteButton>
        ))}
      </div>
      <div className={styles.previewUtilities}>
        <MuteButton asChild variant="transparent" size="sm">
          <Link href={`/${locale}/company`}>
            {text(locale, "원본", "Original")}
          </Link>
        </MuteButton>
        <MuteButton asChild variant="transparent" size="sm">
          <Link
            href={`/company/preview/${concept}?lang=${locale === "ko" ? "en" : "ko"}`}
          >
            {locale === "ko" ? "EN" : "한국어"}
          </Link>
        </MuteButton>
      </div>
    </nav>
  );
}

export { styles as companyConceptStyles };
