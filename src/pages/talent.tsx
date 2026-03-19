import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  CalendarDays,
  ArrowRight,
  ArrowDown,
} from "lucide-react";
import { useRouter } from "next/router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/common/AppHeader";
import Footer from "@/components/landing/Footer";
import CandidateSocialProof from "@/components/talent/CandidateSocialProof";
import FeaturedCompanyModal from "@/components/talent/FeaturedCompanyModal";
import FakeSticky from "@/components/talent/FakeSticky";
import TalentIdentifierModal from "@/components/talent/TalentIdentifierModal";
import {
  FEATURED_COMPANY_BY_ID,
  type FeaturedCompanyKey,
} from "@/components/talent/featuredCompanies";
import { useAuthStore } from "@/store/useAuthStore";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TIME_SLOTS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
];

const PROCESS_STEPS = [
  {
    title: "가벼운 대화로 시작",
    details: [
      "Harper와 몇 분 정도 대화하며",
      "지금까지의 경험과 원하는 다음 커리어를 알려주세요.",
      "당장 이직 생각이 없는 경우에도 등록해둘 수 있습니다.",
    ],
  },
  {
    title: "바뀌면 언제든 업데이트",
    details: [
      "이직 생각이 생기거나 원하는 조건이 바뀌면",
      "언제든 Harper에게 알려주세요.",
    ],
  },
  {
    title: "적절한 기회만 전달",
    details: [
      "조건이 맞는 회사가 나타나면",
      "JD와 역할 정보를 먼저 전달드립니다.",
      "좋아요 / 관심없음 피드백으로 추천이 점점 정확해집니다.",
    ],
  },
  {
    title: "하퍼가 대신 추천",
    details: [
      "좋은 기회라고 판단되면",
      "Harper가 회원님의 강점과 맥락을 정리해",
      "대신 회사를 설득하고 대화를 시작합니다.",
      "개인정보에 민감하신 경우 제한된 경우에만 프로필이 공개되도록 설정할 수 있습니다.",
    ],
  },
  {
    title: "제안을 받은 뒤 결정하세요",
    details: [
      "회사가 Offer 혹은 제안을 보냅니다.",
      "조건이 마음에 들면 연결을 도와드리고, 궁금한 내용은 하퍼가 중간에서 조율해 드립니다.",
    ],
  },
];

const BENEFITS = [
  {
    title: "1. 공개되지 않은 기회까지 탐색",
    description:
      "정말 좋은 채용 기회는 채용 공고로 공개되지 않습니다.<br /><br />미국 비자 지원이 가능한 글로벌 테크 회사, <br />국내 딥테크 팀, <br />높은 연봉의 Remote 팀 <br />등 일반 채용 시장에 공개되지 않은 기회를 먼저 전달합니다.",
  },
  {
    title: "2. 다양한 기회를 찾아드립니다",
    description:
      "해외로의 이직을 원하신다면 도와드리고,<br />이직 생각이 없으시다면 남는 시간을 활용 가능한<br />파트타임, 커피챗, 시간당 30만원의 콜 등<br />다른 기회도 찾아드립니다.",
  },
  // {
  //   title: "2. 직접 찾지 않아도 됩니다",
  //   description:
  //     "회원님이 직접 회사와 포지션을 계속 찾지 않아도 됩니다.<br />Harper가 조건에 맞는 기회를, 받은 뒤 선택만 하시면 되도록 전달할게요.<br /><br />일단 등록 후, 언제든지 매칭을 중지해둘 수 있습니다.",
  // },
  {
    title: "3. 직접 지원보다 더 높은 채용 확률",
    description:
      "단순 지원자가 아니라<br />추천 후보자로 소개되기 때문에<br /><br />더 좋은 조건에서<br />채용 프로세스를 시작할 가능성이 높습니다.<br/><br/>원하시는 조건에 맞추기 위해 중간에서 조율까지 해드려요.",
  },
];

