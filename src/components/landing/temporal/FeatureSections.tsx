import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  CalendarCheck2,
  Check,
  FileText,
  Paperclip,
} from "lucide-react";
import Image from "next/image";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { FeatureKey } from "./types";
import {
  CompanyMark,
  EASE,
  HarperMark,
  SectionReveal,
  TwoLineTitle,
  WorkingDots,
  useSceneTimeline,
  useTypewriter,
  useC,
} from "./primitives";
import { tw } from "./tw";

type FeaturesCopy = ReturnType<typeof useFeaturesCopy>;

const ORDER: FeatureKey[] = ["always", "reach", "apply", "agenda", "direct"];

/** 기능 섹션 문구. 한국어·영어를 `c("한글", "English")`로 나란히 적는다. */
function useFeaturesCopy() {
  const c = useC();
  return {
    always: {
      title: [
        c("좋은 기회를,", "While you sleep,"),
        c("절대 놓치지 않아요.", "Harper keeps looking."),
      ],
      body: c(
        "Harper는 채용 공고만 살펴보지 않아요. 투자 기사, 회사 블로그, 대표가 올린 채용 글까지 매일 살펴보고, 회원님 기준에 맞는 곳이 보이면 바로 알려 드려요.",
        "Not just job boards. Harper reads funding news, company blogs and founders’ hiring posts every day, and tells you the moment something fits what you want."
      ),
      visual: {
        heading: c("밤사이 Harper가 한 일", "What Harper did overnight"),
        scanned: c("살펴본 곳", "Sources checked"),
        live: c("지금 살펴보는 중", "Looking now"),
        liveSource: "cognition.ai/careers",
        entries: [
          {
            time: c("오전 1:12", "1:12 AM"),
            text: c(
              "Anthropic 서울 오피스 채용 페이지를 확인했어요",
              "Checked Anthropic’s Seoul careers page"
            ),
          },
          {
            time: c("오전 3:40", "3:40 AM"),
            text: c(
              "Brindle 대표가 LinkedIn에 첫 백엔드 엔지니어를 찾는다고 썼어요",
              "Brindle’s CEO posted on LinkedIn about a first backend hire"
            ),
          },
          {
            time: c("오전 5:05", "5:05 AM"),
            text: c(
              "Sierra의 시리즈 C 소식을 읽고 서울 채용 계획을 찾아봤어요",
              "Read Sierra’s Series C news and looked for Seoul hiring plans"
            ),
          },
          {
            time: c("오전 6:58", "6:58 AM"),
            text: c(
              "Cognition 서울 Forward Deployed Engineer 공고를 찾았어요",
              "Found Cognition’s Seoul Forward Deployed Engineer role"
            ),
          },
        ],
        notice: {
          app: "Harper",
          time: c("오전 7:30", "7:30 AM"),
          text: c(
            "밤사이 새 기회 2개를 찾았어요. 하나는 공고가 없는 팀이에요.",
            "Found 2 new opportunities overnight. One of them hasn’t posted a role."
          ),
        },
      },
    },
    reach: {
      title: [
        c("채용 페이지에 없으면", "Not on the careers page?"),
        c("대표에게 직접", "Straight to the founder."),
      ],
      body: c(
        "좋은 팀이 늘 공고를 올려 두지는 않아요. 잡플랫폼에 없지만 좋은 회사는 대표나 채용 담당자의 연락처를 찾아, 메일을 보내요. 받는 사람, 제목, 본문, 첨부할 이력서까지 확인하고 내가 마지막에 확인했을 때만 보내요.",
        "Great teams don’t always post their openings. When a good company isn’t on any job board, Harper finds the founder’s or hiring lead’s contact and emails them. You see the recipient, subject, body and attached resume, and it only sends after your final OK."
      ),
      visual: {
        title: c("Brindle 대표에게 보낼 메일", "Email to Brindle’s CEO"),
        to: c("받는 사람", "To"),
        toValue: c(
          "한서준 · seojun@brindle.ai",
          "Seojun Han · seojun@brindle.ai"
        ),
        subject: c("제목", "Subject"),
        subjectValue: c(
          "결제 백엔드 4년, 첫 백엔드 엔지니어로 이야기 나눌 수 있을까요",
          "Payments backend, 4 years: could we talk about your first backend role?"
        ),
        body: c(
          "서준 님, LinkedIn에서 첫 백엔드 엔지니어를 찾으신다는 글을 봤어요. 핀테크에서 4년 동안 정산·환불 시스템을 만들었고, 가맹점 정산 에이전트라면 바로 도움이 될 수 있을 것 같아요.",
          "Hi Seojun, I saw your LinkedIn post about hiring a first backend engineer. I’ve spent 4 years building settlement and refund systems at a fintech, which maps closely to settlement agents for merchants."
        ),
        attachment: c("이력서.pdf", "Resume.pdf"),
        hold: c("보류하기", "Hold for now"),
        send: c("지금 보내기", "Send now"),
        sent: c("보냈어요", "Sent"),
        reply: {
          from: c("한서준", "Seojun Han"),
          address: "seojun@brindle.ai",
          time: c("방금", "Just now"),
          text: c(
            "좋네요. 다음 주에 커피 한잔하면서 이야기해요.",
            "Sounds great. Let’s grab coffee next week."
          ),
        },
      },
    },
    apply: {
      title: [
        c("번거로운 작업들도 전부,", "All the busywork,"),
        c("Harper가 대신해요.", "handled by Harper."),
      ],
      body: c(
        "회사마다 보는 경험이 달라서, 이력서를 맞춰 낼수록 서류에서 눈에 띄어요. 그렇다고 지원할 때마다 고쳐 쓰기는 번거롭죠. Harper가 공고를 읽고, 회원님 경험 중 그 회사가 찾는 부분을 앞으로 꺼내 회사별 이력서를 만들어 둬요. 회원님은 확인만 하면 돼요.",
        "Every company looks for something different, so a tailored resume stands out. Rewriting it for every application is a chore. Harper reads the posting, pulls forward the parts of your experience that company cares about, and prepares a resume for each one. You just review it."
      ),
      visual: {
        name: c("김지원", "Jiwon Kim"),
        headline: c(
          "백엔드 엔지니어 · 결제 4년",
          "Backend engineer · 4 years in payments"
        ),
        experience: c("경력", "Experience"),
        job: c(
          "핀테크 결제팀 · 2021–현재",
          "Fintech payments team · 2021–present"
        ),
        tailoring: c("이 회사에 맞추는 중", "Tailoring for this role"),
        looksFor: c("공고에서 찾는 것", "What they look for"),
        ready: c(
          "확인하면 이 이력서로 지원할게요",
          "Approve and I’ll apply with this version"
        ),
        approve: c("확인하기", "Review"),
        companies: [
          {
            name: "Anthropic",
            logo: "/svgs/anthropic.svg" as string | undefined,
            role: "Applied AI Architect",
            wants: [
              c("파트너와 시스템 설계", "Designing systems with partners"),
              c("요구사항을 설계로", "Turning requirements into design"),
            ],
            note: c(
              "‘파트너와 시스템 설계’를 찾고 있어서, 요구사항을 설계로 옮긴 경험을 맨 위에 뒀어요.",
              "They want someone who designs systems with partners, so I put your requirements-to-design work first."
            ),
            bullets: [
              {
                id: "design",
                parts: [
                  c("재무·CS 팀의 ", "Turned finance and CS "),
                  c(
                    "요구사항을 기술 설계로 옮겨",
                    "requirements into technical design"
                  ),
                  c(
                    " 정산·환불 시스템 구축",
                    " for settlement and refund systems"
                  ),
                ],
              },
              {
                id: "api",
                parts: [
                  c(
                    "가맹점 결제 API 연동을 맡아 ",
                    "Led merchant payment API integrations, "
                  ),
                  c("파트너사와 사양 협의", "aligning specs with partners"),
                  "",
                ],
              },
              {
                id: "incident",
                parts: [
                  c(
                    "결제 장애 대응 절차 수립과 온콜 운영",
                    "Set up payment incident response and on-call"
                  ),
                  "",
                  "",
                ],
              },
            ],
          },
          {
            name: "Cognition",
            logo: undefined as string | undefined,
            role: "Forward Deployed Engineer",
            wants: [
              c("고객사 현장 연동", "Hands-on customer integrations"),
              c("빠른 문제 해결", "Fast problem solving"),
            ],
            note: c(
              "고객사에 붙어 일하는 자리라, 연동 경험과 장애 대응을 앞으로 옮겼어요.",
              "It’s a hands-on customer role, so I moved integrations and incident work up front."
            ),
            bullets: [
              {
                id: "api",
                parts: [
                  "",
                  c(
                    "고객사 시스템에 결제 API를 직접 연동",
                    "Integrated payment APIs directly into customer systems"
                  ),
                  c("하고 현장 이슈 해결", " and fixed issues on site"),
                ],
              },
              {
                id: "incident",
                parts: [
                  c("결제 장애 때 ", "During payment incidents, "),
                  c(
                    "원인 파악부터 배포까지 직접 대응",
                    "owned the fix from diagnosis to deploy"
                  ),
                  "",
                ],
              },
              {
                id: "design",
                parts: [
                  c(
                    "정산·환불 시스템 설계와 구축",
                    "Designed and built settlement and refund systems"
                  ),
                  "",
                  "",
                ],
              },
            ],
          },
          {
            name: "Brindle",
            logo: undefined as string | undefined,
            role: "Founding Backend Engineer",
            wants: [
              c("정산 도메인", "Settlement domain"),
              c("처음부터 만들어 본 경험", "Building from zero"),
            ],
            note: c(
              "정산 에이전트를 만드는 첫 백엔드 자리라, 정산을 처음부터 만든 경험을 강조했어요.",
              "It’s the first backend hire for settlement agents, so I led with building settlement from scratch."
            ),
            bullets: [
              {
                id: "design",
                parts: [
                  c("정산·환불 시스템을 ", ""),
                  c(
                    "처음부터 설계하고 구축",
                    "Designed and built settlement and refund systems from scratch"
                  ),
                  "",
                ],
              },
              {
                id: "incident",
                parts: [
                  "",
                  c(
                    "장애 대응 절차와 온콜 체계를 직접 만듦",
                    "Created the incident process and on-call rotation"
                  ),
                  "",
                ],
              },
              {
                id: "api",
                parts: [
                  c(
                    "가맹점 결제 API 연동",
                    "Merchant payment API integrations"
                  ),
                  "",
                  "",
                ],
              },
            ],
          },
        ],
      },
    },
    agenda: {
      title: [
        c("해야 할 일은,", "Your to-dos?"),
        c("Harper가 먼저 챙겨요", "Harper catches them first."),
      ],
      body: c(
        "답장이 오거나 정할 게 생기면 Harper가 먼저 알아채고, 해야 할 일을 카드로 올려요. 카드를 누르면 바로 이어서 처리해요. 관심, 지원함, 연결 중인 곳은 지원 현황에서 한 줄로 봐요.",
        "When a reply comes in or something needs a decision, Harper notices first and puts it up as a card. Tap the card to pick up right where it left off. Interested, Applied and Connecting all sit in one row in your application overview."
      ),
      visual: {
        heading: c("이번 주", "This week"),
        days: [
          c("월", "Mon"),
          c("화", "Tue"),
          c("수", "Wed"),
          c("목", "Thu"),
          c("금", "Fri"),
          c("토", "Sat"),
          c("일", "Sun"),
        ],
        dates: [16, 17, 18, 19, 20, 21, 22],
        today: 1,
        events: [
          {
            day: 1,
            time: c("오후 3:00", "3:00 PM"),
            title: c("Brindle 대표와 커피챗", "Coffee with Brindle’s CEO"),
            meta: c(
              "성수 · 답장으로 일정 확정",
              "Seongsu · confirmed by email"
            ),
          },
          {
            day: 3,
            time: c("오전 10:00", "10:00 AM"),
            title: c("Anthropic 1차 면접", "Anthropic, first round"),
            meta: c("예상 질문 3개 준비됨", "3 practice questions ready"),
          },
          {
            day: 5,
            time: c("종일", "All day"),
            title: c("AI 에이전트 해커톤", "AI agents hackathon"),
            meta: c(
              "성수 · 신청 마감 D-2",
              "Seongsu · signup closes in 2 days"
            ),
            isNew: true,
          },
        ],
        nudge: {
          title: c(
            "Cognition 리크루터에게 답장할 차례예요",
            "Your turn to reply to Cognition’s recruiter"
          ),
          body: c(
            "이틀째 답을 기다리고 있어요. 답장은 써 뒀어요.",
            "They’ve been waiting two days. A reply is drafted."
          ),
          action: c("답장 확인하기", "Review reply"),
        },
        added: c("새로 찾은 일정", "Newly found"),
      },
    },
    direct: {
      title: [
        c("Harper는 회사와도", "Harper talks to"),
        c("직접 이야기해요.", "companies, too."),
      ],
      body: c(
        "뛰어난 팀들이 Harper에 직접 채용을 요청해요. 원하시면 회원님이 쉬고 있을 때도 Harper가 잘 맞는 회사와 먼저 이야기해서, 오퍼부터 받아 보고 결정하실 수 있게 해요.",
        "Strong teams ask Harper to hire for them directly. If you’ve turned it on, Harper talks to great-fit companies first, even while you’re taking a break, so you can see an offer before you decide."
      ),
      visual: {
        request: c("Harper에 채용 요청", "Hiring through Harper"),
        company: "Wonderful",
        companyMeta: c(
          "AI 에이전트 플랫폼 · 서울",
          "AI agent platform · Seoul"
        ),
        role: "Founding Forward Deployed Engineer",
        you: c("회원님", "You"),
        youMeta: c("결제 백엔드 4년", "4 yrs payments backend"),
        resting: c("지금은 쉬는 중", "Taking a break"),
        talking: c(
          "회사와 먼저 이야기하는 중",
          "Talking with the company first"
        ),
        steps: [
          c("Harper가 먼저 이야기", "Harper talks first"),
          c("오퍼 도착", "Offer arrives"),
          c("회원님이 결정", "You decide"),
        ],
        offer: c("오퍼가 도착했어요", "An offer arrived"),
        decide: c("확인하고 결정하기", "Review and decide"),
      },
    },
  };
}

