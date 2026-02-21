import {
  ArrowRight,
  CheckCircle2,
  Search,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";

type ScoutEmptyStateProps = {
  onCreateAgent: () => void;
};

const valueCards = [
  {
    icon: Search,
    title: "자동 후보자 탐색",
    description:
      "Recruiting Agent가 알려주신 조건에 맞는 후보자를 매일 탐색하고 추천합니다.",
  },
  {
    icon: Target,
    title: "피드백 기반 최적화",
    description:
      "적합/부적합 피드백을 학습해 추천 기준을 빠르게 팀에 맞춥니다.",
  },
  {
    icon: TrendingUp,
    title: "채용 효율 개선",
    description:
      "발견을 위한 시간을 줄이고, 팀은 검토와 인터뷰 의사결정에만 집중할 수 있습니다.",
  },
];

const sequences = [
  {
    title:
      "Harper와 대화하며 원하는 인재에 대해서 모호한 정보까지 전부 알려주세요.",
    description:
      "처음부터 구체적으로 모든 조건을 입력하실 필요 없습니다. 추천된 후보자를 검토하면서 조건이나 선호사항을 추가로 알려주세요.",
  },
  {
    title: "매일 추천되는 1~2명의 후보자를 검토하세요.",
    description: "매일 가벼운 리소스만 사용하세요.",
  },
  {
    title:
      "적합/부적합/연결요청 등의 피드백을 남기시면 만족하시는 후보자가 추천될때까지 계속해서 결과가 최적화됩니다.",
    description: "만족하시는 후보자를 발견할때까지 추천은 계속됩니다.",
  },
];

export default function ScoutEmptyState({
  onCreateAgent,
}: ScoutEmptyStateProps) {
  return (
    <div className="mx-4 mt-6 pb-8">
      <section className="mx-auto max-w-5xl px-12 py-12">
        <header className="max-w-4xl">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/45"></p>
          <h2 className="mt-3 text-3xl font-hedvig font-light leading-relaxed tracking-tight text-white">
            까다롭고 모호한 조건까지
            <br />
            충족하는 후보자를 찾아드립니다.
          </h2>
          {/* <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/70">
            Harper Scout는 조건에 맞는 후보자를 매일 1~2명씩 찾아 연결해드리고,
            피드백을 반영해 갈수록 최적화됩니다.
            <br />
            매일 아침 혹은 저녁 추천된 후보자를 검토하세요. 만족하시는 후보자를
            발견할때까지 계속 추천됩니다.
          </p> */}
        </header>

        <div className="mt-10 grid grid-cols-3 border-t border-white/10 pt-7">
          {valueCards.map(({ icon: Icon, title, description }, idx) => (
            <article key={title} className={`pr-8`}>
              <div className="mb-4 inline-flex h-8 w-8 rounded-full items-center justify-center bg-white text-black">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="text-base font-medium text-white">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {description}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10 flex items-end justify-between border-t border-white/10 pt-7">
          <div>
            <p className="text-sm text-white/80">진행 방법</p>
            <div className="mt-4 items-start justify-start gap-6 text-sm text-white/90 flex flex-col">
              {sequences.map(({ title, description }, idx) => (
                <div key={title} className="flex flex-row items-start gap-3">
                  <span className="text-sm mt-1 text-white/65 w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[15px] font-normal text-white/90">
                      {title}
                    </div>
                    <div className="text-sm text-white/50">{description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onCreateAgent}
            className="inline-flex items-center gap-2 border border-white/30 px-6 py-3 text-sm font-medium bg-accenta1 rounded-full text-black transition hover:opacity-80"
          >
            Agent 만들기
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  );
}

// 피드백을 바탕으로 매일 최적화된다.
// 까다롭고 구체적인 조건이라도 전부 충족하는 지원자, 미팅할 가치가 있는 지원자만 찾아준다.
// 원하면 연결까지 도와준다.