const FAQ_ITEMS = [
  {
    question: "헤드헌팅과 어떤게 다른가요?",
    answer:
      "아마 헤드헌터로부터 관심없는 이직 제안, 회사에 대한 정보를 알려주지 않은 채로 커피챗 제안, 제안 수락 후 회사로부터 거절 통보 등의 경험을 해보셨을겁니다. 하퍼는 제안을 수락했지만 회사가 거절했다는 연락을 받을 일이 없습니다.",
  },
  {
    question: "매칭은 얼마나 자주 이루어지나요?",
    answer:
      "회원님의 정보와 회사들의 요구사항이 맞는 경우에만 매칭이 이루어집니다. 특정 시기에 집중될 수도 있고, 몇 주간 없을 수도 있습니다. 하퍼는 많은 기회를 무작위로 보내기보다 실제 가능성이 높은 기회만 전달합니다.",
  },
  {
    question: "제 정보가 어떤 회사에게 공개되나요?",
    answer:
      "알려주신 정보들은 회원님의 동의 없이 회사에 공개되지 않습니다. 매칭된 기회를 확인한 뒤 “좋아요”를 선택한 경우에만 회사가 프로필을 볼 수 있습니다.",
  },
];

const COMPARISON_ROWS = [
  {
    item: "숨은 포지션 접근",
    harper: "높음",
    agency: "중간",
    selfApply: "낮음",
  },
  {
    item: "요구사항 기반 맞춤 매칭",
    harper: "높음",
    agency: "중간",
    selfApply: "낮음",
  },
  {
    item: "후보자 강점 대리 설득",
    harper: "가능",
    agency: "케이스별 상이",
    selfApply: "직접 수행",
  },
  {
    item: "프로필 공개 제어",
    harper: "후보자 선택 중심",
    agency: "케이스별 상이",
    selfApply: "직접 제어",
  },
  {
    item: "조건 협의 지원",
    harper: "중간 조율 가능",
    agency: "가능",
    selfApply: "직접 수행",
  },
  { item: "시간 소모", harper: "낮음", agency: "중간", selfApply: "높음" },
];

const getMonthGrid = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  const cells: Array<Date | null> = Array.from(
    { length: startOffset },
    () => null
  );

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const CompanyInlineTrigger = ({
  companyId,
  onOpen,
}: {
  companyId: FeaturedCompanyKey;
  onOpen: (companyId: FeaturedCompanyKey) => void;
}) => {
  const company = FEATURED_COMPANY_BY_ID[companyId];

  return (
    <button
      type="button"
      onClick={() => onOpen(companyId)}
      className="atag inline-flex items-center bg-transparent p-0 font-medium"
      aria-haspopup="dialog"
    >
      {company.triggerLabel}
    </button>
  );
};

