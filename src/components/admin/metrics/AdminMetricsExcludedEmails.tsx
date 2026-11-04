import { useEffect, useState } from "react";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { BareButton } from "@/components/ui/button";

type AdminMetricsExcludedEmailsProps = {
  excludedEmails: string[];
  onSave: (value: string) => void;
  onReset: () => void;
};

export default function AdminMetricsExcludedEmails({
  excludedEmails,
  onSave,
  onReset,
}: AdminMetricsExcludedEmailsProps) {
  const [draftValue, setDraftValue] = useState(excludedEmails.join("\n"));

  useEffect(() => {
    setDraftValue(excludedEmails.join("\n"));
  }, [excludedEmails]);

  return (
    <div
      className="border border-stroke bg-bg-floating p-4"
      style={{ borderRadius: "var(--radius-admin)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-neutral-primary">
            제외할 이메일 목록
          </div>
          <div className="mt-1 text-[12px] leading-5 text-neutral-primary/60">
            한 줄에 하나씩 넣거나 쉼표로 구분해서 저장하면 됩니다. @도메인
            형태도 지원합니다.
          </div>
        </div>
        <div className="text-[12px] text-neutral-primary/45">
          저장됨 {excludedEmails.length}개
        </div>
      </div>

      <UiTextarea
        unstyled
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        rows={5}
        className="mt-3 w-full resize-y border border-stroke-strong/15 px-3 py-2 text-[13px] text-neutral-primary outline-none transition focus:border-stroke-strong/35"
        style={{ borderRadius: "var(--radius-admin)" }}
        placeholder={[
          "@matchharper.com",
          "test@matchharper.com",
          "demo@matchharper.com",
          "internal@example.com",
        ].join("\n")}
      />

      <div className="mt-3 flex items-center gap-2">
        <BareButton
          type="button"
          onClick={() => onSave(draftValue)}
          className="h-9 px-3 text-[12px] border border-stroke-strong bg-surface-inverse text-on-inverse hover:bg-surface-inverse/90"
          style={{ borderRadius: "var(--radius-admin)" }}
        >
          Save exclusions
        </BareButton>
        <BareButton
          type="button"
          onClick={onReset}
          className="h-9 px-3 text-[12px] border border-stroke-strong/15 text-neutral-primary hover:border-stroke-strong/30 hover:bg-surface-tint"
          style={{ borderRadius: "var(--radius-admin)" }}
        >
          Reset defaults
        </BareButton>
      </div>
    </div>
  );
}
