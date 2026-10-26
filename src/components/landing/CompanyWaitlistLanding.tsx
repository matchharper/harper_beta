import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Plus,
  Pause,
  Play,
  Users,
  BriefcaseBusiness,
  Sprout,
  ListChecks,
  CircleHelp,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LandingStats } from "@/components/landing/LandingStats";
import Face from "@/components/common/Face";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import DemoVideo from "@/components/landing/DemoVideo";
import { PricingCostComparison } from "@/components/landing/PricingCostComparison";
import type { Locale } from "@/i18n/useMessage";
import { cn } from "@/lib/utils";

const examples = {
  ko: [
    {
      label: "시니어 백엔드 개발자",
      request:
        "결제 시스템을 처음부터 만들어본 시니어 백엔드 개발자요. 판교로 출근 가능하면 좋겠어요.",
      reply: "좋아요. 결제 경험이 있는 분들부터 먼저 이야기해볼게요.",
    },
    {
      label: "AI 인프라 엔지니어",
      request:
        "LLM 서빙 경험이 있는 AI 인프라 엔지니어를 찾고 있어요. 작은 팀이라 오너십이 중요해요.",
      reply: "알겠어요. 서빙 경험과 작은 팀에서의 역할을 함께 살펴볼게요.",
    },
    {
      label: "엔터프라이즈 세일즈",
      request:
        "한국 대기업 고객을 직접 클로징해본 엔터프라이즈 세일즈 한 분이 필요해요.",
      reply: "네, 엔터프라이즈 딜을 해본 분들과 먼저 이야기해볼게요.",
    },
    {
      label: "Founding PM",
      request:
        "0에서 1을 해본 Founding PM이요. 개발자와 바로 대화되는 분이면 좋겠어요.",
      reply: "좋아요. 초기 팀에서 제품을 만들어본 분들을 찾아볼게요.",
    },
  ],
  en: [
    {
      label: "Senior backend engineer",
      request:
        "We’re looking for a senior backend engineer who has built payment systems from scratch. Ideally, they can work from Pangyo.",
      reply: "Got it. I’ll start with people who have built payment systems.",
    },
    {
      label: "AI infrastructure engineer",
      request:
        "We’re looking for an AI infrastructure engineer with LLM serving experience who can take ownership on a small team.",
      reply:
        "I’ll look for LLM serving experience and a track record of taking ownership.",
    },
    {
      label: "Enterprise sales",
      request:
        "We’re looking for someone in enterprise sales who has closed deals with large Korean companies.",
      reply:
        "I’ll start by speaking with people who have closed enterprise deals.",
    },
    {
      label: "Founding PM",
      request:
        "We need a founding PM who has taken a product from zero to one and works closely with engineers.",
      reply: "I’ll look for people who have launched products at early-stage startups.",
    },
  ],
};

function SectionHeading({
  eyebrow,
  children,
  description,
  className,
}: {
  eyebrow: string;
  children: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mx-auto text-left md:text-center", className)}>
      <p className="mb-2.5 text-[13px] leading-normal font-medium text-primary md:mb-3">
        {eyebrow}
      </p>
      <h2 className="text-[27px] leading-[1.42] font-medium break-keep md:text-[38px] md:leading-[1.5]">
        {children}
      </h2>
      {description && (
        <p className="mx-auto mt-3.5 max-w-[620px] text-[15px] leading-[1.6] break-keep text-neutral-muted md:mt-[18px] md:text-base">
          {description}
        </p>
      )}
    </header>
  );
}

