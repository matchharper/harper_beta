import { useRef, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import type { CareerHistoryOpportunity } from "../types";

export default function MockInterviewStart({
  item,
  onStart,
}: {
  item: CareerHistoryOpportunity;
  onStart?: (opportunityId: string) => boolean | Promise<boolean>;
}) {
  const t = useCareerT();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const starting = useRef(false);
  const start = async () => {
    if (!onStart || starting.current) return;
    starting.current = true;
    setPending(true);
    setFailed(false);
    try {
      if (await onStart(item.id)) setOpen(false);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      starting.current = false;
      setPending(false);
    }
  };
  return (
    <>
      <MuteButton
        disabled={!onStart}
        onClick={() => {
          setFailed(false);
          setOpen(true);
        }}
        className="shrink-0"
        size="lg"
        variant="neutral"
      >
        {t("career.history.mock_interview.action", "모의 인터뷰 해보기")}
      </MuteButton>
      <TalentCareerModal
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={t(
          "career.history.mock_interview.title",
          "모의 인터뷰를 시작할까요?"
        )}
        description={
          <span>
            {item.companyName} · {item.title}
          </span>
        }
        panelClassName="flex max-h-[calc(100dvh-48px)] max-w-[520px] flex-col rounded-[16px] border-neutral-1000-a05 bg-bg-floating"
        headerClassName="shrink-0 px-5 pb-4 pt-5 pr-14 sm:px-6 sm:pr-14"
        descriptionClassName="min-w-0 break-keep [overflow-wrap:anywhere]"
        bodyClassName="min-h-0 overflow-y-auto px-5 sm:px-6"
        footerClassName="shrink-0 px-5 pb-5 pt-5 sm:px-6"
        closeOnBackdrop={!pending}
        showCloseButton={!pending}
        footer={
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:justify-end">
            <MuteButton
              size="lg"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {t("career.history.mock_interview.cancel", "취소")}
            </MuteButton>
            <MuteButton
              variant="dark"
              size="lg"
              className="min-w-0 whitespace-normal"
              disabled={pending}
              onClick={() => void start()}
            >
              {pending
                ? t("career.history.mock_interview.connecting", "연결 중...")
                : t("career.history.mock_interview.start", "음성으로 시작하기")}
            </MuteButton>
          </div>
        }
      >
        <div className="space-y-4 break-keep text-[14px] leading-6 text-neutral-primary [overflow-wrap:anywhere]">
          {failed && (
            <p role="alert" className="text-critical">
              {t(
                "career.history.mock_interview.failed",
                "통화를 시작하지 못했습니다. 진행 중인 통화와 마이크 권한을 확인한 뒤 다시 시도해 주세요."
              )}
            </p>
          )}
          <p>
            {t(
              "career.history.mock_interview.notice",
              "선택한 포지션을 기준으로 Harper와 음성 면접을 연습합니다. 개인의 면접 역량 향상을 위한 연습이며, 이 기능이 인터뷰 내용을 기업이나 채용 담당자에게 전송하지는 않습니다."
            )}
          </p>
          <div className="space-y-2 rounded-lg bg-bg-weak px-4 py-3 text-[13px] leading-[1.65] text-neutral-muted">
            <p>
              {t(
                "career.history.mock_interview.accuracy",
                "공개 자료를 바탕으로 구성한 질문은 실제 기출과 다르거나 부정확할 수 있습니다."
              )}
            </p>
            <p>
              {t(
                "career.history.mock_interview.recording",
                "대화는 일반 통화와 동일하게 기록과 콜노트로 저장됩니다."
              )}
            </p>
          </div>
        </div>
      </TalentCareerModal>
    </>
  );
}
