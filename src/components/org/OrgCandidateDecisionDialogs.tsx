import { FormEvent, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { cx } from "@/components/ops/theme";
import { Button, MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { OrgMember, OrgStopReason } from "@/lib/org/server";

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
  members = [],
  onClose,
  onSubmit,
  open,
  pending,
}: {
  candidateName: string;
  defaultEmail?: string | null;
  members?: Pick<OrgMember, "email" | "name" | "userId">[];
  onClose: () => void;
  onSubmit: (args: {
    acceptReason: string | null;
    contactDirectly: boolean;
    introEmails: string[];
  }) => void | Promise<void>;
  open: boolean;
  pending?: boolean;
}) {
  const getDefaultEmailText = () => defaultEmail?.trim().toLowerCase() ?? "";
  const [contactDirectly, setContactDirectly] = useState(false);
  const [error, setError] = useState("");
  const [introEmailText, setIntroEmailText] = useState(getDefaultEmailText);
  const introEmails = parseEmailList(introEmailText);
  const selectedEmailSet = new Set(introEmails);
  const selectableMembers = members.filter(
    (member): member is typeof member & { email: string } =>
      Boolean(member.email?.trim())
  );

  const resetForm = () => {
    setContactDirectly(false);
    setError("");
    setIntroEmailText(getDefaultEmailText());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const acceptReason =
      String(formData.get("acceptReason") ?? "").trim() || null;
    if (!contactDirectly && introEmails.length === 0) {
      setError("연결에 사용할 이메일을 입력해 주세요.");
      return;
    }
    setError("");
    try {
      await onSubmit({
        acceptReason,
        contactDirectly,
        introEmails: contactDirectly ? [] : introEmails,
      });
      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "수락 요청을 처리하지 못했습니다. 다시 시도해 주세요."
      );
    }
  };
  const handleClose = () => {
    resetForm();
    onClose();
  };
  const toggleMemberEmail = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const nextEmails = selectedEmailSet.has(normalizedEmail)
      ? introEmails.filter((item) => item !== normalizedEmail)
      : [...introEmails, normalizedEmail];
    setIntroEmailText(nextEmails.join("\n"));
    if (error) setError("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && !pending && handleClose()}
    >
      <DialogContent
        className="z-[90] max-h-[calc(100dvh-32px)] max-w-md gap-4 overflow-y-auto rounded-lg p-6"
        overlayClassName="z-[80]"
      >
        <DialogHeader>
          <DialogTitle className="text-[18px]">후보자 연결</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-0 space-y-4">
          <div className="space-y-2 text-[13px] leading-5 text-neutral-primary">
            <div>{candidateName}</div>
            <div className="text-neutral-muted">
              {contactDirectly
                ? "수락 상태만 반영하고 Harper의 연결 메일은 발송하지 않습니다."
                : "후보자와 선택한 회사 담당자를 참조로 연결하는 메일을 발송합니다. 이후부터는 직접 소통하실 수 있습니다."}
            </div>
          </div>
          <div
            className={cx(
              "space-y-3 transition-opacity",
              contactDirectly && "opacity-45"
            )}
          >
            {selectableMembers.length > 0 ? (
              <div>
                <div className="text-[12px] font-medium text-neutral-muted">
                  함께 연결할 멤버
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectableMembers.map((member) => {
                    const email = member.email.trim().toLowerCase();
                    const selected = selectedEmailSet.has(email);
                    return (
                      <MuteButton
                        aria-pressed={selected}
                        className="max-w-full gap-1 rounded-full"
                        disabled={pending || contactDirectly}
                        key={member.userId}
                        onClick={() => toggleMemberEmail(email)}
                        size="md"
                        title={`${member.name || email} · ${email}`}
                        variant={selected ? "primary" : "default"}
                      >
                        <span className="max-w-24 truncate">
                          {member.name || email.split("@")[0]}
                        </span>
                        <span
                          className={cx(
                            "max-w-40 truncate text-[11px]",
                            selected
                              ? "text-neutral-00/75"
                              : "text-neutral-soft"
                          )}
                        >
                          {email}
                        </span>
                        {selected ? (
                          <X className="size-3" />
                        ) : (
                          <Plus className="size-3" />
                        )}
                      </MuteButton>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <label className="block">
              <span className="text-[12px] font-medium text-neutral-muted">
                연결받을 이메일
              </span>
              <Textarea
                name="introEmails"
                value={introEmailText}
                onChange={(event) => {
                  setIntroEmailText(event.target.value);
                  if (error) setError("");
                }}
                rows={3}
                placeholder="name@company.com"
                className="mt-1.5 min-h-[84px] px-3 py-2 text-[13px] leading-5"
                disabled={pending || contactDirectly}
              />
              <p className="mt-1.5 text-[11px] leading-5 text-neutral-soft">
                멤버를 누르거나 이메일을 직접 입력해 여러 명을 포함할 수
                있습니다.
              </p>
            </label>
          </div>
          <div className="border-y border-neutral-1000-a05 py-3">
            <Checkbox
              checked={contactDirectly}
              disabled={pending}
              helperText="수락은 반영하되 후보자와 담당자를 연결하는 이메일은 보내지 않습니다."
              label="직접 연락하겠습니다."
              onChange={(event) => {
                setContactDirectly(event.target.checked);
                if (error) setError("");
              }}
              size="small"
            />
          </div>
          <label className="block">
            <span className="text-[12px] font-medium text-neutral-muted">
              수락 이유
            </span>
            <Textarea
              key={`${open}:acceptReason`}
              name="acceptReason"
              rows={3}
              placeholder="예: 후보자의 ML infra 경험이 현재 역할과 잘 맞습니다."
              className="mt-1.5 min-h-[84px] px-3 py-2 text-[13px] leading-5"
              disabled={pending}
            />
            <p className="mt-1.5 text-[11px] leading-5 text-neutral-soft">
              필수는 아니지만 이유를 적어주신다면 다음 추천에 반영할 수
              있습니다.
            </p>
          </label>
          {error ? (
            <div className="text-[12px] text-critical" role="alert">
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
  onSubmit: (args: {
    note: string;
    reason: OrgStopReason;
  }) => void | Promise<void>;
  open: boolean;
  pending?: boolean;
  showReasonChoice?: boolean;
}) {
  const [reason, setReason] = useState<OrgStopReason>(defaultReason);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trimmedNote = String(formData.get("stopNote") ?? "").trim();
    if (!trimmedNote) {
      setError("이유를 입력해 주세요.");
      return;
    }
    const selectedReason = reason;
    setError("");
    try {
      await onSubmit({ note: trimmedNote, reason: selectedReason });
      setReason(defaultReason);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "요청을 처리하지 못했습니다. 다시 시도해 주세요."
      );
    }
  };
  const handleClose = () => {
    setReason(defaultReason);
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent
        className="z-[90] max-w-md gap-4 rounded-lg p-6"
        overlayClassName="z-[80]"
      >
        <DialogHeader>
          <DialogTitle className="text-[18px]">프로세스 종료</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-2 text-[13px] leading-5 text-neutral-primary">
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
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-neutral-muted">
              이유
            </span>
            <Textarea
              key={`${open}:${candidateName}`}
              name="stopNote"
              onChange={(event) => {
                if (error) setError("");
              }}
              rows={5}
              required
              placeholder="거절 이유를 입력해 주세요. 해당 이유는 유저에게 전달되지 않고, 다음번에 더 적합한 인재를 연결해주기 위해 Harper가 참고합니다."
              className="min-h-[120px] px-3 py-2 text-[13px] leading-5"
              disabled={pending}
            />
          </label>
          {error ? (
            <div className="text-[12px] text-critical" role="alert">
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
