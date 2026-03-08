import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";
import AppHeader from "@/components/common/AppHeader";

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
    title: "간단한 정보 등록",
    details: [
      "LinkedIn, Resume 등 회원님의 기본 정보를 알려주세요.",
      "추가로 현재 원하는 게 무엇인지 자유롭게 등록하세요.",
    ],
  },
  {
    title: "상황이 바뀔 때마다 대화",
    details: [
      "원하는 역할, 근무 조건, 우선순위가 달라지면 언제든지 접속해 하퍼와 대화하세요.",
      "입력 정보는 계속 업데이트되어 다음 매칭 품질에 반영됩니다.",
    ],
  },
  {
    title: "요구사항이 맞는 회사와 매칭",
    details: [
      "하퍼를 이용하는 회사들의 조건이 회원님의 요구사항과 적합하면 매칭이 이루어집니다.",
      "회사 소개와 JD/Role 정보를 전달드리고, “좋아요-모르겠어요-싫어요” 피드백으로 매칭이 최적화됩니다.",
    ],
  },
  {
    title: "하퍼가 후보자를 대신 추천",
    details: [
      "좋은 기회라고 판단되면 하퍼가 회원님을 대신해 회사에 적합성을 설득합니다.",
      "개인정보에 민감하신 경우 “좋아요”를 누른 기회에만 프로필 공개되도록 설정할 수 있습니다.",
    ],
  },
  {
    title: "회사 제안 수신 및 조율",
    details: [
      "회사가 Offer 혹은 제안을 보냅니다.",
      "조건이 마음에 들면 연결을 도와드리고, 궁금한 내용은 하퍼가 중간에서 조율해 드립니다.",
    ],
  },
];

const BENEFITS = [
  {
    title: "숨겨진 기회 탐색",
    description:
      "좋은 채용 기회의 상당수는 채용 공고로 공개되지 않습니다.<br />또한 채용 공고의 내용은 대부분 무의미합니다.<br /><br />미국 비자 지원이 가능한 글로벌 테크 회사, <br />국내 딥테크 팀, <br />Remote 팀 <br />등 일반 채용 시장에 공개되지 않은 기회를 먼저 전달합니다.",
  },

  {
    title: "부담 없이 시작, 언제든 중지",
    description:
      "요구사항만 남겨두면 조건에 맞는 기회를 계속 찾아드립니다. 바쁜 시기에는 중지했다가 다시 시작할 수 있습니다.",
  },
  {
    title: "더 좋은 조건에서 시작",
    description:
      "단순 지원자가 아니라<br />추천 후보자로 소개되기 때문에<br /><br />일반 지원보다 더 좋은 조건에서<br />대화를 시작할 가능성이 높습니다.",
  },
];

