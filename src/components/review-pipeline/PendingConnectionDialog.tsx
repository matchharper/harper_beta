import { type FormEvent, useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InternalConnectionConfirmationEmailMode } from "@/lib/ops/connectionConfirmationEmail";

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
          : "연결 대기 상태로 옮기지 못했습니다."
      );
    }
  };

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent
        className="z-[90] max-w-md gap-4 rounded-lg p-6"
        hideCloseButton
        overlayClassName="z-[80]"
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-[18px]">연결 대기로 이동</DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              {candidateName} 후보자를 연결 대기로 옮기시겠습니까?
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 rounded-sm bg-bg-weak px-2.5 py-2">
            <div className="flex items-start gap-2.5">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-neutral-muted" />
              <div className="min-w-0 text-[13px] leading-5 text-neutral-muted">
                <span className="font-medium text-neutral-primary">
                  {recipientEmail?.trim() || "사용자 이메일"}
                </span>
                로 연결 확정 안내 메일이 발송됩니다.
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3 border-y border-neutral-1000-a05 py-4">
            <Checkbox
              checked={sendEmail}
              disabled={pending}
              helperText="유저의 수락 후 최소 24시간이 지난 후, 한국시간 08:00~19:00 사이에 발송합니다."
              label="안내 메일 발송"
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
              helperText="자동 발송 일정을 기다리지 않고 이동 직후 발송을 요청합니다."
              label="즉시 보내기"
              onChange={(event) => setSendNow(event.target.checked)}
              size="small"
            />
          </div>

          {error ? (
            <div className="mt-3 text-[12px] text-critical" role="alert">
              {error}
            </div>
          ) : null}

          <DialogFooter className="mt-5">
            <Button
              disabled={pending}
              onClick={handleClose}
              size="md"
              type="button"
              variant="secondary"
            >
              취소
            </Button>
            <Button
              disabled={pending}
              size="md"
              type="submit"
              variant="primary"
            >
              {pending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              확인
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
