import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { MessagesProvider } from "@/i18n/useMessage";
import type { CareerRecommendationSearchStatus } from "./types";
import { RecommendationSearchStatusPanel } from "./chat/elements/RecommendationSearchStatusPanel";

// career-i18n-skip: developer-only preview controls.
const FRAMES: { label: string; status: CareerRecommendationSearchStatus }[] = [
  { label: "1. 포지션 찾기", status: { state: "running", phase: "query" } },
  {
    label: "2. 적합도 확인",
    status: { state: "running", phase: "scoring", candidateCount: 128 },
  },
  {
    label: "3. 추천 포지션 선정",
    status: {
      state: "running",
      phase: "reranking",
      candidateCount: 128,
      scoredCount: 24,
    },
  },
  {
    label: "4. 결과 전달",
    status: {
      state: "running",
      phase: "delivery",
      candidateCount: 128,
      scoredCount: 24,
      recommendationCount: 5,
    },
  },
  {
    label: "완료",
    status: {
      state: "completed",
      phase: "delivery",
      candidateCount: 128,
      scoredCount: 24,
      recommendationCount: 5,
    },
  },
  {
    label: "오류",
    status: {
      state: "error",
      phase: "reranking",
      candidateCount: 128,
      scoredCount: 24,
    },
  },
  {
    label: "중지",
    status: { state: "stopped", phase: "scoring", candidateCount: 128 },
  },
];

// career-i18n-skip: the rendered status panel supplies its own translated copy.
export default function CareerRecommendationSearchPreview({
  onClose,
}: {
  onClose: () => void;
}) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [locale, setLocale] = useState<"ko" | "en">("ko");
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setFrame((value) => (value + 1) % 5),
      2200
    );
    return () => window.clearInterval(timer);
  }, [playing]);

  return (
    <TalentCareerModal
      open
      onClose={onClose}
      title="추천 검색 로딩"
      description="화면 전용 미리보기 · 실제 검색이나 데이터 저장 없이 확인합니다."
      panelClassName="max-w-[560px]"
      bodyClassName="px-4 pb-5 sm:px-5"
    >
      <div data-career-i18n-skip="true" className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {FRAMES.map((item, index) => (
            <MuteButton
              key={item.label}
              size="sm"
              variant={index === frame ? "dark" : "default"}
              aria-pressed={index === frame}
              onClick={() => {
                setPlaying(false);
                setFrame(index);
              }}
            >
              {item.label}
            </MuteButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MuteButton
            size="sm"
            onClick={() => {
              if (frame > 4) setFrame(0);
              setPlaying(!playing);
            }}
          >
            {playing ? (
              <Pause className="size-3.5" />
            ) : (
              <Play className="size-3.5" />
            )}
            {playing ? "일시 정지" : "자동 재생"}
          </MuteButton>
          <MuteButton
            size="sm"
            onClick={() => {
              setFrame(0);
              setPlaying(false);
            }}
          >
            <RotateCcw className="size-3.5" />
            처음부터
          </MuteButton>
          <MuteButton
            size="sm"
            onClick={() => setLocale(locale === "ko" ? "en" : "ko")}
          >
            {locale === "ko" ? "English" : "한국어"}
          </MuteButton>
        </div>
        <div className="flex justify-center rounded-xl bg-bg-basement p-2 sm:p-4">
          <MessagesProvider
            locale={locale}
            manageDocumentLanguage={false}
            persistPreference={false}
          >
            <RecommendationSearchStatusPanel
              active
              status={FRAMES[frame].status}
              onCancel={() => {
                setPlaying(false);
                setFrame(6);
              }}
            />
          </MessagesProvider>
        </div>
      </div>
    </TalentCareerModal>
  );
}
