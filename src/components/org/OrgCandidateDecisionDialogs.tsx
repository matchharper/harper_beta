import { FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { cx } from "@/components/ops/theme";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { OrgStopReason } from "@/lib/org/server";

function parseEmailList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function AcceptIntroDialog({
  candidateName,
  defaultEmail,
  onClose,
  onSubmit,
  open,
  pending,
}: {
  candidateName: string;
  defaultEmail?: string | null;
  onClose: () => void;
  onSubmit: (args: {
    acceptReason: string | null;
    introEmails: string[];
  }) => void | Promise<void>;
  open: boolean;
  pending?: boolean;
}) {
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const emails = parseEmailList(String(formData.get("introEmails") ?? ""));
    const acceptReason =
      String(formData.get("acceptReason") ?? "").trim() || null;
    if (emails.length === 0) {
      setError("연결에 사용할 이메일을 입력해 주세요.");
      return;
    }
    setError("");
    try {
      await onSubmit({ acceptReason, introEmails: emails });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "연결 메일을 보내지 못했습니다. 다시 시도해 주세요."
      );
    }
  };
  const handleClose = () => {
    setError("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && !pending && handleClose()}
    >
      <DialogContent
        className="z-[90] max-w-md rounded-lg"
        overlayClassName="z-[80]"
      >
        <DialogHeader>
          <DialogTitle>후보자 연결</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-0 space-y-4">
          <div className="space-y-2 text-sm leading-6 text-neutral-primary">
            <div>{candidateName}</div>
            <div className="text-neutral-muted">
              후보자와 현재 로그인한 회사 담당자와 아래 이메일들을 참조를 통해
              연결하는 메일을 발송합니다. 이후부터는 직접 소통하실 수 있습니다.
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-neutral-muted">
              연결받을 이메일
            </span>
            <Textarea
              key={`${open}:${defaultEmail ?? ""}`}
              name="introEmails"
              defaultValue={defaultEmail?.trim() ?? ""}
              onChange={(event) => {
                if (error) setError("");
              }}
              rows={3}
              placeholder="name@company.com"
              className="min-h-[86px] mt-1"
              disabled={pending}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-neutral-muted">
              수락 이유
            </span>
            <Textarea
              key={`${open}:acceptReason`}
              name="acceptReason"
              rows={3}
              placeholder="예: 후보자의 ML infra 경험이 현재 역할과 잘 맞습니다."
              className="mt-1 min-h-[86px]"
              disabled={pending}
            />
            <p className="mt-1.5 text-xs leading-5 text-neutral-soft">
              필수는 아니지만 이유를 적어주신다면 다음 추천에 반영할 수
              있습니다.
            </p>
          </label>
          {error ? (
            <div className="text-xs text-critical" role="alert">
              {error}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleClose}
              disabled={pending}
            >
              취소
            </Button>
            <Button
              type="submit"
              variant="positive"
              size="md"
              disabled={pending}
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

export function StopCandidateDialog({
  candidateName,
  defaultReason = "company",
  onClose,
  onSubmit,
  open,
  pending,
  showReasonChoice = false,
}: {
  candidateName: string;
  defaultReason?: OrgStopReason;
  onClose: () => void;
  onSubmit: (args: { note: string; reason: OrgStopReason }) => void;
  open: boolean;
  pending?: boolean;
  showReasonChoice?: boolean;
}) {
  const [reason, setReason] = useState<OrgStopReason>(defaultReason);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trimmedNote = String(formData.get("stopNote") ?? "").trim();
    if (!trimmedNote) {
      setError("이유를 입력해 주세요.");
      return;
    }
    const selectedReason = reason;
    setError("");
    setReason(defaultReason);
    onSubmit({ note: trimmedNote, reason: selectedReason });
  };
  const handleClose = () => {
    setReason(defaultReason);
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent
        className="z-[90] max-w-md rounded-lg"
        overlayClassName="z-[80]"
      >
        <DialogHeader>
          <DialogTitle>프로세스 종료</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2 text-sm leading-6 text-neutral-primary">
            <div>{candidateName}</div>
            <div className="text-neutral-muted">
              후보자에게는 적당한 시점에 Harper가 부드럽게 프로세스 종료를
              안내합니다.
            </div>
          </div>
          {showReasonChoice ? (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["candidate", "후보자측 종료"],
                  ["company", "회사측 종료"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={reason === value ? "primary" : "secondary"}
                  size="md"
                  onClick={() => setReason(value)}
                  disabled={pending}
                  className={cx(reason === value && "border-primary")}
                >
                  {label}
                </Button>
              ))}
            </div>
          ) : null}
          <label className="block space-y-2">
            <span className="text-xs font-medium text-neutral-muted">이유</span>
            <Textarea
              key={`${open}:${candidateName}`}
              name="stopNote"
              onChange={(event) => {
                if (error) setError("");
              }}
              rows={5}
              required
              placeholder="거절 이유를 입력해 주세요. 해당 이유는 유저에게 전달되지 않고, 다음번에 더 적합한 인재를 연결해주기 위해 Harper가 참고합니다."
              className="min-h-[132px]"
              disabled={pending}
            />
          </label>
          {error ? (
            <div className="text-xs text-critical" role="alert">
              {error}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={handleClose}
              disabled={pending}
            >
              취소
            </Button>
            <Button
              type="submit"
              variant="critical"
              size="md"
              disabled={pending}
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