export function FeatureSections() {
  const copy = useFeaturesCopy();
  return (
    <section id="features" className="relative pb-10 md:pb-16">
      {ORDER.map((key, index) => {
        const feature = copy[key];
        return (
          <FeatureRow
            key={key}
            id={`feature-${key}`}
            reverse={index % 2 === 1}
            title={feature.title}
            body={feature.body}
          >
            {key === "always" ? (
              <AlwaysVisual copy={copy.always.visual} />
            ) : null}
            {key === "reach" ? <ReachVisual copy={copy.reach.visual} /> : null}
            {key === "apply" ? <ApplyVisual copy={copy.apply.visual} /> : null}
            {key === "agenda" ? (
              <AgendaVisual copy={copy.agenda.visual} />
            ) : null}
            {key === "direct" ? (
              <DirectVisual copy={copy.direct.visual} />
            ) : null}
          </FeatureRow>
        );
      })}
    </section>
  );
}

function FeatureRow({
  id,
  reverse,
  title,
  body,
  children,
}: {
  id: string;
  reverse: boolean;
  title: readonly string[];
  body: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24 py-14 md:py-24">
      <div
        className={cn(
          tw.shell,
          "grid grid-cols-1 items-center gap-8 md:gap-14 lg:gap-20",
          reverse
            ? "md:grid-cols-[minmax(0,1fr)_minmax(0,430px)]"
            : "md:grid-cols-[minmax(0,430px)_minmax(0,1fr)]"
        )}
      >
        <SectionReveal className={cn("min-w-0", reverse && "md:order-2")}>
          <TwoLineTitle
            lines={title}
            className="text-[28px] text-balance lg:text-[34px]"
          />
          <p className={cn(tw.lede, "mt-5 md:mt-6")}>{body}</p>
        </SectionReveal>
        <SectionReveal className={cn("min-w-0", reverse && "md:order-1")}>
          <div
            className={cn(
              tw.tile,
              "flex h-[540px] items-center justify-center px-4 md:h-[580px] md:px-10"
            )}
          >
            {children}
          </div>
        </SectionReveal>
      </div>
    </div>
  );
}

