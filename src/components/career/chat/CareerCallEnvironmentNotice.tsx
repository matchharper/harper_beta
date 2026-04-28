import { ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import { careerCx } from "@/components/career/ui/CareerPrimitives";

type CareerCallEnvironmentNoticeProps = {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
};

const CareerCallEnvironmentNotice = ({
  collapsed,
  onToggle,
  className,
}: CareerCallEnvironmentNoticeProps) => {
  if (collapsed) {
    return (
      <div className={careerCx("w-full", className)}>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={false}
            className="animate-in fade-in slide-in-from-top-2 inline-flex items-center gap-3 rounded-full border border-[#dcc4a8]/60 bg-[rgba(255,249,241,0.95)] px-4 py-3 text-left shadow-[0_14px_40px_rgba(69,44,26,0.1)] backdrop-blur transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(69,44,26,0.15)]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4dfc7] text-[#9a5c25]">
              <Volume2 className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-beige900/70">
              통화 환경 안내
            </span>
            <ChevronDown className="h-4 w-4 text-beige900/45" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={careerCx("w-full", className)}>
      <div className="flex justify-center">
        <div className="animate-in fade-in slide-in-from-top-2 w-full max-w-[560px] rounded-[24px] border border-[#dcc4a8]/60 bg-[linear-gradient(135deg,rgba(255,252,245,1),rgba(247,235,220,0.95))] p-[1px] shadow-[0_18px_55px_rgba(69,44,26,0.15)] backdrop-blur duration-300">
          <div className="rounded-[23px] bg-[linear-gradient(180deg,rgba(255,255,255,0.75),rgba(245,236,221,0.9))] px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f4dfc7] text-[#9a5c25] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <Volume2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="mt-1 text-sm font-semibold leading-5 text-beige900">
                      주변이 시끄러우면 통화가 정확하지 않을 수 있어요.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-beige900/10 bg-white/65 px-3 py-1.5 text-xs font-medium text-beige900/55 transition-colors hover:border-beige900/20 hover:text-beige900/75"
                  >
                    접기
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-2 text-[13px] leading-5 text-beige900/60">
                  주변 소음이 많으면 Harper가 말을 정확히 듣지 못해 통화가
                  매끄럽지 않을 수 있어요. 가능한 조용한 곳에서 이어주세요.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CareerCallEnvironmentNotice;
