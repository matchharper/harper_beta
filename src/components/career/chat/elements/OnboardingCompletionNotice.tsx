import { memo } from "react";
import { useCareerT } from "@/i18n/useCareerT";

type OnboardingCompletionNoticeProps = {
  content: string;
};

export const OnboardingCompletionNotice = memo(
  function OnboardingCompletionNotice({
    content,
  }: OnboardingCompletionNoticeProps) {
    const t = useCareerT();

    return (
      <div className="w-full max-w-[760px] rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-4 py-3 text-[12px] leading-5 text-neutral-soft shadow-sm">
        <div className="mb-1 text-[11px] font-medium text-neutral-disabled">
          {t("career.common.career.0rd0cjd", "안내")}
        </div>
        <div className="wrap-break-word whitespace-pre-wrap">{content}</div>
      </div>
    );
  }
);
