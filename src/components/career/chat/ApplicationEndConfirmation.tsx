import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useApplicationPreparation } from "./ApplicationPreparationContext";

export function ApplicationEndConfirmation({
  open,
  onClose,
  onEnded,
}: {
  open: boolean;
  onClose: () => void;
  onEnded?: () => void;
}) {
  const t = useCareerT();
  const { command, pending } = useApplicationPreparation();
  const [ending, setEnding] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const busy = pending || ending;
  const close = () => {
    if (busy || lock.current) return;
    setFailed(false);
    onClose();
  };
  const end = async () => {
    if (busy || lock.current) return;
    lock.current = true;
    setEnding(true);
    setFailed(false);
    try {
      if (await command({ operation: "end" })) {
        onEnded?.();
        onClose();
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setEnding(false);
    }
  };
  return (
    <TalentCareerModal
      open={open}
      onClose={close}
      title={t("career.application.end.title", "지원 과정을 종료하시겠습니까?")}
      description={t(
        "career.application.end.description",
        "현재 지원 준비를 멈추고 일반 채팅으로 돌아갑니다."
      )}
      showCloseButton={false}
      closeOnBackdrop={!busy}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
      mobileBottomSheet
      panelClassName="max-w-[440px] motion-reduce:animate-none"
      backdropClassName="motion-reduce:animate-none"
      footerClassName="pt-1 sm:pt-1"
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <MuteButton disabled={busy} onClick={close}>
            {t("career.prep.no", "아니요")}
          </MuteButton>
          <MuteButton variant="warn" disabled={busy} onClick={() => void end()}>
            {ending && (
              <Loader2
                aria-hidden
                className="animate-spin motion-reduce:animate-none"
              />
            )}
            {t("career.application.end.confirm", "종료하기")}
          </MuteButton>
        </div>
      }
    >
      {failed && (
        <p
          role="alert"
          className="px-4 pb-4 text-sm leading-relaxed text-critical sm:px-5"
        >
          {t(
            "career.application.end.error",
            "종료하지 못했어요. 잠시 후 다시 시도해 주세요."
          )}
        </p>
      )}
    </TalentCareerModal>
  );
}