/* ---------------- 1. Always searching ---------------- */

function AlwaysVisual({ copy }: { copy: FeaturesCopy["always"]["visual"] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const step = useSceneTimeline(ref, [800, 1000, 1000, 1000, 1200, 3800, 500]);
  const visibleEntries = step === 6 ? 0 : Math.min(step, copy.entries.length);
  const showNotice = step === 5;
  const scanned = 1184 + Math.min(step, 5) * 37;

  return (
    <div ref={ref} className="relative w-full max-w-[440px]">
      <AnimatePresence>
        {showNotice ? (
          <motion.div
            key="notice"
            className={cn(
              tw.glassStrong,
              "absolute inset-x-3 -top-6 z-10 flex items-start gap-3 rounded-[20px] p-3.5 md:-top-8"
            )}
            initial={{ opacity: 0, y: -18, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#1d1d1f]">
              <HarperMark tone="dark" className="size-9 bg-transparent" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between text-[12.5px]">
                <span className="font-semibold text-(--tl-ink)">
                  {copy.notice.app}
                </span>
                <span className="text-(--tl-ink-3)">{copy.notice.time}</span>
              </span>
              <span className="mt-0.5 block text-[13.5px] leading-[1.5] text-(--tl-ink)">
                {copy.notice.text}
              </span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        className={cn(tw.glass, "p-5 md:p-6")}
        animate={{
          scale: showNotice ? 0.97 : 1,
          opacity: showNotice ? 0.75 : 1,
          filter: showNotice ? "blur(1.5px)" : "blur(0px)",
        }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <div className="flex items-end justify-between">
          <div className="text-[19px] font-light tracking-[-0.3px] text-(--tl-ink)">
            {copy.heading}
          </div>
          <div className="text-right">
            <div className="text-[11.5px] text-(--tl-ink-3)">
              {copy.scanned}
            </div>
            <div className="overflow-hidden text-[20px] font-light tabular-nums tracking-[-0.5px] text-(--tl-ink)">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={scanned}
                  className="inline-block"
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  {scanned.toLocaleString()}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
        </div>
        <ol className="relative mt-5 flex min-h-[248px] flex-col">
          <span
            aria-hidden="true"
            className="absolute bottom-3 left-[5px] top-2 w-px bg-[#1d1d1f]/10"
          />
          {copy.entries.map((entry, index) => (
            <motion.li
              key={entry.text}
              className="relative flex gap-3.5 pb-4"
              initial={false}
              animate={{
                opacity: index < visibleEntries ? 1 : 0,
                y: index < visibleEntries ? 0 : 8,
                filter: index < visibleEntries ? "blur(0px)" : "blur(4px)",
              }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              <span className="relative z-10 mt-[7px] size-[11px] shrink-0 rounded-full border-2 border-white bg-[#1d1d1f] shadow-[0_0_0_0.5px_rgb(0_0_0/0.15)]" />
              <span className="min-w-0">
                <span className="block text-[12px] tabular-nums text-(--tl-ink-3)">
                  {entry.time}
                </span>
                <span className="block text-[14px] leading-[1.55] text-(--tl-ink)">
                  {entry.text}
                </span>
              </span>
            </motion.li>
          ))}
        </ol>
        <div className="mt-1 flex items-center gap-2.5 rounded-[12px] bg-white/45 px-3 py-2.5 shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.06)]">
          <Image
            src="/svgs/face.svg"
            alt="Harper"
            width={14}
            height={14}
            className="size-3.5"
          />
          <span className={tw.liveDot} aria-hidden="true" />
          <span className="text-[13px] text-(--tl-ink-2)">{copy.live}</span>
          <span className={cn(tw.shimmerText, "truncate text-[13px]")}>
            {copy.liveSource}
          </span>
          <span className="ml-auto text-(--tl-ink-3)">
            <WorkingDots />
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/* ---------------- 2. Reach out ---------------- */

function ReachVisual({ copy }: { copy: FeaturesCopy["reach"]["visual"] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 0 대기 · 1 본문 작성 · 2 보내기 누름 · 3 보냄 · 4 답장 · 5 정리
  const step = useSceneTimeline(ref, [600, 3400, 900, 1100, 3600, 500]);
  const body = useTypewriter(copy.body, step === 1, { speed: 22 });
  const bodyText = step === 0 ? "" : step === 1 ? body : copy.body;
  const sent = step >= 3;

  return (
    <div
      ref={ref}
      className="relative flex w-full min-w-0 max-w-[460px] flex-col items-stretch"
    >
      <motion.div
        className={cn(tw.glass, "p-4 md:p-5")}
        animate={{
          y: sent ? -14 : 0,
          scale: sent ? 0.97 : 1,
          opacity: step === 5 ? 0 : 1,
        }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-medium tracking-[-0.01em] text-(--tl-ink)">
            {copy.title}
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            {sent ? (
              <motion.span
                key="sent"
                className="inline-flex h-6 items-center gap-1 rounded-full bg-[#1f7a4c]/10 px-2.5 text-[12px] font-medium text-[#1f7a4c]"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 26 }}
              >
                <Check className="size-3" strokeWidth={2.6} />
                {copy.sent}
              </motion.span>
            ) : (
              <motion.span key="draft" exit={{ opacity: 0 }} className="h-6" />
            )}
          </AnimatePresence>
        </div>
        <div className="mt-4">
          <div className={tw.fieldLabel}>{copy.to}</div>
          <div className={tw.field}>{copy.toValue}</div>
        </div>
        <div className="mt-3">
          <div className={tw.fieldLabel}>{copy.subject}</div>
          <div className={cn(tw.field, "truncate")}>{copy.subjectValue}</div>
        </div>
        {/* 다 쓴 본문을 보이지 않게 깔아 두고 같은 칸에 타이핑을 겹친다. 쓰는 동안 카드 높이가 바뀌지 않는다. */}
        <div className={cn(tw.field, "mt-3 grid leading-[1.7]")}>
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1"
          >
            {copy.body}
          </span>
          <span className="col-start-1 row-start-1">
            {bodyText}
            {step === 1 ? <span className={tw.caret} /> : null}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#1d1d1f]/[0.05] px-2.5 text-[12px] text-(--tl-ink-2)">
            <Paperclip className="size-3.5" strokeWidth={1.7} />
            {copy.attachment}
          </span>
          <div className="flex items-center gap-1.5">
            <span className={cn(tw.pill, tw.pillGhost)}>{copy.hold}</span>
            <motion.span
              className={cn(tw.pill, tw.pillDark, "font-medium")}
              animate={step === 2 ? { scale: [1, 0.92, 1] } : { scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3, ease: EASE }}
            >
              {copy.send}
            </motion.span>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {step === 4 ? (
          <motion.div
            key="reply"
            className={cn(
              tw.glassStrong,
              // 모바일에서는 카드 아래쪽에 겹쳐 띄워 타일 높이를 넘지 않게 한다.
              "absolute right-0 bottom-0 z-10 flex w-[92%] items-start p-4 md:relative md:bottom-auto md:-mt-2 md:ml-auto md:w-[88%]"
            )}
            initial={{ opacity: 0, y: 24, scale: 0.96, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 10, filter: "blur(6px)" }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-(--tl-ink)">
                    {copy.reply.from}
                  </span>{" "}
                  <span className="text-(--tl-ink-3)">
                    {copy.reply.address}
                  </span>
                </span>
                <span className="shrink-0 text-(--tl-ink-3)">
                  {copy.reply.time}
                </span>
              </span>
              <span className="mt-1 block text-[14px] leading-[1.55] text-(--tl-ink)">
                {copy.reply.text}
              </span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- 3. Tailored resumes ---------------- */

// 회사마다 0 맞추는 중 · 1 고친 문장 표시 · 2 Harper 메모
const TAILOR_STEPS = [700, 900, 2800, 700, 900, 2800, 700, 900, 2800];

function ApplyVisual({ copy }: { copy: FeaturesCopy["apply"]["visual"] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const step = useSceneTimeline(ref, TAILOR_STEPS);
  const companyIndex = Math.floor(step / 3);
  const phase = step % 3;
  const company = copy.companies[companyIndex];
  const tailoring = phase === 0;

  return (
    <div ref={ref} className="flex w-full max-w-[460px] flex-col gap-3">
      <div className="flex items-center gap-1 self-start rounded-full bg-white/45 p-1 shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.06)]">
        {copy.companies.map((item, index) => (
          <span
            key={item.name}
            className={cn(
              "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors duration-300",
              index === companyIndex ? "text-(--tl-ink)" : "text-(--tl-ink-3)"
            )}
          >
            {index === companyIndex ? (
              <motion.span
                layoutId="tailor-company"
                className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              />
            ) : null}
            <CompanyMark logo={item.logo} size={14} className="relative" />
            <span className="relative">{item.name}</span>
          </span>
        ))}
      </div>

      <article className="relative rounded-[14px] bg-white px-5 pb-5 pt-[18px] shadow-[0_0_0_0.5px_rgb(20_30_45/0.08),0_1px_2px_rgb(20_30_45/0.04),0_20px_40px_-24px_rgb(20_30_45/0.3)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[17px] font-semibold tracking-[-0.02em] text-(--tl-ink)">
              {copy.name}
            </div>
            <div className="mt-0.5 text-[12.5px] text-(--tl-ink-2)">
              {copy.headline}
            </div>
          </div>
          <div className="text-right text-[11.5px] leading-tight text-(--tl-ink-3)">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={company.name}
                className="block"
                initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                {company.role}
              </motion.span>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-4 border-t border-black/[0.06] pt-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-(--tl-ink-3)">
              {copy.experience}
            </span>
            <span
              className={cn(
                tw.statusLine,
                "text-[11.5px] transition-opacity duration-300",
                tailoring ? "opacity-100" : "opacity-0"
              )}
            >
              <WorkingDots />
              <span className={tw.shimmerText}>{copy.tailoring}</span>
            </span>
          </div>
          <div className="mt-1.5 text-[13px] font-medium text-(--tl-ink)">
            {copy.job}
          </div>
          <ul className="mt-2.5 flex flex-col gap-2">
            {company.bullets.map((bullet) => {
              const [before, focus, after] = bullet.parts;
              return (
                <motion.li
                  key={bullet.id}
                  layout
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                  className="flex gap-2.5 text-[13.5px] leading-[1.6] text-(--tl-ink)"
                >
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-[#aeaeb2]" />
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={`${company.name}-${bullet.id}`}
                      initial={{ opacity: 0, filter: "blur(4px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(4px)" }}
                      transition={{ duration: 0.4, ease: EASE }}
                    >
                      {before}
                      {focus ? (
                        <span
                          className="bg-[linear-gradient(transparent_58%,rgb(10_122_255/0.16)_58%)] bg-no-repeat transition-[background-size] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                          style={{
                            backgroundSize:
                              phase >= 1 ? "100% 100%" : "0% 100%",
                          }}
                        >
                          {focus}
                        </span>
                      ) : null}
                      {after}
                    </motion.span>
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ul>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11.5px] text-(--tl-ink-3)">
            {copy.looksFor}
          </span>
          {company.wants.map((want) => (
            <span
              key={want}
              className="rounded-full bg-[#0a7aff]/[0.08] px-2 py-0.5 text-[11.5px] text-[#0a5fc7]"
            >
              {want}
            </span>
          ))}
        </div>
      </article>

      <div className="h-[64px]">
        <AnimatePresence mode="wait">
          {phase === 2 ? (
            <motion.div
              key={company.name}
              className={cn(
                tw.glassStrong,
                "flex items-start gap-2.5 rounded-[14px] px-3.5 py-3"
              )}
              initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_0_0_0.5px_rgb(20_30_45/0.1)]">
                <Image
                  src="/svgs/face.svg"
                  alt=""
                  width={13}
                  height={13}
                  className="size-[13px]"
                />
              </span>
              <span className="text-[12.5px] leading-[1.55] text-(--tl-ink)">
                {company.note}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-(--tl-ink-2)">{copy.ready}</span>
        <span className={cn(tw.pill, tw.pillDark, "font-medium")}>
          {copy.approve}
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

/* ---------------- 4. Agenda ---------------- */

function AgendaVisual({ copy }: { copy: FeaturesCopy["agenda"]["visual"] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 0 · 1 커피챗 · 2 면접 · 3 해커톤 추가 · 4 답장 알림 · 5 머무름 · 6 정리
  const step = useSceneTimeline(ref, [700, 800, 900, 1500, 1200, 3200, 500]);
  const fade = step === 6;
  const visibleEvents = Math.min(Math.max(step, 0), 3);
  const eventDays = copy.events
    .slice(0, visibleEvents)
    .map((event) => event.day);

  return (
    <motion.div
      ref={ref}
      className="flex w-full max-w-[460px] flex-col gap-3"
      animate={{ opacity: fade ? 0 : 1 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <div className={cn(tw.glass, "p-5")}>
        <div className="flex items-baseline justify-between">
          <div className="text-[19px] font-light tracking-[-0.3px] text-(--tl-ink)">
            {copy.heading}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-7 text-center">
          {copy.days.map((day, index) => {
            const isToday = index === copy.today;
            const hasEvent = eventDays.includes(index);
            return (
              <div key={day} className="flex flex-col items-center gap-1.5">
                <span className="text-[11.5px] text-(--tl-ink-3)">{day}</span>
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-[14px] tabular-nums",
                    isToday ? "bg-[#1d1d1f] text-white" : "text-(--tl-ink)"
                  )}
                >
                  {copy.dates[index]}
                </span>
                <span className="relative h-1.5 w-1.5">
                  <AnimatePresence>
                    {hasEvent ? (
                      <motion.span
                        className="absolute inset-0 rounded-full bg-[#1d1d1f]/60"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 20,
                        }}
                      />
                    ) : null}
                  </AnimatePresence>
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex min-h-[204px] flex-col gap-2 border-t border-black/[0.06] pt-4">
          <AnimatePresence initial={false}>
            {copy.events.slice(0, visibleEvents).map((event) => (
              <motion.div
                key={event.title}
                layout
                className={cn(
                  "relative flex items-center gap-3 rounded-[14px] bg-white/45 px-3.5 py-2.5 shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.06)]",
                  event.isNew && "bg-white/80"
                )}
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <span className="w-[74px] shrink-0 text-[12px] leading-tight text-(--tl-ink-2)">
                  {copy.days[event.day]} {copy.dates[event.day]}
                  <br />
                  {event.time}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-(--tl-ink)">
                    {event.title}
                  </span>
                  <span className="block truncate text-[12.5px] text-(--tl-ink-2)">
                    {event.meta}
                  </span>
                </span>
                {event.isNew ? (
                  <motion.span
                    className="shrink-0 rounded-full bg-[#1d1d1f] px-2 py-0.5 text-[10.5px] font-medium text-white"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 500,
                      damping: 22,
                      delay: 0.25,
                    }}
                  >
                    {copy.added}
                  </motion.span>
                ) : null}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence>
        {step >= 4 && step < 6 ? (
          <motion.div
            className={cn(tw.glassStrong, "p-4")}
            initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            <div className="text-[17px] font-light leading-[1.35] tracking-[-0.2px] text-(--tl-ink)">
              {copy.nudge.title}
            </div>
            <div className="mt-1 text-[13px] text-(--tl-ink-2)">
              {copy.nudge.body}
            </div>
            <div className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-(--tl-ink)">
              {copy.nudge.action}
              <ArrowRight className="size-3.5 text-(--tl-ink-3)" />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---------------- 5. Direct connection ---------------- */

function DirectVisual({ copy }: { copy: FeaturesCopy["direct"]["visual"] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 0 요청 · 1 Harper가 이야기하는 중 · 2 이야기 마침 · 3 오퍼 도착 · 4 머무름 · 5 정리
  const step = useSceneTimeline(ref, [900, 1600, 800, 900, 3200, 500]);
  const talking = step === 1;
  const done = step >= 3 ? 2 : step >= 2 ? 1 : 0;
  const offered = step >= 3 && step < 5;
  const fade = step === 5;

  return (
    <motion.div
      ref={ref}
      className="flex w-full max-w-[480px] flex-col items-center"
      animate={{ opacity: fade ? 0 : 1 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <div className={cn(tw.glass, "w-full p-5")}>
        <div className="text-[12px] font-medium text-(--tl-ink-2)">
          {copy.request}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="relative size-11 overflow-hidden rounded-[12px] bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)]">
            <Image
              src="/images/logos/wonderful.jpg"
              alt=""
              fill
              sizes="88px"
              className="object-contain"
            />
          </span>
          <span className="min-w-0">
            <span className="block text-[16px] font-semibold tracking-[-0.01em] text-(--tl-ink)">
              {copy.company}
            </span>
            <span className="block text-[12.5px] text-(--tl-ink-2)">
              {copy.companyMeta}
            </span>
          </span>
        </div>
        <div className="mt-3 text-[18px] font-light tracking-[-0.3px] text-(--tl-ink)">
          {copy.role}
        </div>
      </div>

      <div className="relative flex h-[92px] w-full items-center justify-center">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 92"
          preserveAspectRatio="none"
        >
          <motion.line
            x1="50"
            x2="50"
            y1="0"
            y2="92"
            stroke="rgb(29 29 31 / 0.35)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="4 4"
            initial={false}
            animate={{
              pathLength: step >= 1 ? 1 : 0,
              opacity: step >= 1 ? 1 : 0,
            }}
            transition={{ duration: 0.8, ease: EASE }}
          />
        </svg>
        <motion.span
          className="relative z-10 flex size-11 items-center justify-center rounded-full bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.1),0_10px_24px_-10px_rgb(20_30_45/0.45)]"
          initial={false}
          animate={{ scale: step >= 1 ? 1 : 0.6, opacity: step >= 1 ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 20 }}
        >
          <HarperMark className="size-11 shadow-none" />
        </motion.span>
        <AnimatePresence>
          {talking ? (
            <motion.span
              className={cn(
                tw.statusLine,
                "absolute left-[calc(50%+34px)] top-1/2 -translate-y-1/2 whitespace-nowrap text-[12.5px]"
              )}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <span className={tw.shimmerText}>{copy.talking}</span>
              <WorkingDots />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className={cn(tw.glass, "w-full p-5")}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="relative size-11 overflow-hidden rounded-full bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)]">
              <Image
                src="/images/notionface.png"
                alt=""
                fill
                sizes="88px"
                className="scale-[1.35] object-cover"
              />
            </span>
            <span>
              <span className="block text-[16px] font-semibold tracking-[-0.01em] text-(--tl-ink)">
                {copy.you}
              </span>
              <span className="block text-[12.5px] text-(--tl-ink-2)">
                {copy.youMeta}
              </span>
            </span>
          </div>
          <span className="rounded-full bg-[#1d1d1f]/[0.05] px-2.5 py-1 text-[11.5px] text-(--tl-ink-2)">
            {copy.resting}
          </span>
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-1.5">
          {copy.steps.map((label, index) => {
            const isDone = index < done;
            const isNext = index === 2 && offered;
            return (
              <li key={label} className="flex flex-col gap-2">
                <span className="relative h-1 overflow-hidden rounded-full bg-[#1d1d1f]/[0.08]">
                  <motion.span
                    className="absolute inset-y-0 left-0 rounded-full bg-[#1d1d1f]"
                    initial={false}
                    animate={{ width: isDone ? "100%" : "0%" }}
                    transition={{ duration: 0.6, ease: EASE }}
                  />
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-[12.5px] transition-colors duration-300",
                    isDone || isNext ? "text-(--tl-ink)" : "text-(--tl-ink-3)"
                  )}
                >
                  {isDone ? (
                    <Check className="size-3" strokeWidth={2.6} />
                  ) : null}
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-[52px]">
          <AnimatePresence>
            {offered ? (
              <motion.div
                className="flex h-full items-center justify-between gap-3 rounded-[12px] bg-white px-3.5 shadow-[0_0_0_0.5px_rgb(20_30_45/0.08),0_8px_20px_-12px_rgb(20_30_45/0.35)]"
                initial={{ opacity: 0, y: 8, scale: 0.98, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <span className="text-[14px] text-(--tl-ink)">
                  {copy.offer}
                </span>
                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-(--tl-ink)">
                  {copy.decide}
                  <ArrowRight className="size-3.5 text-(--tl-ink-3)" />
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