const FAQ_ITEMS = [
  {
    question: "매칭은 얼마나 자주 이루어지나요?",
    answer:
      "회원님의 정보와 회사들의 요구사항이 맞는 경우에만 매칭이 이루어집니다. 특정 시기에 집중될 수도 있고, 몇 주간 없을 수도 있습니다. 하퍼는 많은 기회를 무작위로 보내기보다 실제 가능성이 높은 기회만 전달합니다.",
  },
  {
    question: "제 정보가 회사에게 공개되나요?",
    answer:
      "회원님의 동의 없이 회사에 개인 정보가 공개되지 않습니다. 매칭된 기회를 확인한 뒤 “좋아요”를 선택한 경우에만 회사가 프로필을 볼 수 있습니다.",
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

const Talent = () => {
  const router = useRouter();

  const [monthCursor, setMonthCursor] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTime, setSelectedTime] = useState(TIME_SLOTS[2]);

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

  // Flat dashboard tokens (minimal borders, minimal radius)
  const kicker = "text-xs font-medium text-xprimary";
  const title = "mt-1 text-lg font-medium text-hblack1000";
  const body = "text-sm leading-relaxed text-hblack600";
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
        className={`text-4xl font-bold text-hblack1000 lg:text-5xl leading-relaxed ${className}`}
      >
        {children}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-hblack000 text-hblack900 font-inter pt-10">
      <div className="fixed z-20 top-0 left-0 w-full h-8 flex items-center justify-center text-[13px] font-normal bg-xprimary text-hblack000">
        현재 Open beta로, 선착순으로 50명의 분들만 받아서 최적의 기회를
        찾아드리고 있습니다. ~ 3/20
      </div>
      <AppHeader topClassName="top-8" />
      <div className="mx-auto max-w-[1440px] px-4 py-4 lg:px-8 lg:py-6">
        <header className="mb-2" />

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <section className="lg:col-span-8">
            <div className="flex flex-col gap-5">
              <div className="max-w-[80ch]">
                <Head>당신만을 위한 커리어 매니저</Head>
                <Head className="mt-8">
                  가만히 있어도
                  <br />
                  회원님의 역량에 맞는 좋은 회사와 Role을 찾아드립니다.
                  <br />
                  <br />
                  그리고 좋은 기회라고 판단되면
                  <br />
                  Harper가 회사에게 회원님을 대신 추천합니다.
                </Head>
                <div className="mt-8 text-xl">
                  지금 토스, 당근, YC 스타트업, 리벨리온 등에서 Harper를 통해
                  인재를 찾고 있습니다.
                </div>
                <div className={`mt-3 space-y-1 ${body}`}></div>
              </div>

              <div className="mt-4">
                <button className="btn-ink">
                  <span className="font-medium">바로 시작하기</span>
                  <span className="arrow">→</span>
                </button>
              </div>
            </div>

            <div className={`mt-8 ${divider}`} />
            <div className="py-2">
              <p className={kicker}>Overview</p>
              <h2 className={title}>하퍼는 어떻게 도움을 주나요?</h2>
              <div className={`mt-2 space-y-1 ${body}`}>
                <p>
                  회원님의 역량을 최대한 발휘할 수 있는 좋은 커리어 기회들을 1)
                  대신 찾고, 2) 연결해주고, 3) 하퍼가 대신해서 회원님을 회사에
                  추천해줍니다.
                </p>
                <p>특히 현재는</p>
                <p>
                  풀타임, 리모트, 파트타임, 인턴 등 다양한 형태의 커리어 기회를
                  제안받고 선택하세요.
                </p>
              </div>
            </div>

            <div className={`my-8 ${divider}`} />

            {/* Process (list + dividers, not cards) */}
            <div className="py-2">
              <p className={kicker}>Process</p>
              <h2 className={title}>하퍼는 이렇게 진행됩니다</h2>

              <div className="mt-5 divide-y divide-hblack200/70">
                {PROCESS_STEPS.map((step, idx) => (
                  <div key={step.title} className="py-3">
                    <div className="flex items-start gap-4">
                      <div className="w-4 shrink-0 text-lg font-bold text-xprimary">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-md font-medium text-hblack1000">
                          {step.title}
                        </p>
                        <div className="mt-2 text-sm leading-relaxed text-hblack600">
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

            {/* Benefits (flat 2-col rows / minimal separators) */}
            <div className="py-2">
              <p className={kicker}>Benefits</p>
              <h2 className={title}>하퍼의 장점</h2>

              <div className="mt-2 divide-y divide-hblack200/70">
                {BENEFITS.map((b) => (
                  <div key={b.title} className="py-4">
                    <p className="text-sm font-medium text-hblack1000">
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

            <div className={`my-8 ${divider}`} />

            {/* Comparison (flat table style with grid + dividers) */}
            <div className="py-2">
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
            </div>

            <div className={`my-8 ${divider}`} />

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
          <aside className="relative lg:top-0">
            <div className="lg:col-span-4 fixed">
              <div className="rounded-lg border border-hblack100 px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={kicker}>Schedule</p>
                    <h3 className="mt-1 text-md font-medium text-hblack1000">
                      상담 일정 선택
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-hblack600">
                      날짜/시간을 고르고 바로 예약하거나 온보딩을 시작하세요.
                    </p>
                  </div>
                  <Clock3 className="mt-1 h-5 w-5 text-hblack500" />
                </div>

                <div className={`mt-4 ${divider}`} />

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
                              ? "bg-xprimary/10 text-xprimary"
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
                    {selectedDateLabel}
                  </p>
                  <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-hblack500">
                    Time
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

                  <div className="mt-2 bg-hblack000 px-0 py-3 text-sm text-hblack700">
                    <span className="font-medium text-hblack900">
                      예약 예정
                    </span>
                    <div className="mt-1">
                      {selectedDateLabel} {selectedDate ? selectedTime : ""}
                    </div>
                  </div>
                </div>

                <div className={`mt-2 ${divider}`} />

                {/* Actions (flat buttons) */}
                <div className="mt-6 space-y-2">
                  <button
                    type="button"
                    onClick={handleCallBooking}
                    className="rounded-sm inline-flex h-11 w-full items-center justify-center gap-2 bg-hblack100 text-sm font-medium text-hblack900 hover:bg-hblack100"
                  >
                    Call 예약 <CalendarDays className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => router.push("/career")}
                    className="rounded-sm inline-flex h-11 w-full items-center justify-center gap-2 bg-xprimary text-sm font-medium text-hblack000 hover:opacity-90"
                  >
                    지금 대화하기 <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default Talent;
