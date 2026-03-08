import React from "react";
import AppHeader from "@/components/common/AppHeader";

const PRINCIPLES = [
  {
    title: "공고 중심이 아니라 사람 중심",
    body: "하퍼는 열린 공고를 단순 추천하지 않습니다. 후보자의 선호, 역량, 타이밍을 먼저 파악하고 적합한 역할을 역으로 찾습니다.",
  },
  {
    title: "좋은 기회만 전달",
    body: "무작위 제안 대신 실제 성사 가능성이 높은 기회만 추려서 안내합니다. 메시지 수보다 매칭 품질을 우선합니다.",
  },
  {
    title: "후보자 관점의 설득과 조율",
    body: "기회가 맞다고 판단되면 하퍼가 후보자의 강점과 맥락을 정리해 기업과의 대화를 시작하고, 조건 조율도 함께 돕습니다.",
  },
];

const WHY_HARPER_POINTS = [
  "일반 채용시장에 공개되지 않은 글로벌/딥테크 기회 접근",
  "요구사항이 바뀔 때마다 대화로 즉시 업데이트",
  "프로필 공개 범위를 후보자가 선택",
  "지원부터 제안 수신까지 시간을 아껴주는 흐름",
];

const WhyHarperPage = () => {
  return (
    <main className="min-h-screen bg-hblack000 text-hblack900 font-inter">
      <AppHeader />

      <section className="mx-auto max-w-[1080px] px-4 pb-20 pt-14 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-xprimary">
          Why Harper
        </p>
        <h1 className="mt-3 max-w-[820px] text-3xl font-medium leading-tight text-hblack1000 lg:text-4xl">
          좋은 커리어 기회는 지원 속도보다
          <br />
          <span className="text-xprimary">정확한 매칭과 타이밍</span>에서 시작됩니다.
        </h1>
        <p className="mt-5 max-w-[760px] text-sm leading-relaxed text-hblack600 lg:text-base">
          하퍼는 AI/ML/Engineering 인재를 위한 AI Talent Agent입니다. 이력서와
          링크, 그리고 대화에서 얻은 맥락을 기반으로 후보자에게 맞는 기회를
          찾고 연결합니다. 기회가 맞는 순간에는 하퍼가 먼저 설득하고, 후보자는
          더 좋은 선택에 집중할 수 있게 만듭니다.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PRINCIPLES.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-hblack200 bg-hblack000 p-5"
            >
              <h2 className="text-base font-medium text-hblack1000">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-hblack600">
                {item.body}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-hblack200 bg-hblack000 p-6">
          <p className="text-sm font-medium text-hblack1000">왜 계속 쓰게 될까?</p>
          <div className="mt-4 divide-y divide-hblack200">
            {WHY_HARPER_POINTS.map((point) => (
              <p key={point} className="py-3 text-sm text-hblack700">
                {point}
              </p>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-xl border border-xprimary/30 bg-xprimary/10 p-6">
          <p className="text-sm leading-relaxed text-hblack900">
            하퍼의 목표는 많은 기회를 보내는 것이 아니라,
            <br />
            <span className="font-medium">
              당신이 실제로 움직일 가치가 있는 기회만 정확하게 전달하는 것
            </span>
            입니다.
          </p>
        </div>
      </section>
    </main>
  );
};

export default WhyHarperPage;
