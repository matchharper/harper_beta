import { useId } from "react";
import { Textarea } from "@/components/ui/textarea";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

/**
 * Text entry when there is no readable source: either nothing was connected
 * ("empty") or a connected source could not be read ("failed"). Submission
 * uses the regular resume flow.
 */
export function ResumeTextRecovery({
  reason,
  value,
  onChange,
  onSubmit,
  pending = false,
}: {
  reason: "empty" | "failed";
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending?: boolean;
}) {
  const t = useCareerT();
  const id = useId();
  const failed = reason === "failed";
  return (
    <div className="w-full space-y-4">
      <div className="space-y-2">
        <label
          htmlFor={id}
          className="block text-base font-medium text-neutral-primary"
        >
          {failed
            ? t("career.resume_recovery.title", "경력 내용을 직접 알려주세요")
            : t(
                "career.resume_recovery.empty_title",
                "간단하게라도 어떤 일을 해오셨는지 알려주세요"
              )}
        </label>
        {failed && (
          <p id={`${id}-help`} className="text-sm leading-6 text-neutral-muted">
            {t(
              "career.resume_recovery.help",
              "자료를 불러오지 못했어요. 이력서나 경력 소개의 텍스트를 붙여넣어 주시면 이어서 정리할게요."
            )}
          </p>
        )}
      </div>
      <Textarea
        id={id}
        aria-describedby={failed ? `${id}-help` : undefined}
        autoFocus
        isMain
        rows={10}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={pending}
        placeholder={t(
          "career.resume_recovery.placeholder",
          "경력·프로젝트·해온 일에 대한 내용"
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
