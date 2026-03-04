import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/router";
import React, { useMemo, useState } from "react";

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
    title: "정보 등록",
    details: [
      "어떠한 요구사항, 이야기든 자유롭게 등록하세요.",
      "지금 기준이 완벽하지 않아도 됩니다. 하퍼가 함께 정리합니다.",
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
      "회사가 특정 직군 Offer 혹은 시간당 단가 형태로 제안을 보냅니다.",
      "조건이 마음에 들면 연결을 도와드리고, 궁금한 내용은 하퍼가 중간에서 조율합니다.",
    ],
  },
];

const BENEFITS = [
  {
    title: "숨겨진 최고의 기회 접근",
    description:
      "비자 지원 가능한 글로벌 테크 회사, 국내 딥테크 팀 등 일반 채용 시장에 공개되지 않은 기회를 먼저 전달합니다.",
  },
  {
    title: "부담 없이 시작, 언제든 중지",
    description:
      "요구사항만 남겨두면 조건에 맞는 기회를 계속 찾아드립니다. 바쁜 시기에는 중지했다가 다시 시작할 수 있습니다.",
  },
  {
    title: "직접 지원 대비 유리한 출발",
    description:
      "하퍼가 후보자의 강점을 맥락 있게 전달해 더 나은 조건에서 대화를 시작할 가능성을 높입니다.",
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
  {
    item: "시간 소모",
    harper: "낮음",
    agency: "중간",
    selfApply: "높음",
  },
];

const getMonthGrid = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  const cells: Array<Date | null> = Array.from({ length: startOffset }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const cardBase = "rounded-2xl border border-hblack200 bg-hblack000";

const Talent = () => {
  const router = useRouter();
  const [monthCursor, setMonthCursor] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [selectedTime, setSelectedTime] = useState(TIME_SLOTS[2]);

  const monthGrid = useMemo(() => getMonthGrid(monthCursor), [monthCursor]);
  const monthLabel = useMemo(
    () => monthCursor.toLocaleDateString("ko-KR", { year: "numeric", month: "long" }),
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
        date: selectedDate.toISOString().slice(0, 10),
        time: selectedTime,
      },
    });
  };

  return (
    <main className="relative min-h-screen bg-hblack000 text-hblack900 font-inter">
      <div className="pointer-events-none absolute inset-0">
        <div className="mx-auto h-full max-w-[1440px] border-l border-r border-hblack200/70" />
      </div>

      <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-10 lg:px-8 lg:py-10">
        <section className="space-y-8 lg:col-span-7">
          <div className={`${cardBase} p-8 lg:p-10`}>
            <div className="inline-flex rounded-xl border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-xs font-medium uppercase tracking-[0.08em] text-xprimary">
              Harper Talent Agent
            </div>

            <h1 className="mt-6 text-[32px] font-medium leading-[1.25] text-hblack1000 lg:text-[36px]">
              Harper(하퍼): 당신을 위한 Talent Agent 입니다.
            </h1>

            <div className="mt-6 space-y-4 text-base leading-relaxed text-hblack600">
              <p>
                현재 국내/글로벌 테크 스타트업, AI/ML, Engineering 팀들이 하퍼에서
                인재를 찾고 있습니다.
              </p>
              <p>
                회원님의 역량을 최대한 발휘할 수 있는 좋은 커리어 기회들을 1) 대신
                찾고, 2) 연결해주고, 3) 하퍼가 대신해서 회원님을 회사에 추천해줍니다.
              </p>
              <p>
                풀타임, 리모트, 파트타임, 인턴 등 국내/글로벌 테크 스타트업으로부터
                커리어 기회를 먼저 제안 받고 선택하세요.
              </p>
            </div>
          </div>

          <div className={`${cardBase} p-8`}>
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.08em] text-hblack500">Process</p>
              <h2 className="mt-2 text-2xl font-medium text-hblack1000">하퍼가 진행되는 방식</h2>
            </div>

            <div className="space-y-4">
              {PROCESS_STEPS.map((step, idx) => (
                <article
                  key={step.title}
                  className={[
                    "rounded-xl border p-6 transition-colors",
                    idx === 0
                      ? "border-xprimary/30 bg-xprimary/5"
                      : "border-hblack200 bg-hblack000 hover:bg-hblack100",
                  ].join(" ")}
                >
                  <h3 className="flex items-center gap-3 text-lg font-medium text-hblack900">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-xprimary/30 bg-xprimary/10 text-xs font-medium text-xprimary">
                      {idx + 1}
                    </span>
                    {step.title}
                  </h3>
                  <div className="mt-4 space-y-2 text-sm leading-relaxed text-hblack600">
                    {step.details.map((detail) => (
                      <p key={detail}>{detail}</p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className={`${cardBase} p-8`}>
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.08em] text-hblack500">Strength</p>
              <h2 className="mt-2 text-2xl font-medium text-hblack1000">하퍼의 장점</h2>
            </div>
            <div className="space-y-4">
              {BENEFITS.map((benefit, idx) => (
                <article
                  key={benefit.title}
                  className="rounded-xl border border-hblack200 bg-hblack000 p-6 transition-colors hover:bg-hblack100"
                >
                  <h3 className="text-base font-medium text-hblack900">
                    {idx + 1}. {benefit.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-hblack600">
                    {benefit.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className={`${cardBase} p-8`}>
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.08em] text-hblack500">FAQ</p>
              <h2 className="mt-2 text-2xl font-medium text-hblack1000">자주 묻는 질문</h2>
            </div>
            <div className="space-y-4">
              {FAQ_ITEMS.map((faq) => (
                <article
                  key={faq.question}
                  className="rounded-xl border border-hblack200 bg-hblack000 p-6 transition-colors hover:bg-hblack100"
                >
                  <h3 className="text-base font-medium text-hblack900">{faq.question}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-hblack600">{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>

          <div className={`${cardBase} p-8`}>
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.08em] text-hblack500">Comparison</p>
              <h2 className="mt-2 text-2xl font-medium text-hblack1000">
                Harper vs Headhunting Agency vs 직접 지원
              </h2>
            </div>
            <div className="overflow-x-auto rounded-xl border border-hblack200">
              <table className="min-w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-hblack200 bg-hblack100 text-xs uppercase tracking-[0.08em] text-hblack500">
                    <th className="px-4 py-3 font-medium">비교 항목</th>
                    <th className="px-4 py-3 font-medium">Harper</th>
                    <th className="px-4 py-3 font-medium">Headhunting Agency</th>
                    <th className="px-4 py-3 font-medium">직접 Job 지원</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row, index) => (
                    <tr
                      key={row.item}
                      className={[
                        "border-b border-hblack200 text-sm",
                        index % 2 === 0 ? "bg-hblack000" : "bg-hblack100/70",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3 font-medium text-hblack900">{row.item}</td>
                      <td className="px-4 py-3 text-hblack700">{row.harper}</td>
                      <td className="px-4 py-3 text-hblack700">{row.agency}</td>
                      <td className="px-4 py-3 text-hblack700">{row.selfApply}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <aside className="lg:col-span-3 lg:sticky lg:top-8 lg:self-start">
          <div className={`${cardBase} p-6`}>
            <div className="mb-6">
              <p className="text-xs uppercase tracking-[0.08em] text-hblack500">Schedule</p>
              <h2 className="mt-2 text-xl font-medium text-hblack1000">날짜와 시간 선택</h2>
              <p className="mt-2 text-sm text-hblack600">
                일정 선택 후 바로 상담을 예약하거나 온보딩을 시작할 수 있습니다.
              </p>
            </div>

            <div className="rounded-xl border border-hblack200 bg-hblack000 p-4">
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack200 text-hblack700 transition-colors hover:bg-hblack100 hover:text-hblack900"
                  onClick={() =>
                    setMonthCursor(
                      new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)
                    )
                  }
                  aria-label="이전 달"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-sm font-medium text-hblack900">{monthLabel}</p>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack200 text-hblack700 transition-colors hover:bg-hblack100 hover:text-hblack900"
                  onClick={() =>
                    setMonthCursor(
                      new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)
                    )
                  }
                  aria-label="다음 달"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs text-hblack500">
                {WEEKDAYS.map((day) => (
                  <span key={day} className="py-2">
                    {day}
                  </span>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-7 gap-1">
                {monthGrid.map((cell, index) => {
                  if (!cell) {
                    return <div key={`empty-${index}`} className="h-9" />;
                  }
                  const isSelected = selectedDate ? sameDay(cell, selectedDate) : false;

                  return (
                    <button
                      key={cell.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(cell)}
                      className={[
                        "h-9 rounded-lg border text-sm font-medium transition-colors",
                        isSelected
                          ? "border-xprimary bg-xprimary/10 text-xprimary"
                          : "border-transparent text-hblack700 hover:border-hblack200 hover:bg-hblack100",
                      ].join(" ")}
                    >
                      {cell.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-medium text-hblack700">{selectedDateLabel}</p>
              <label className="mt-2 block text-xs uppercase tracking-[0.08em] text-hblack500">
                Time
              </label>
              <select
                value={selectedTime}
                onChange={(event) => setSelectedTime(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-hblack200 bg-hblack000 px-3 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
              >
                {TIME_SLOTS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 rounded-xl border border-hblack200 bg-hblack100 px-4 py-3 text-sm text-hblack700">
              예약 예정: {selectedDateLabel} {selectedDate ? selectedTime : ""}
            </div>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleCallBooking}
                className="h-10 w-full rounded-lg border border-hblack200 bg-hblack000 text-sm font-medium text-hblack900 transition-colors hover:bg-hblack100"
              >
                Call 예약
              </button>
              <button
                type="button"
                onClick={() => router.push("/career")}
                className="h-10 w-full rounded-lg border border-xprimary bg-xprimary text-sm font-medium text-hblack000 transition-opacity hover:opacity-90"
              >
                지금 시작하기
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
};

export default Talent;