const Talent = () => {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthStore();

  const [monthCursor, setMonthCursor] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTime, setSelectedTime] = useState(TIME_SLOTS[2]);
  const [activeCompanyId, setActiveCompanyId] =
    useState<FeaturedCompanyKey | null>(null);
  const [isIdentifierModalOpen, setIsIdentifierModalOpen] = useState(false);
  const [showMoreButton, setShowMoreButton] = useState(true);
  const [isMoreButtonFading, setIsMoreButtonFading] = useState(false);
  const hideMoreButtonTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const syncMoreButton = () => {
      const isAtTop = window.scrollY <= 2;
      if (isAtTop) {
        setShowMoreButton(true);
        return;
      }
      if (!isMoreButtonFading) {
        setShowMoreButton(false);
      }
    };

    syncMoreButton();
    window.addEventListener("scroll", syncMoreButton, { passive: true });
    return () => {
      window.removeEventListener("scroll", syncMoreButton);
    };
  }, [isMoreButtonFading]);

  useEffect(() => {
    return () => {
      if (hideMoreButtonTimerRef.current !== null) {
        window.clearTimeout(hideMoreButtonTimerRef.current);
      }
    };
  }, []);

  const monthGrid = useMemo(() => getMonthGrid(monthCursor), [monthCursor]);

  const monthLabel = useMemo(
    () =>
      monthCursor.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
      }),
    [monthCursor]
  );

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return "날짜를 선택해주세요.";
    return selectedDate.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  }, [selectedDate]);

  const activeCompany = activeCompanyId
    ? FEATURED_COMPANY_BY_ID[activeCompanyId]
    : null;

  const handleCallBooking = () => {
    if (!selectedDate) return;
    router.push({
      pathname: "/call",
      query: {
        date: formatLocalDate(selectedDate),
        time: selectedTime,
      },
    });
  };

  const handleOpenCompany = (companyId: FeaturedCompanyKey) => {
    setActiveCompanyId(companyId);
  };

  const handleCloseCompany = () => {
    setActiveCompanyId(null);
  };

  const handleStartConversation = () => {
    if (authLoading) return;

    if (user) {
      void router.push("/career");
      return;
    }

    setIsIdentifierModalOpen(true);
  };

  const handleShowMore = () => {
    if (isMoreButtonFading) return;

    setIsMoreButtonFading(true);

    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: Math.round(window.innerHeight * 0.9),
        behavior: "smooth",
      });
    });

    if (hideMoreButtonTimerRef.current !== null) {
      window.clearTimeout(hideMoreButtonTimerRef.current);
    }

    hideMoreButtonTimerRef.current = window.setTimeout(() => {
      setShowMoreButton(false);
      setIsMoreButtonFading(false);
    }, 260);
  };

  // Flat dashboard tokens (minimal borders, minimal radius)
  const kicker = "text-xs font-medium text-beige900/70";
  const title = "mt-1 text-lg font-medium text-hblack1000";
  const body = "text-base leading-relaxed text-hblack600";
  const divider = "border-t border-hblack200/70";
  const subtleDivider = "border-t border-hblack200/50";

  const Head = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => {
    return (
      <div
        className={`text-3xl/[1.2] font-halant font-semibold tracking-[-0.05em] text-hblack1000 lg:text-4xl/[1.3] ${className ?? ""}`}
      >
        {children}
      </div>
    );
  };

  return (
    <main
      className="min-h-screen bg-hblack000 text-hblack900 font-geist pt-12"
      style={
        {
          "--ink": "#2E1706",
          "--paper": "#FDF6EE",
          "--gold": "#593918",
        } as React.CSSProperties
      }
    >
      <div className="fixed z-20 top-0 left-0 w-full h-10 flex items-center justify-center text-[13px] font-normal bg-beige500 text-beige900">
        현재 Open beta로, 선착순 50명의 분들만 받아 최적의 기회를 찾아드리고
        있습니다. ~ 3/20
      </div>
      <AppHeader topClassName="top-8" />
      <div className="mx-auto max-w-[1440px] px-4 py-4 lg:px-8 lg:py-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
          <section className="lg:col-span-8">
            <div className="flex flex-col gap-5">
              <div className="mt-4 max-w-[80ch] font-halant">
                {/* 회원님은 일에만 집중하세요. 커리어의 다음 기회는 Harper가 찾겠습니다.
커리어에도 매니지먼트가 필요합니다.
좋은 커리어 기회는 직접 찾지 않아도 됩니다.
회원님에게 맞는 기회를 Harper가 먼저 찾습니다. */}
                <Head>
                  AI/ML 인재들이
                  <br />
                  다음 커리어를 시작하는 곳
                </Head>
                <Head className="mt-8">
                  Harper가 대신해서
                  <br />
                  최고의 기회를
                  <br />
                  찾아드립니다.
                  <br />
                  <br />
                  그리고 직접 채용 담당자에게
                  <br />
                  회원님을 추천/연결합니다.
                </Head>
                <div className="mt-8 flex flex-wrap items-center gap-x-1 gap-y-1 text-base">
                  이미
                  <CompanyInlineTrigger
                    companyId="toss"
                    onOpen={handleOpenCompany}
                  />
                  ,
                  <CompanyInlineTrigger
                    companyId="karrot"
                    onOpen={handleOpenCompany}
                  />
                  ,
                  <CompanyInlineTrigger
                    companyId="rebellions"
                    onOpen={handleOpenCompany}
                  />
                  ,
                  <CompanyInlineTrigger
                    companyId="wonderful"
                    onOpen={handleOpenCompany}
                  />
                  ,<span className="atag">YC backed 스타트업</span> 등
                </div>
                <div className="mt-0.5">
                  국내외 테크 회사들이 Harper를 통해 인재를 찾고 있습니다.
                </div>
                <div className={`mt-3 space-y-1 ${body}`}></div>
              </div>

              <div className="flex flex-col mt-4">
                <button
                  className="btn-ink rounded-md w-fit font-geist tracking-[-0.02em]"
                  onClick={handleStartConversation}
                >
                  <span className="font-medium">대화 시작하기</span>
                  <span className="arrow">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </button>

                <CandidateSocialProof />
              </div>
            </div>

            <div className={`my-8 ${divider}`} />

            {/* Benefits (flat 2-col rows / minimal separators) */}
            <div className="py-2">
              <div className="text-lg font-medium mb-8">
                모든 뛰어난 스포츠 선수에게는 전담 에이전트가 있듯이, <br />
                AI/ML 인재에게는 Harper가 있습니다.
              </div>
              <p className={kicker}>Why Harper?</p>
              <h2 className={title}>하퍼의 장점</h2>

              <div className="mt-2 divide-y divide-hblack200/70 lg:max-w-[50%]">
                {BENEFITS.map((b) => (
                  <div key={b.title} className="py-4">
                    <p className="text-lg font-medium text-hblack1000">
                      {b.title}
                    </p>
                    <p
                      className="mt-2 text-sm leading-relaxed text-hblack600"
                      dangerouslySetInnerHTML={{ __html: b.description }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* <div className={`my-8 ${divider}`} />

            <div className="py-2">
              <p className={kicker}>Overview</p>
              <h2 className={title}>하퍼는 어떤걸 해주나요?</h2>
              <div className={`mt-2 space-y-1 ${body}`}>
                <p>
                  회원님의 역량을 최대한 발휘할 수 있는 좋은 커리어 기회들을{" "}
                  <br />
                  1) 대신 찾고 2) 회원님에게 알려주고 3) 하퍼가 대신해서
                  회원님을 회사에 추천합니다.
                </p>
                <p>
                  풀타임, 리모트, 파트타임, 인턴 등 다양한 형태의 커리어 기회를
                  <br />
                  제안부터 받고, 그 다음 선택하세요.
                </p>
              </div>
            </div> */}

            <div className={`my-8 ${divider}`} />

            {/* Process (list + dividers, not cards) */}
            <div className="py-2">
              <p className={kicker}>Process</p>
              <h2 className={title}>하퍼는 이렇게 진행됩니다</h2>

              <div className="mt-2 divide-y divide-hblack200/70">
                {PROCESS_STEPS.map((step, idx) => (
                  <div key={step.title} className="py-4">
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-md bg-beige500/60 py-1 text-base font-bold text-beige900">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-md font-medium text-hblack1000">
                          {step.title}
                        </p>
                        <div className="mt-1 text-sm leading-relaxed text-hblack600">
                          {step.details.map((d) => (
                            <p key={d}>{d}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`my-8 ${divider}`} />

            {/* Comparison (flat table style with grid + dividers) */}
            {/* <div className="py-2">
              <p className={kicker}>Comparison</p>
              <h2 className={title}>Harper vs Agency vs 직접 지원</h2>

              <div className="mt-5">
                <div className="grid grid-cols-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-hblack500">
                  <div>비교 항목</div>
                  <div>Harper</div>
                  <div>Agency</div>
                  <div>직접 지원</div>
                </div>
                <div className={subtleDivider} />
                <div className="divide-y divide-hblack200/70">
                  {COMPARISON_ROWS.map((row) => (
                    <div
                      key={row.item}
                      className="grid grid-cols-4 py-4 text-sm text-hblack700"
                    >
                      <div className="font-medium text-hblack900">
                        {row.item}
                      </div>
                      <div>{row.harper}</div>
                      <div>{row.agency}</div>
                      <div>{row.selfApply}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div> */}

            {/* FAQ (flat list) */}
            <div className="py-2">
              <p className={kicker}>FAQ</p>
              <h2 className={title}>자주 묻는 질문</h2>

              <div className="mt-5 divide-y divide-hblack200/70">
                {FAQ_ITEMS.map((faq) => (
                  <div key={faq.question} className="py-5">
                    <p className="text-sm font-medium text-hblack1000">
                      {faq.question}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-hblack600">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className={`mt-10 ${divider}`} />
          </section>

          {/* Right: panel (flat, like reference detail panel) */}
          <div className="w-full lg:col-span-4 lg:self-stretch">
            <FakeSticky top={54} className="hidden lg:block lg:h-full">
              <div className="rounded-lg border border-hblack100 shadow-md px-5 py-5">
                <button
                  type="button"
                  onClick={handleStartConversation}
                  className="group inline-flex h-12 w-full items-center justify-center gap-1 rounded-sm bg-beige900 text-sm font-medium text-hblack000 hover:opacity-90"
                >
                  지금 대화하기{" "}
                  <ArrowRight className="group-hover:translate-x-1 transition-all duration-300 h-4 w-4" />
                </button>
                <div className={`mt-4 ${divider}`} />
                <h3 className="mt-4 text-sm font-medium text-hblack400">
                  혹은 일정 선택
                </h3>

                {/* Calendar controls */}
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center bg-hblack000 hover:bg-hblack100"
                      onClick={() =>
                        setMonthCursor(
                          new Date(
                            monthCursor.getFullYear(),
                            monthCursor.getMonth() - 1,
                            1
                          )
                        )
                      }
                      aria-label="이전 달"
                    >
                      <ChevronLeft className="h-4 w-4 text-hblack700" />
                    </button>

                    <p className="text-sm font-medium text-hblack900">
                      {monthLabel}
                    </p>

                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center bg-hblack000 hover:bg-hblack100"
                      onClick={() =>
                        setMonthCursor(
                          new Date(
                            monthCursor.getFullYear(),
                            monthCursor.getMonth() + 1,
                            1
                          )
                        )
                      }
                      aria-label="다음 달"
                    >
                      <ChevronRight className="h-4 w-4 text-hblack700" />
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-medium text-hblack500">
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="py-2">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7">
                    {monthGrid.map((cell, index) => {
                      if (!cell)
                        return <div key={`empty-${index}`} className="h-10" />;

                      const isSelected = selectedDate
                        ? sameDay(cell, selectedDate)
                        : false;

                      return (
                        <button
                          key={cell.toISOString()}
                          type="button"
                          onClick={() => setSelectedDate(cell)}
                          className={[
                            "h-8 text-sm font-medium",
                            isSelected
                              ? "bg-beige900/10 text-beige900"
                              : "bg-transparent text-hblack700 hover:bg-hblack100",
                          ].join(" ")}
                        >
                          {cell.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={`mt-4 ${divider}`} />

                {/* Time picker */}
                <div className="mt-4">
                  <p className="text-sm font-medium text-hblack900">
                    {selectedDateLabel}요일
                  </p>
                  <div className="mt-2 flex items-center gap-2 border border-hblack100 rounded-md px-3">
                    <Clock3 className="h-4 w-4 text-hblack500" />
                    <select
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="h-11 w-full bg-transparent text-sm text-hblack900 outline-none"
                    >
                      {TIME_SLOTS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <button
                    type="button"
                    onClick={handleCallBooking}
                    className="rounded-sm inline-flex h-10 w-full items-center justify-center gap-2 bg-hblack100/50 text-sm font-medium text-hblack900 hover:bg-hblack100"
                  >
                    Call 예약 <CalendarDays className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </FakeSticky>
          </div>
        </div>
      </div>
      <div className="h-[30vh]" />
      <Footer />
      {showMoreButton && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
          <button
            type="button"
            onClick={handleShowMore}
            className={[
              "pointer-events-auto inline-flex items-center justify-center rounded-full flex-row gap-2",
              "bg-hblack50 cursor-pointer hover:bg-hblack100 px-5 py-1.5 text-sm font-medium text-hblack900 shadow-md backdrop-blur",
              "transition-all duration-300",
              isMoreButtonFading
                ? "translate-y-2 opacity-0"
                : "translate-y-0 opacity-100",
            ].join(" ")}
          >
            더보기
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <FeaturedCompanyModal
        open={Boolean(activeCompany)}
        company={activeCompany}
        onClose={handleCloseCompany}
        onStartConversation={handleStartConversation}
      />
      <TalentIdentifierModal
        open={isIdentifierModalOpen}
        onClose={() => setIsIdentifierModalOpen(false)}
      />
    </main>
  );
};

export default Talent;