function HiringPrompt({
  locale,
  purpose,
  onChange,
  onStart,
}: {
  locale: Locale;
  purpose: string;
  onChange: (value: string) => void;
  onStart: () => void;
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const [paused, setPaused] = useState(false);
  const [example, setExample] = useState(0);
  const [characters, setCharacters] = useState(0);
  const reducedMotion = useReducedMotion();
  const current = examples[locale][example];
  useEffect(() => {
    if (reducedMotion || paused || purpose) return;
    const timer = window.setTimeout(
      () => {
        if (characters < current.request.length) setCharacters(characters + 1);
        else {
          setCharacters(0);
          setExample((example + 1) % examples[locale].length);
        }
      },
      characters < current.request.length ? 45 : 3600
    );
    return () => window.clearTimeout(timer);
  }, [
    characters,
    current.request.length,
    example,
    locale,
    paused,
    purpose,
    reducedMotion,
  ]);
  return (
    <div className="mx-auto mt-12 max-w-[720px] md:mt-12">
      <div className="rounded-[18px] border border-neutral-800 bg-bg-floating p-4 text-left shadow-[0_8px_30px] shadow-neutral-1000/5 md:rounded-[22px] md:p-5 md:pb-4">
        <label htmlFor="company-hiring-prompt" className="sr-only">
          {c("어떤 동료를 찾고 있나요?", "Who are you hiring for?")}
        </label>
        <Textarea
          id="company-hiring-prompt"
          unstyled
          rows={2}
          className="block min-h-16 w-full resize-none border-0 text-[15px] leading-[1.65] shadow-none outline-none placeholder:text-neutral-primary placeholder:opacity-100 focus:ring-0 focus-visible:ring-0 focus-visible:outline-none md:min-h-[52px] md:text-base"
          value={purpose}
          onFocus={() => setPaused(true)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={
            reducedMotion || paused
              ? current.request
              : current.request.slice(0, characters) || " "
          }
        />
        <div className="mt-2 flex items-center justify-start gap-3 md:mt-12 md:justify-between">
          <div
            key={`${locale}-${example}`}
            className="mt-2.5 flex min-h-8 items-center gap-2 text-xs leading-[1.6] text-neutral-muted opacity-0 transition-opacity duration-250 data-[visible=true]:opacity-100 motion-reduce:transition-none md:min-h-6 md:items-center md:text-[13px]"
            data-visible={
              !purpose &&
              (reducedMotion || characters >= current.request.length)
            }
            aria-hidden="true"
          >
            <span className="shrink-0">
              <Face size={24} />
            </span>
            <span>{current.reply}</span>
          </div>
          <div className="hidden md:block">
            <MuteButton
              variant="dark"
              size="lg"
              className="rounded-full px-6"
              onClick={onStart}
            >
              {c("무료로 시작하기", "Start for free")}
            </MuteButton>
          </div>
        </div>
      </div>
      <div className="mt-3 md:hidden">
        {" "}
        <MuteButton
          variant="dark"
          size="lg"
          onClick={onStart}
          className="w-full"
        >
          {c("무료로 시작하기", "Start for free")}
        </MuteButton>
      </div>
      <div className="mt-3 flex flex-wrap justify-start gap-1.5 md:mt-4 md:justify-center md:gap-2">
        {examples[locale].map((item, index) => (
          <MuteButton
            key={item.label}
            size="md"
            variant={index === example ? "neutral" : "default"}
            aria-pressed={index === example}
            onClick={() => {
              setExample(index);
              setCharacters(0);
              setPaused(false);
            }}
          >
            {item.label}
          </MuteButton>
        ))}
      </div>
    </div>
  );
}

export function CompanyWaitlistLanding({
  locale,
  candidateCard,
  renderContact,
}: {
  locale: Locale;
  candidateCard: ReactNode;
  renderContact: (
    purpose: string,
    onPurposeChange: (value: string) => void
  ) => ReactNode;
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const [purpose, setPurpose] = useState("");
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const signupHref = `/org?lang=${locale}`;
  const start = () => void router.push(signupHref);
  const contactSales = () => {
    document.getElementById("company-contact")?.scrollIntoView({
      behavior: reducedMotion ? "instant" : "smooth",
      block: "center",
    });
    document
      .getElementById("company-contact-email")
      ?.focus({ preventScroll: true });
  };
  const cta = c("무료로 시작하기", "Start for free");
  const faqs = [
    [
      c(
        "Harper는 어떤 직무를 채용하기 좋나요?",
        "What roles can I hire for with Harper?"
      ),
      c(
        "엔지니어링, AI, 프로덕트, 디자인, 마케팅, 세일즈, 운영, 리더십까지 다양한 직무의 채용에 잘 맞아요. Seed 단계에서 첫 팀을 꾸리는 회사부터 Series D 단계에서 조직을 확장하는 회사까지 함께할 수 있어요. 현재 Harper의 인재 풀에는 엔지니어가 가장 많아요.",
        "Harper supports hiring across engineering, AI, product, design, marketing, sales, operations, and leadership. We work with seed-stage through Series D companies, from first hires to growing teams. Engineers currently make up the largest group in our candidate network."
      ),
    ],
    [
      c(
        "Harper에게 채용의 어디까지 맡길 수 있나요?",
        "How much of the hiring process can Harper handle?"
      ),
      c(
        "채용 조건을 정리하고, 후보를 찾고, 관심을 확인해 연결하는 일까지 맡길 수 있어요. 후보를 보고 아쉬운 점을 알려주시면 다음 추천에도 반영해요. 회사에서는 만나고 싶은 분을 고르고, 면접과 최종 채용 결정을 진행하시면 돼요.",
        "Harper helps you define the role, find candidates, reach out, and arrange introductions. Your feedback helps refine future recommendations. You choose who to meet, run the interviews, and make the hiring decision."
      ),
    ],
    [
      c(
        "이미 채용팀이나 다른 채용 서비스를 쓰고 있어도 도움이 되나요?",
        "Can we use Harper alongside our recruiting team or other services?"
      ),
      c(
        "네. 지금 쓰는 채용 공고나 서비스를 그대로 이용하면서 Harper에게도 후보를 찾아달라고 할 수 있어요. 채용팀이 직접 검색하고 먼저 연락하는 일을 덜어드려요. 그만큼 후보를 만나고 서로 잘 맞는지 알아보는 데 시간을 쓸 수 있어요.",
        "Yes. Keep using your existing job boards and recruiting services. Harper handles sourcing and initial outreach alongside them, giving your team more time to interview candidates."
      ),
    ],
    [
      c(
        "무료로 어디까지 이용할 수 있나요?",
        "What can we do on the free plan?"
      ),
      c(
        "카드 등록 없이 포지션을 만들고 후보를 살펴볼 수 있어요. Free에서는 한 번에 포지션 1개까지 채용을 진행할 수 있고, 초안 수에는 제한이 없어요. 공용 Intro가 매달 10개 제공돼요. Intro는 후보자에게 우리 채용 기회를 제안하거나, 관심을 보인 후보자와 연결을 요청할 때 사용해요. 채용이 성사돼도 별도 수수료는 없어요.",
        "The Free plan lets you hire for one active role, create unlimited drafts, and review candidates without a credit card. You get 10 Intros each month, shared across your roles. Use an Intro to ask Harper to reach out to a candidate about your role. Intros also cover accepting an introduction through Ready to connect, which requires a paid slot or an eligible agreement. There’s no fee when you hire on the Free plan."
      ),
    ],
    [
      c("후보는 어디서 오나요?", "Where do candidates come from?"),
      c(
        "Harper와 자신의 경력과 다음 커리어에 대해 이야기한 분들이에요. 적극적으로 이직을 준비하는 분도 있고, 당장 옮길 생각은 없지만 좋은 기회에는 열려 있는 분도 있어요. 그동안 해온 일과 원하는 조건을 바탕으로 기회를 제안하고, 후보자가 만나보고 싶다고 하면 회사와 연결을 진행해요.",
        "Candidates have spoken with Harper about their experience and what they want next. Some are actively looking; others are open to the right opportunity. Harper uses that context to suggest relevant roles and arrange introductions when candidates are interested."
      ),
    ],
    [
      c("지금 바로 쓸 수 있나요?", "Can I start right away?"),
      c(
        "회사 이메일로 가입한 뒤 회사 정보를 확인하고 Free를 선택하면 돼요. 카드 등록이나 완성된 채용 공고 없이 시작할 수 있어요.",
        "Sign up with your work email, confirm your company details, and choose Free. No credit card or finished job description is required."
      ),
    ],
  ];
  return (
    <main
      id="top"
      lang={locale}
      className="bg-bg-basement pt-[60px] text-neutral-primary md:pb-[76px]"
    >
      <CareerAppBar
        careerStartHref={signupHref}
        primaryActionLabel={cta}
        showPrimaryAction={false}
        onCareerStartClick={(event) => {
          event.preventDefault();
          start();
        }}
        showSectionLinks={false}
        audienceHref="/"
        locale={locale}
        navigationLinks={[
          { href: `/pricing?lang=${locale}`, label: c("가격", "Pricing") },
          {
            href: "#company-demo",
            label: c("데모 영상", "Demo"),
          },
          { href: "#company-faq", label: c("자주 묻는 질문", "FAQ") },
        ]}
        secondaryAction={{
          href: `/org?lang=${locale}`,
          label: c("로그인", "Sign in"),
          mobileLabel: c("사용하러 가기", "Open Harper"),
        }}
      />
      <div className="mx-auto w-[calc(100%_-_48px)] max-w-[1040px] md:w-[calc(100%_-_64px)]">
        <section
          id="company-hero"
          className="pt-[30px] pb-9 text-left md:pt-[60px] md:pb-12 md:text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-bg-weak px-[13px] py-[7px] text-[12px] leading-normal text-neutral-800 md:text-[13px]">
            {c(
              "AI 채용 에이전트 Harper",
              "Your AI recruiting partner"
            )}
          </span>
          <h1 className="mt-[18px] text-[clamp(29px,8vw,32px)] leading-[1.3] font-medium break-keep md:mt-[22px] md:text-[52px] md:leading-[1.4]">
            <span className="hidden md:inline">
              {c("채용을 함께할 동료가", "Meet your new")}
              <br />
              {c("한 명 더 생겼어요.", "recruiting partner.")}
            </span>
            <span className="md:hidden">
              {c("채용을 함께할", "Meet your new")}
              <br />
              {c("동료가 한 명 더", "recruiting")}
              <br />
              {c("생겼어요.", "partner.")}
            </span>
          </h1>
          <p className="flex flex-col mx-auto mt-4 max-w-[550px] text-[15px] leading-[1.7] break-keep text-neutral-muted md:mt-5 md:text-[17px] md:leading-[1.75]">
            <span>
              {c(
                "이름은 Harper예요. 후보를 찾고, 먼저 이야기해보고,",
                "Harper finds candidates, starts the conversation,"
              )}
            </span>
            <span>
              {c(
                "맞는 분만 연결해드려요.",
                "and connects you with the right people."
              )}
            </span>
          </p>
          <HiringPrompt
            locale={locale}
            purpose={purpose}
            onChange={setPurpose}
            onStart={start}
          />
        </section>
        <section
          className="md:grid md:grid-cols-[1.25fr_1fr] md:items-center md:gap-9 md:border-y md:border-neutral-1000-a10 md:py-8 mt-12"
          aria-label={c(
            "Harper와 함께하는 인재와 회사",
            "Candidates and companies using Harper"
          )}
        >
          <LandingStats locale={locale} />
          <div>
            <p className="mt-7 mb-3 text-left text-xs leading-normal text-neutral-muted md:mt-0 md:text-right md:text-[13px]">
              {c("Harper와 함께 채용하는 팀", "Teams hiring with Harper")}
            </p>
            <div className="grid grid-cols-2 items-center gap-2 md:grid-cols-4 md:gap-2.5">
              {[
                {
                  name: "Sierra",
                  src: "/images/logos/sierra.svg",
                  className: "w-16",
                },
                {
                  name: "Wonderful",
                  src: "/images/wonderful.png",
                  className: "h-full w-full",
                },
                {
                  name: "SBVA",
                  src: "/images/logos/sbva.png",
                  className: "w-14",
                },
                {
                  name: "Aleph Kids",
                  src: "/images/logos/aleph-kids.svg",
                  className: "w-18",
                },
              ].map((logo) => (
                <div
                  key={logo.name}
                  className="flex h-[52px] min-w-0 items-center justify-center rounded-[10px] bg-bg-weak px-6 py-[13px] md:h-11 md:p-2"
                >
                  <Image
                    src={logo.src}
                    alt={logo.name}
                    width={120}
                    height={36}
                    className={cn("object-contain grayscale", logo.className)}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
        <CompanyPricingSection
          locale={locale}
          onStart={(enterprise) => {
            if (!enterprise) {
              start();
              return;
            }
            if (enterprise && !purpose)
              setPurpose(
                c(
                  "Enterprise 도입 미팅을 신청합니다.",
                  "I’d like to discuss Enterprise."
                )
              );
            contactSales();
          }}
        />
        <section
          id="company-recommendation"
          className="scroll-mt-[84px] pt-[72px] md:scroll-mt-[104px] md:pt-[132px]"
        >
          <SectionHeading
            eyebrow={c("추천 카드", "Your shortlist, explained")}
            description={c(
              "조건마다 맞는지, 대화로 직접 확인한 내용까지 정리해서 보내드려요.",
              "See how candidates meet your criteria and what Harper has confirmed with them."
            )}
          >
            {c("이력서 대신,", "More than a resume.")}
            <br />
            {c("이런 카드를 받아요.", "A reason to meet.")}
          </SectionHeading>
          <div className="mt-7 grid grid-cols-1 items-center gap-6 md:mt-12 md:grid-cols-[1.1fr_0.9fr] md:gap-16">
            {candidateCard}
            <dl>
              {[
                {
                  icon: ListChecks,
                  title: c(
                    "요구사항마다 충족 여부",
                    "Fit against your criteria"
                  ),
                  body: c(
                    "회사가 정한 조건 하나하나에 맞는지 표시해요.",
                    "See how each person fits the requirements you set."
                  ),
                },
                {
                  icon: CircleHelp,
                  title: c(
                    "확인이 더 필요한 부분",
                    "Questions still to answer"
                  ),
                  body: c(
                    "애매한 건 숨기지 않고 따로 알려드려요.",
                    "See where more information is needed before you decide."
                  ),
                },
                {
                  icon: ShieldCheck,
                  title: c(
                    "Harper가 직접 확인한 정보",
                    "Details confirmed by Harper"
                  ),
                  body: c(
                    "희망 연봉, 영어 수준처럼 이력서에 없는 내용이에요.",
                    "Learn about salary expectations, English proficiency, and other details a resume may not cover."
                  ),
                },
                {
                  icon: CalendarDays,
                  title: c(
                    "바로 인터뷰 일정 잡기",
                    "Let Harper handle scheduling"
                  ),
                  body: c(
                    "일정 조율까지 도와드리고 바로 인터뷰를 잡아드려요.",
                    "Harper coordinates availability and gets your interviews scheduled."
                  ),
                },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="border-b border-neutral-1000-a10 py-[18px] last:border-b-0 md:py-6"
                >
                  <dt className="flex items-center gap-2.5 text-sm leading-normal font-medium md:text-base">
                    <Icon
                      className="size-[16px] stroke-[1.5]"
                      aria-hidden="true"
                    />
                    {title}
                  </dt>
                  <dd className="mt-[7px] ml-7 text-[13px] leading-[1.6] break-keep text-neutral-muted md:text-sm">
                    {body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
        <section className="scroll-mt-[84px] pt-[72px] md:scroll-mt-[104px] md:pt-[132px]">
          <SectionHeading eyebrow={c("누가 쓰나요", "Built for your team")}>
            <div className="flex flex-col md:flex-row md:gap-x-2 items-center justify-center">
              <span>{c("채용팀도,", "For everyone")}</span>
              <span>{c("현업 리더도 함께 써요.", "building a team.")}</span>
            </div>
          </SectionHeading>
          <div className="mt-6 grid grid-cols-1 gap-3 md:mt-11 md:grid-cols-3 md:gap-5">
            {[
              {
                icon: Users,
                title: c("채용팀", "Recruiting teams"),
                body: c(
                  "포지션은 늘었는데 사람은 그대로일 때. 후보 찾기와 첫 연락은 Harper에게 맡기고, 좋은 후보 관리에 집중하세요.",
                  "More roles to fill, but no extra hands? Let Harper handle sourcing and outreach while you focus on your candidates."
                ),
              },
              {
                icon: BriefcaseBusiness,
                title: c("현업 리더", "Hiring managers"),
                body: c(
                  "본업하면서 채용까지 챙겨야 할 때. 필요한 동료를 설명하고, 만나볼 분을 고르세요.",
                  "Hiring on top of your day job? Describe who you need and choose the candidates you’d like to meet."
                ),
              },
              {
                icon: Sprout,
                title: c("대표", "Founders"),
                body: c(
                  "아직 채용팀이 없을 때. 첫 채용부터 Harper가 함께해요.",
                  "No recruiting team yet? Get help from your very first hire."
                ),
              },
            ].map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-[18px] border border-neutral-1000-a10 bg-bg-floating p-[22px] md:rounded-[22px] md:px-[26px] md:py-[30px]"
              >
                <Icon
                  className="size-6 stroke-[1.4] text-neutral-muted"
                  aria-hidden="true"
                />
                <h3 className="mt-3.5 text-base font-medium md:mt-6 md:text-[17px]">
                  {title}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.6] break-keep text-neutral-muted md:mt-2.5 md:text-sm">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section
          id="company-process"
          className="scroll-mt-[84px] pt-[72px] md:scroll-mt-[104px] md:pt-[132px]"
        >
          <SectionHeading eyebrow={c("진행 방식", "How it works")}>
            {c("세 단계면 충분해요.", "From hiring brief to introduction.")}
          </SectionHeading>
          <ol className="mt-6 grid grid-cols-1 md:mt-11 md:grid-cols-3 md:gap-5">
            {[
              [
                c("필요한 사람을 알려주세요", "Tell Harper who you need"),
                c(
                  "채팅이나 Slack에 한 줄부터 시작해요.",
                  "Start with a message in chat or Slack."
                ),
              ],
              [
                c(
                  "일주일 안에 카드가 와요",
                  "Review your shortlist"
                ),
                c(
                  "조건과 관심도를 살핀 후보를 소개해요.",
                  "See why each candidate could be a fit."
                ),
              ],
              [
                c("만나고 싶은 분만 고르세요", "Choose who you’d like to meet"),
                c(
                  "나머지 연결은 Harper가 도와드려요.",
                  "Harper handles the introduction."
                ),
              ],
            ].map(([title, body], i) => (
              <li
                key={title}
                className="flex gap-4 border-b border-neutral-1000-a10 py-5 md:block md:rounded-[22px] md:border md:bg-bg-floating md:px-[26px] md:py-[30px]"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-1000 text-[13px] text-neutral-00 md:size-[30px]">
                  {i + 1}
                </span>
                <div>
                  <p className="mt-0.5 text-base font-normal md:mt-[22px]">
                    {title}
                  </p>
                  <p className="text-sm break-keep text-neutral-muted mt-0.5 md:text-[15px]">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div
            id="company-demo"
            className="relative mt-6 scroll-mt-20 overflow-hidden rounded-xl"
          >
            <DemoVideo playerName="Harper company page" />
            <div className="absolute bottom-5 left-6 text-white/60 text-center text-sm">
              {c("소리를 켜고 보시면 좋습니다.", "Best watched with sound on.")}
            </div>
          </div>
          <figure className="relative mt-5 rounded-[18px] bg-neutral-1000 px-6 py-[30px] text-center text-neutral-00 md:mt-6 md:rounded-[22px] md:px-10 md:py-14 md:pb-16">
            <blockquote className="mt-3 text-[19px] leading-[1.6] font-light break-keep md:text-[25px]">
              {'"'}
              {c(
                "한 달 만에 20명을 연결받았고,",
                "We were introduced to 20 candidates in a month"
              )}
              <br />
              {c("채용까지 바로 이어졌습니다.", "and made a hire.")}
              {'"'}
            </blockquote>
            <figcaption className="mt-5 font-extralight text-sm text-neutral-500 max-md:leading-[1.6] md:text-base md:leading-normal">
              General Manager · $5B AI Company
            </figcaption>
          </figure>
        </section>
        <section
          className={cn(
            "scroll-mt-[84px] pt-[72px] md:scroll-mt-[104px] md:pt-[132px]",
            "grid grid-cols-1 items-start gap-8 pb-16 md:grid-cols-[minmax(0,1fr)_420px] md:gap-[72px] md:pb-[120px]"
          )}
        >
          <div id="company-faq" className="scroll-mt-24">
            <SectionHeading
              eyebrow={c("자주 묻는 질문", "FAQ")}
              className="md:text-left"
            >
              {c("궁금한 점", "What would you like to know?")}
            </SectionHeading>
            <div className="mt-[22px] md:mt-7">
              {faqs.map(([question, answer]) => (
                <details
                  key={question}
                  className="group/faq border-b border-neutral-1000-a10 py-[19px] first:border-t md:py-[22px]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                    {question}
                    <Plus
                      className="size-4 shrink-0 text-neutral-muted transition-transform duration-200 group-open/faq:rotate-45 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="mt-3.5 text-sm leading-[1.8] break-keep text-neutral-muted">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
          {renderContact(purpose, setPurpose)}
        </section>
      </div>
    </main>
  );
}

export function CompanyPricingSection({
  locale,
  onStart,
}: {
  locale: Locale;
  onStart: (enterprise: boolean) => void;
}) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const [annual, setAnnual] = useState(true);

  return (
    <section
      id="company-pricing"
      className="scroll-mt-[84px] pt-[72px] md:scroll-mt-[104px] md:pt-[132px]"
    >
      <SectionHeading
        eyebrow={c("가격", "Pricing")}
        description={
          <>
            {c(
              "Harper는 쉬지 않고 후보를 찾고 이야기를 나눠요.",
              "Harper handles candidate sourcing and outreach."
            )}
            <br />
            {c(
              "회사는 만나고 싶은 사람만 고르면 돼요. 채용 수수료는 받지 않아요.",
              "You choose who to meet. Free and standard plans have no placement fees."
            )}
          </>
        }
      >
        {c(
          `월 $${annual ? 199 : 249}로,`,
          "Your recruiting partner."
        )}
        <br />
        {c("채용을 함께할 동료를", `From $${annual ? 199 : 249} per role,`)}
        <br />
        {c("한 명 더 두세요.", "per month.")}
      </SectionHeading>
      <div className="text-center">
        <div
          className="mt-12 flex gap-1 rounded-lg bg-bg-weak p-1 md:mt-16 md:inline-flex"
          aria-label={c("결제 주기", "Billing cycle")}
        >
          <MuteButton
            variant={annual ? "default" : "transparent"}
            className="max-md:flex-1"
            aria-pressed={annual}
            onClick={() => setAnnual(true)}
          >
            {c("연 결제", "Annual")}
            <span className="text-primary">{c("20% 할인", "Save 20%")}</span>
          </MuteButton>
          <MuteButton
            variant={!annual ? "default" : "transparent"}
            className="max-md:flex-1"
            aria-pressed={!annual}
            onClick={() => setAnnual(false)}
          >
            {c("월 결제", "Monthly")}
          </MuteButton>
        </div>
      </div>
      <div className="mt-[26px] grid grid-cols-1 gap-[26px] md:mt-11 md:grid-cols-3 md:gap-5">
        {[
          {
            name: "Free",
            note: c("먼저 써보고 싶다면", "For your first role"),
            price: "$0",
            unit: c("카드 등록 없음", "No credit card required"),
            features: [
              c("활성 포지션 1개 · 초안 무제한", "1 active role · unlimited drafts"),
              c("매달 공용 Intro 10개", "10 shared Intros per month"),
              c("채용 수수료 없음", "No placement fee"),
            ],
          },
          {
            name: "Hire with Harper",
            note: c(
              "급하게 채용할 포지션이 있다면",
              "For priority hires"
            ),
            price: annual ? "$199" : "$249",
            unit: c(
              annual
                ? "포지션 하나, 한 달 기준 · 연 $2,388 결제"
                : "포지션 하나, 한 달 기준 · 매월 결제",
              annual
                ? "Per role, per month · $2,388 billed annually"
                : "Per role, per month · billed monthly"
            ),
            features: [
              c(
                "후보 찾기·대화는 무제한",
                "Unlimited sourcing and candidate conversations"
              ),
              c(
                "포지션마다 매달 Intro 50개",
                "50 Intros per role, per month"
              ),
              c(
                "관심 있다고 한 분만 연결",
                "Meet candidates who want to talk"
              ),
            ],
          },
          {
            name: "Enterprise",
            note: c("여러 팀이 함께 채용한다면", "For hiring across multiple teams"),
            price: c("문의", "Custom pricing"),
            unit: c("회사에 맞춰 계약해요", "A plan tailored to your company"),
            features: [
              c("포지션·Intro 무제한", "Unlimited roles and Intros"),
              c("도입부터 Harper 팀이 함께", "Hands-on onboarding support"),
            ],
          },
        ].map((plan, i) => (
          <article
            key={plan.name}
            className={cn(
              "relative flex flex-col rounded-[20px] border border-neutral-1000-a10 bg-bg-floating px-6 py-[26px] md:rounded-[22px] md:px-[26px] md:pt-[30px]",
              i === 1 &&
                "border-neutral-800 shadow-[0_8px_32px] shadow-neutral-1000/4"
            )}
          >
            {i === 1 && (
              <span className="absolute -top-3 left-6 rounded-full bg-neutral-1000 px-3 py-1 text-[11px] font-normal text-neutral-00">
                {c(
                  "포지션마다 Harper가 전담",
                  "Dedicated sourcing for each role"
                )}
              </span>
            )}
            <h3 className="text-[17px] font-medium">{plan.name}</h3>
            <p className="mt-1.5 text-[13px] leading-[1.6] text-neutral-muted">
              {plan.note}
            </p>
            <p className="mt-5 flex items-baseline gap-[9px] text-[34px] leading-[1.2] font-medium tracking-[-0.04em] md:mt-6 md:text-[40px]">
              {plan.price}
              {i === 1 && annual && (
                <del className="text-base font-normal text-neutral-soft">
                  $249
                </del>
              )}
            </p>
            <p className="mt-[9px] text-[12px] leading-[1.6] text-neutral-muted md:min-h-9">
              {plan.unit}
            </p>
            <ul className="my-10 grid flex-1 content-start gap-[11px] text-sm leading-[1.6] md:mb-24 md:gap-3 md:text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check
                    className="mt-[3px] size-[15px] shrink-0 text-positive"
                    aria-hidden="true"
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <MuteButton
              variant={i === 2 ? "default" : "dark"}
              size="lg"
              className="w-full"
              onClick={() => onStart(i === 2)}
            >
              {i === 2
                ? c("미팅 신청하기", "Contact sales")
                : i === 0
                  ? c("무료로 시작하기", "Start for free")
                  : c("시작하기", "Get started")}
            </MuteButton>
          </article>
        ))}
      </div>
      <p className="mt-5 text-sm leading-[1.7] text-neutral-muted">
        {c(
          "후보자에게 기회 제안을 요청하거나 연결을 수락할 때 Intro 1개를 사용해요. 유료 슬롯을 추가해도 공용 월 10 Intro는 별도로 유지돼요. Intro는 매달 갱신되며 남은 수량은 이월되지 않아요.",
          "Use 1 Intro to request outreach to a candidate or accept an introduction. Your workspace keeps its 10 shared monthly Intros when you add paid slots. Intros renew monthly, and unused Intros don't roll over."
        )}
      </p>
      <PricingCostComparison
        locale={locale}
        harperMonthlyKrw={annual ? 260_000 : 330_000}
        embedded
      />
    </section>
  );
}
