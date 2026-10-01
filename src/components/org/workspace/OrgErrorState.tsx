import { useOrgLocale, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OrgErrorState({
  className,
  message,
  onRetry,
}: {
  className?: string;
  message: string;
  onRetry?: () => void;
}) {
  const t = useOrgT();
  const { locale } = useOrgLocale();
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-y border-critical/20 py-4 text-[13px] text-critical sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      role="alert"
    >
      <span>{localizedOrgErrorMessage(new Error(message), locale, t("workspace.OrgErrorState.failed", "정보를 불러오지 못했습니다."))}</span>
      {onRetry ? (
        <MuteButton
          className="self-start sm:self-auto"
          onClick={onRetry}
          size="md"
          type="button"
        >
          {t("workspace.OrgErrorState.69d6aa8c", "다시 시도")}
        </MuteButton>
      ) : null}
    </div>
  );
}
