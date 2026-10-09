import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useId, type FormEvent, useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import type { InternalConnectionConfirmationEmailMode } from "@/lib/ops/connectionConfirmationEmail";
import { useOrgT } from "@/i18n/org/OrgLocaleProvider";

type PendingConnectionDialogProps = {
  candidateName: string;
  onClose: () => void;
  onConfirm: (
    emailMode: InternalConnectionConfirmationEmailMode
  ) => Promise<void> | void;
  open: boolean;
  pending?: boolean;
  recipientEmail?: string | null;
};

export function PendingConnectionDialog(props: PendingConnectionDialogProps) {
  if (!props.open) return null;
  return <PendingConnectionDialogContent {...props} />;
}

function PendingConnectionDialogContent({
  candidateName,
  onClose,
  onConfirm,
  pending = false,
  recipientEmail,
}: PendingConnectionDialogProps) {
  const modalFormId1 = useId();
  const t = useOrgT();
  const [error, setError] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendNow, setSendNow] = useState(false);

  const handleClose = () => {
    if (pending) return;
    setError("");
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    try {
      await onConfirm(!sendEmail ? "skip" : sendNow ? "send_now" : "schedule");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("pendingConnection.failed", "연결 대기 상태로 옮기지 못했습니다.")
      );
    }
  };

  return (
    <TalentCareerModal
      open={true}
      onClose={() => handleClose()}
      mobileBottomSheet
      title={<>{t("pendingConnection.title", "연결 대기로 이동")}</>}
      description={
        <>
          {t(
            "pendingConnection.confirm",
            "{candidateName} 후보자를 연결 대기로 옮기시겠습니까?",
            { candidateName }
          )}
        </>
      }
      panelClassName="z-[90] max-w-md"
      bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
      showCloseButton={!true}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MuteButton
            disabled={pending}
            onClick={handleClose}
            size="md"
            type="button"
            variant="default"
            form={modalFormId1}
          >
            {t("pendingConnection.cancel", "취소")}
          </MuteButton>
          <MuteButton
            disabled={pending}
            size="md"
            type="submit"
            variant="primary"
            form={modalFormId1}
          >
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {t("pendingConnection.submit", "확인")}
          </MuteButton>
        </div>
      }
      backdropClassName={"z-[80]"}
    >
      <form onSubmit={handleSubmit} id={modalFormId1}>
        <div className="mt-4 rounded-sm bg-bg-weak px-2.5 py-2">
          <div className="flex items-start gap-2.5">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-neutral-muted" />
            <div className="min-w-0 text-[13px] leading-5 text-neutral-muted">
              {t(
                "pendingConnection.emailNotice",
                "{recipientEmail}로 연결 확정 안내 메일이 발송됩니다.",
                {
                  recipientEmail:
                    recipientEmail?.trim() ||
                    t("pendingConnection.userEmail", "사용자 이메일"),
                }
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-y border-neutral-1000-a05 py-4">
          <Checkbox
            checked={sendEmail}
            disabled={pending}
            helperText={t(
              "pendingConnection.scheduledHelp",
              "유저의 수락 후 최소 24시간이 지난 후, 한국시간 08:00~19:00 사이에 발송합니다."
            )}
            label={t("pendingConnection.sendEmail", "안내 메일 발송")}
            onChange={(event) => {
              const checked = event.target.checked;
              setSendEmail(checked);
              if (!checked) setSendNow(false);
            }}
            size="small"
          />
          <Checkbox
            checked={sendNow}
            disabled={pending || !sendEmail}
            helperText={t(
              "pendingConnection.sendNowHelp",
              "자동 발송 일정을 기다리지 않고 이동 직후 발송을 요청합니다."
            )}
            label={t("pendingConnection.sendNow", "즉시 보내기")}
            onChange={(event) => setSendNow(event.target.checked)}
            size="small"
          />
        </div>

        {error ? (
          <div className="mt-3 text-[12px] text-critical" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </TalentCareerModal>
  );
}
