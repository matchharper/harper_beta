import { FormEvent, useId, useState } from "react";
import { ChevronDown, LoaderCircle, Plus, X } from "lucide-react";
import { motion } from "motion/react";
import { Button, MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { OrgMember } from "@/lib/org/server";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ORG_STOP_REASONS,
  extractCustomOrgStopReasons,
  useOrgStopReasonStore,
} from "@/store/useOrgStopReasonStore";

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
  candidateEmail,
  candidateName,
  companyContactName,
  defaultContactDirectly = false,
  defaultEmail,
  members = [],
  onClose,
  onSubmit,
  open,
  pending,
  roleTitle,
}: {
  candidateEmail?: string | null;
  candidateName: string;
  companyContactName?: string | null;
  defaultContactDirectly?: boolean;
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
  roleTitle: string;
}) {
  const normalizedCandidateEmail = candidateEmail?.trim().toLowerCase() ?? "";
  const getDefaultEmailText = () => {
    const email = defaultEmail?.trim().toLowerCase() ?? "";
    return email === normalizedCandidateEmail ? "" : email;
  };
  const [contactDirectly, setContactDirectly] = useState(
    defaultContactDirectly
  );
  const [error, setError] = useState("");
  const [introEmailText, setIntroEmailText] = useState(getDefaultEmailText);
  const introEmails = parseEmailList(introEmailText);
  const selectedEmailSet = new Set(introEmails);
  const selectableMembers = members.filter(
    (member): member is typeof member & { email: string } => {
      const email = member.email?.trim().toLowerCase();
      return Boolean(email && email !== normalizedCandidateEmail);
    }
  );
  const memberNameByEmail = new Map(
    selectableMembers.map((member) => [
      member.email.trim().toLowerCase(),
      member.name?.trim() || null,
    ])
  );
  const normalizedCompanyContactName =
    companyContactName?.trim() ||
    defaultEmail?.trim().split("@")[0] ||
    "Company contact";
  const introSubject = `${
    roleTitle.trim() || "Role"
  } — Introduction: ${candidateName} & ${normalizedCompanyContactName}`;

  const resetForm = () => {
    setContactDirectly(defaultContactDirectly);
    setError("");
    setIntroEmailText(getDefaultEmailText());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const acceptReason =
      String(formData.get("acceptReason") ?? "").trim() || null;
    if (!contactDirectly && !normalizedCandidateEmail) {
      setError(
        "후보자 이메일이 없어 CC 연결 메일을 보낼 수 없습니다. 직접 연락을 선택해 주세요."
      );
      return;
    }
    if (!contactDirectly && introEmails.length === 0) {
      setError("CC로 연결하려면 회사 담당자 이메일을 1개 이상 추가해 주세요.");
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
  const updateIntroEmails = (emails: string[]) => {
    setIntroEmailText(emails.join("\n"));
    if (error) setError("");
  };
  const toggleMemberEmail = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const nextEmails = selectedEmailSet.has(normalizedEmail)
      ? introEmails.filter((item) => item !== normalizedEmail)
      : [...introEmails, normalizedEmail];
    updateIntroEmails(nextEmails);
  };
  const selectConnectionMode = (nextContactDirectly: boolean) => {
    setContactDirectly(nextContactDirectly);
    if (error) setError("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && !pending && handleClose()}
    >
      <DialogContent
        className="z-[90] max-h-[calc(100dvh-32px)] max-w-lg gap-4 overflow-y-auto rounded-lg p-6"
        overlayClassName="z-[80]"
      >
        <DialogHeader>
          <DialogTitle className="text-[18px]">후보자 연결</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            “{candidateName}” 후보자와의 연결 방식을 선택해 주세요.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-0 space-y-4">
          <div
            aria-label="연결 방식"
            className="relative grid h-10 grid-cols-2 rounded-full bg-neutral-1000-a05 p-1"
            role="tablist"
          >
            <motion.div
              animate={{ x: contactDirectly ? "100%" : "0%" }}
              className="absolute bottom-1 left-1 top-1 w-[calc(50%_-_4px)] rounded-full bg-black shadow-sm"
              initial={false}
              transition={{ type: "spring", stiffness: 440, damping: 38 }}
            />
            <button
              aria-selected={!contactDirectly}
              className={cn(
                "relative z-10 rounded-full text-[13px] font-medium transition-colors",
                contactDirectly ? "text-neutral-muted" : "text-white"
              )}
              disabled={pending}
              onClick={() => selectConnectionMode(false)}
              role="tab"
              type="button"
            >
              CC로 연결
            </button>
            <button
              aria-selected={contactDirectly}
              className={cn(
                "relative z-10 rounded-full text-[13px] font-medium transition-colors",
                contactDirectly ? "text-white" : "text-neutral-muted"
              )}
              disabled={pending}
              onClick={() => selectConnectionMode(true)}
              role="tab"
              type="button"
            >
              직접 연락
            </button>
          </div>

          {contactDirectly ? (
            <div className="rounded-md bg-bg-basement p-3" role="tabpanel">
              <div className="text-[13px] font-medium text-neutral-primary">
                회사에서 직접 연락
              </div>
              <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                수락 상태만 반영하고 Harper의 연결 메일은 발송하지 않습니다.
                담당자가 후보자에게 직접 연락해 다음 단계를 진행해 주세요.
              </p>
            </div>
          ) : (
            <div className="space-y-4" role="tabpanel">
              <p className="text-[12px] leading-5 text-neutral-muted">
                Harper가 아래 구성대로 소개 메일을 보냅니다. 이후 답장하면
                Harper 없이 후보자와 담당자끼리 바로 대화할 수 있습니다.
              </p>

              <section
                aria-label="Gmail 연결 메일 상세"
                className="bg-white px-3 pb-0 pt-[14px] text-[#202124]"
                style={{ fontFamily: "Arial, sans-serif" }}
              >
                <div className="flex items-start">
                  <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#5634b7] text-[18px] font-normal text-white">
                    H
                  </div>
                  <div className="ml-[13px] min-w-0">
                    <div className="flex min-w-0 items-baseline gap-1">
                      <span className="shrink-0 text-[13px] font-bold leading-[18px]">
                        Harper
                      </span>
                      <span className="min-w-0 truncate text-[13px] font-normal leading-[18px] text-[#5f6368]">
                        &lt;hello@matchharper.com&gt;
                      </span>
                    </div>
                    <div className="flex items-center text-[12px] leading-4 text-[#5f6368]">
                      <span className="truncate">
                        to {candidateName}
                        {introEmails.length > 0
                          ? `, cc ${introEmails.length}`
                          : ""}
                      </span>
                      <ChevronDown className="ml-0.5 size-3 shrink-0 fill-[#5f6368] stroke-[#5f6368]" />
                    </div>
                  </div>
                </div>

                <div className="-mt-[3px] ml-[77px] mr-3 border border-[#c6c6c6] bg-white py-[14px] pl-[46px] pr-4 shadow-[0_2px_6px_rgba(0,0,0,0.28)]">
                  <div className="grid grid-cols-[30px_minmax(0,1fr)] gap-x-[13px] gap-y-0.5 text-[13px] leading-[18px]">
                    <div className="text-right text-[#5f6368]">from:</div>
                    <div className="min-w-0 text-[#202124]">
                      <span className="font-bold">Harper</span>{" "}
                      <span className="text-[#5f6368]">
                        &lt;hello@matchharper.com&gt;
                      </span>
                    </div>

                    <div className="text-right text-[#5f6368]">to:</div>
                    <div className="min-w-0 break-words text-[#202124]">
                      {normalizedCandidateEmail ? (
                        <>
                          <span className="font-normal">{candidateName}</span>{" "}
                          <span>&lt;{normalizedCandidateEmail}&gt;</span>
                        </>
                      ) : (
                        <span className="text-critical">
                          후보자 이메일 없음
                        </span>
                      )}
                    </div>

                    <div className="text-right text-[#5f6368]">cc:</div>
                    <div className="min-w-0 break-words text-[#202124]">
                      {introEmails.length > 0 ? (
                        introEmails.map((email, index) => {
                          const memberName = memberNameByEmail.get(email);
                          return (
                            <span key={email}>
                              {index > 0 ? ", " : null}
                              {memberName ? (
                                <>
                                  <span>{memberName}</span>{" "}
                                </>
                              ) : null}
                              <span>&lt;{email}&gt;</span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-critical">
                          담당자를 1명 이상 선택해 주세요.
                        </span>
                      )}
                    </div>

                    <div className="text-right text-[#5f6368]">date:</div>
                    <div className="text-[#202124]">수락 시 즉시 발송</div>

                    <div className="text-right text-[#5f6368]">subject:</div>
                    <div
                      className="min-w-0 truncate whitespace-nowrap text-[#202124]"
                      title={introSubject}
                    >
                      {introSubject}
                    </div>
                  </div>
                </div>
              </section>

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
                          className="h-7 max-w-full gap-1 rounded-full"
                          disabled={pending}
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
                            className={cn(
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
            </div>
          )}

          <label className="block">
            <span className="text-[12px] font-medium text-neutral-muted">
              수락 이유 (선택)
            </span>
            <Textarea
              key={`${open}:acceptReason`}
              name="acceptReason"
              rows={3}
              placeholder="예: 후보자의 ML infra 경험이 현재 역할과 잘 맞습니다."
              className="mt-1.5 min-h-[84px] px-3 py-2 text-[13px] leading-5"
              disabled={pending}
            />
            <p className="mt-1 text-[12px] leading-5 text-neutral-soft">
              필수는 아니지만 이유를 적어주신다면 다음 추천에 반영할 수
              있습니다. 후보자측에 공유되지 않습니다.
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
              disabled={
                pending ||
                (!contactDirectly &&
                  (!normalizedCandidateEmail || introEmails.length === 0))
              }
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
  onClose,
  onSubmit,
  open,
  pending,
}: {
  candidateName: string;
  onClose: () => void;
  onSubmit: (args: { note: string | null }) => void | Promise<void>;
  open: boolean;
  pending?: boolean;
}) {
  const stopNoteId = useId();
  const [error, setError] = useState("");
  const [stopNote, setStopNote] = useState("");
  const savedReasons = useOrgStopReasonStore((state) => state.savedReasons);
  const rememberReasons = useOrgStopReasonStore(
    (state) => state.rememberReasons
  );
  const stopReasonOptions = [...DEFAULT_ORG_STOP_REASONS, ...savedReasons];
  const selectedStopReasonSet = new Set(
    stopNote
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedNote = stopNote.trim();
    const customReasons = extractCustomOrgStopReasons(
      trimmedNote,
      stopReasonOptions
    );
    setError("");
    try {
      await onSubmit({ note: trimmedNote || null });
      rememberReasons(customReasons);
      setStopNote("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "요청을 처리하지 못했습니다. 다시 시도해 주세요."
      );
    }
  };
  const handleClose = () => {
    setError("");
    setStopNote("");
    onClose();
  };
  const toggleStopReason = (reason: string) => {
    setStopNote((currentNote) => {
      const lines = currentNote.split(/\r?\n/);
      const selected = lines.some((line) => line.trim() === reason);

      if (selected) {
        return lines.filter((line) => line.trim() !== reason).join("\n");
      }

      const separator =
        currentNote.length === 0 || currentNote.endsWith("\n") ? "" : "\n";
      return `${currentNote}${separator}${reason}\n`;
    });
    if (error) setError("");
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleClose()}>
      <DialogContent
        className="z-[90] max-w-md gap-4 rounded-lg p-6"
        overlayClassName="z-[80]"
      >
        <DialogTitle className="text-[16px]">연결받지 않기</DialogTitle>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2 text-[13px] leading-5 text-neutral-primary">
            <div>{candidateName}</div>
            <div className="text-neutral-muted">
              이 후보자는 이번에 연결받지 않습니다. 후보자에게는 Harper가 적절한
              시점에 부드럽게 안내합니다.
            </div>
          </div>
          <div className="space-y-1.5">
            <label
              className="block text-[12px] font-medium text-neutral-muted"
              htmlFor={stopNoteId}
            >
              Pass 이유 (선택)
            </label>
            <Textarea
              id={stopNoteId}
              name="stopNote"
              value={stopNote}
              onChange={(event) => {
                setStopNote(event.target.value);
                if (error) setError("");
              }}
              rows={5}
              placeholder="이유를 알려주시면 다음에 더 적합한 인재를 추천하는 데 참고합니다. 후보자에게 직접 전달되지 않습니다."
              className="mt-1 min-h-[120px] px-3 py-2 text-[13px] leading-5"
              disabled={pending}
            />
            <div className="flex flex-wrap gap-1.5" role="group">
              {stopReasonOptions.map((reason) => {
                const selected = selectedStopReasonSet.has(reason);

                return (
                  <MuteButton
                    aria-pressed={selected}
                    className={cn(
                      "text-[12px]",
                      selected && "border-neutral-800"
                    )}
                    disabled={pending}
                    key={reason}
                    onClick={() => toggleStopReason(reason)}
                    size="sm"
                    variant={selected ? "neutral" : "default"}
                  >
                    {reason}
                  </MuteButton>
                );
              })}
            </div>
          </div>
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
              연결받지 않기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
