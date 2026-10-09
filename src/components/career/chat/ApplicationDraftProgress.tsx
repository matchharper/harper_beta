import { Loader2 } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useApplicationPreparation } from "./ApplicationPreparationContext";

/** Progress belongs to the conversation, never to the question composer. */
export function ApplicationDraftProgress({ runId }: { runId?: string } = {}) {
  const { record, pending, command } = useApplicationPreparation();
  const t = useCareerT();
  const status = record?.state.preparation?.generation.status;
  if (
    (runId && runId !== record?.state.preparation?.generation.runId) ||
    record?.state.status !== "active" ||
    (status !== "running" && status !== "failed")
  )
    return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex max-w-[740px] flex-wrap items-center gap-2 py-3 text-sm text-neutral-muted"
    >
      {status === "running" ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("career.prep.draftProgress", "초안 작성 중…")}
        </>
      ) : (
        <>
          <span>
            {t(
              "career.prep.draftFailed",
              "초안을 만들지 못했어요. 저장된 답변으로 다시 시도할 수 있어요."
            )}
          </span>
          <MuteButton
            disabled={pending}
            onClick={() => void command({ operation: "generate" })}
          >
            {t("career.prep.retryDraft", "초안 다시 만들기")}
          </MuteButton>
        </>
      )}
    </div>
  );
}
