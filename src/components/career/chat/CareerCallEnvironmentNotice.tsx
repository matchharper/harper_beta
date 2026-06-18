import { ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import React from "react";

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
  const t = useCareerT();

  if (collapsed) {
    return (
      <div className={cn("w-full", className)}>
        <div className="flex justify-center">
          <BareButton
            type="button"
            onClick={onToggle}
            aria-expanded={false}
            className="animate-in fade-in slide-in-from-top-2 inline-flex items-center gap-3 rounded-full border border-accent-300/60 bg-bg-floating/95 px-2 py-1.5 text-left backdrop-blur transition-transform duration-200 hover:-translate-y-0.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-300 text-primary">
              <Volume2 className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium text-neutral-muted">
              {t("career.call.environment_notice.title", "통화 환경 안내")}
            </span>
            <ChevronDown className="h-4 w-4 text-neutral-soft" />
          </BareButton>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="flex justify-center">
        <div className="animate-in fade-in slide-in-from-top-2 w-full max-w-[560px] rounded-[24px] border border-accent-300/60 p-px backdrop-blur duration-300">
          <div className="rounded-[23px] px-3 py-3 sm:px-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-300 text-primary">
                <Volume2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="mt-1 text-sm font-semibold leading-5 text-neutral-primary">
                    {t(
                      "career.call.environment_notice.heading",
                      "주변이 시끄러우면 통화가 정확하지 않을 수 있어요."
                    )}
                  </p>
                  <BareButton
                    type="button"
                    onClick={onToggle}
                    aria-expanded
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-neutral-1000-a05 bg-bg-floating px-3 py-1.5 text-xs font-medium text-neutral-muted transition-colors hover:border-neutral-1000-a10 hover:bg-bg-weak hover:text-neutral-muted"
                  >
                    {t("career.call.environment_notice.collapse", "접기")}
                    <ChevronUp className="h-3.5 w-3.5" />
                  </BareButton>
                </div>
                <p className="mt-1 text-[13px] leading-5 text-neutral-muted">
                  {t(
                    "career.call.environment_notice.description",
                    "주변 소음이 많으면 Harper가 말을 정확히 듣지 못해 통화가 매끄럽지 않을 수 있어요. 가능한 조용한 곳에서 이어주세요."
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CareerCallEnvironmentNotice);
