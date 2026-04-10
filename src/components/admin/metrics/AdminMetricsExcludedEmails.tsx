import { useEffect, useState } from "react";

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
      className="border border-black/10 bg-white p-4"
      style={{ borderRadius: 0 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-black">
            제외할 이메일 목록
          </div>
          <div className="mt-1 text-[12px] leading-5 text-black/60">
            한 줄에 하나씩 넣거나 쉼표로 구분해서 저장하면 됩니다.
            @도메인 형태도 지원합니다.
          </div>
        </div>
        <div className="text-[12px] text-black/45">
          저장됨 {excludedEmails.length}개
        </div>
      </div>

      <textarea
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        rows={5}
        className="mt-3 w-full resize-y border border-black/15 px-3 py-2 text-[13px] text-black outline-none transition focus:border-black/35"
        style={{ borderRadius: 0 }}
        placeholder={[
          "@matchharper.com",
          "test@matchharper.com",
          "demo@matchharper.com",
          "internal@example.com",
        ].join("\n")}
      />

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(draftValue)}
          className="h-9 px-3 text-[12px] border border-black bg-black text-white hover:bg-black/90"
          style={{ borderRadius: 0 }}
        >
          Save exclusions
        </button>
        <button
          type="button"
          onClick={onReset}
          className="h-9 px-3 text-[12px] border border-black/15 text-black hover:border-black/30 hover:bg-black/[0.03]"
          style={{ borderRadius: 0 }}
        >
          Reset defaults
        </button>
      </div>
    </div>
  );
}
