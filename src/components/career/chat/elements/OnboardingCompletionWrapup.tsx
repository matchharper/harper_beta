import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { memo } from "react";

import { BareButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { useCareerT } from "@/i18n/useCareerT";

type OnboardingCompletionWrapupProps = {
  content: string;
  onRegenerate?: () => void | Promise<void>;
  regenerating?: boolean;
};

export const OnboardingCompletionWrapup = memo(
  function OnboardingCompletionWrapup({
    content,
    onRegenerate,
    regenerating,
  }: OnboardingCompletionWrapupProps) {
    const t = useCareerT();

    const showRegenerateButton =
      process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_ENABLE_ONBOARDING_WRAPUP_REGENERATE === "1";

    return (
      <div className="w-full max-w-[760px] overflow-hidden rounded-[8px] border border-neutral-800/25 bg-linear-to-br from-bg-floating via-bg-floating to-bg-basement/75 shadow-[0_18px_60px_color-mix(in_srgb,var(--color-neutral-1000)_8%,transparent)]">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-neutral-muted" />
            <div className="text-[15px] leading-6 font-medium text-neutral-primary">
              {t("career.common.career.1lzad2w", "대화 요약")}
            </div>
          </div>
          {showRegenerateButton && onRegenerate ? (
            <BareButton
              type="button"
              onClick={() => void onRegenerate()}
              disabled={regenerating}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-neutral-800/25 bg-bg-floating px-2.5 text-[13px] font-medium text-neutral-muted transition-colors hover:border-neutral-800/45 hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-60 md:text-[11px]"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Regenerate
            </BareButton>
          ) : null}
        </div>
        <div className="px-4 py-4">
          <RichText
            content={content}
            className="text-[13px] leading-6 text-neutral-muted [&_li]:text-[13px] [&_li]:leading-6 [&_ol]:text-[13px] [&_p]:text-[13px] [&_p]:leading-6 [&_p]:text-neutral-muted [&_strong]:font-semibold [&_strong]:text-neutral-primary [&_ul]:text-[13px] [&_ul]:leading-6"
          />
        </div>
      </div>
    );
  }
);
