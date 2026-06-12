import { cx, opsTheme } from "@/components/ops/theme";
import type { NetworkLeadSummary } from "@/lib/opsNetwork";
import { motion } from "motion/react";
import { LoaderCircle } from "lucide-react";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { BareButton } from "@/components/ui/button";

export function QuickMemoModal({
  isSaving,
  lead,
  onChange,
  onClose,
  onSubmit,
  value,
}: {
  isSaving: boolean;
  lead: NetworkLeadSummary | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  value: string;
}) {
  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-80">
      <motion.button
        type="button"
        aria-label="Close quick memo modal"
        className="absolute inset-0 bg-bg-weak backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="absolute left-1/2 top-1/2 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-1000-a05 bg-bg-default p-4 shadow-[0_24px_80px_color-mix(in_srgb,var(--color-neutral-1000)_20%,transparent)]"
      >
        <div className="mb-3 text-sm text-neutral-muted">
          {lead.name ?? "이름 없음"} 메모
        </div>
        <UiTextarea
          unstyled
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cx(opsTheme.textarea, "min-h-[180px]")}
          autoFocus
        />
        <BareButton
          type="button"
          onClick={onSubmit}
          disabled={isSaving || !value.trim()}
          className={cx(opsTheme.buttonPrimary, "mt-3 h-11 w-full")}
        >
          {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          등록
        </BareButton>
      </motion.div>
    </div>
  );
}
