import { cx, opsTheme } from "@/components/ops/theme";
import type { NetworkLeadSummary } from "@/lib/opsNetwork";
import { motion } from "framer-motion";
import { LoaderCircle } from "lucide-react";

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
    <div className="fixed inset-0 z-[80]">
      <motion.button
        type="button"
        aria-label="Close quick memo modal"
        className="absolute inset-0 bg-beige900/25 backdrop-blur-[2px]"
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
        className="absolute left-1/2 top-1/2 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-beige900/10 bg-[#F4E8D8] p-4 shadow-[0_24px_80px_rgba(46,23,6,0.2)]"
      >
        <div className="mb-3 font-geist text-sm text-beige900/65">
          {lead.name ?? "이름 없음"} 메모
        </div>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cx(opsTheme.textarea, "min-h-[180px]")}
          autoFocus
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSaving || !value.trim()}
          className={cx(opsTheme.buttonPrimary, "mt-3 h-11 w-full")}
        >
          {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          등록
        </button>
      </motion.div>
    </div>
  );
}
