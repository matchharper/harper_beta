import { useId } from "react";
import { Textarea } from "@/components/ui/textarea";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

/** Recovery for an unreadable source; submission uses the regular resume flow. */
export function ResumeTextRecovery({
  value,
  onChange,
  onSubmit,
  pending = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending?: boolean;
}) {
  const t = useCareerT();
  const id = useId();
  return (
    <div className="w-full space-y-4">
      <div className="space-y-2">
        <label
          htmlFor={id}
          className="block text-base font-medium text-neutral-primary"
        >
          {t(
            "career.resume_recovery.title",
            "이력서 내용을 직접 붙여넣어 주세요"
          )}
        </label>
        <p id={`${id}-help`} className="text-sm leading-6 text-neutral-muted">
          {t(
            "career.resume_recovery.help",
            "이력서에서 프로필 정보를 가져오지 못했어요. 전체 텍스트를 복사해 넣어주시면 이어서 프로필을 만들게요."
          )}
        </p>
      </div>
      <Textarea
        id={id}
        aria-describedby={`${id}-help`}
        autoFocus
        isMain
        rows={10}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={pending}
        placeholder={t(
          "career.resume_recovery.placeholder",
          "이력서 전체 텍스트"
        )}
      />
      <div className="flex justify-end">
        <MuteButton
          variant="dark"
          size="lg"
          className="w-full sm:w-auto"
          disabled={pending || !value.trim()}
          onClick={onSubmit}
        >
          {pending
            ? t("career.resume_recovery.pending", "프로필을 만들고 있어요…")
            : t("career.resume_recovery.submit", "이 내용으로 계속하기")}
        </MuteButton>
      </div>
    </div>
  );
}
