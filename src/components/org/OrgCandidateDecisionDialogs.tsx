import { FormEvent, useId, useState } from "react";
import { ChevronRight, LoaderCircle, Plus, X } from "lucide-react";
import { motion } from "motion/react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
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
  allowContactDirectly = false,
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
  allowContactDirectly?: boolean;
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
  const acceptFormId = useId();
  const emailPreviewId = useId();
  const normalizedCandidateEmail = candidateEmail?.trim().toLowerCase() ?? "";
  const getDefaultEmailText = () => {
    const email = defaultEmail?.trim().toLowerCase() ?? "";
    return email === normalizedCandidateEmail ? "" : email;
  };
  const [contactDirectly, setContactDirectly] = useState(
    allowContactDirectly && defaultContactDirectly
  );
  const usesDirectContact = allowContactDirectly && contactDirectly;
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
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
    setContactDirectly(allowContactDirectly && defaultContactDirectly);
    setEmailPreviewOpen(false);
    setError("");
    setIntroEmailText(getDefaultEmailText());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const acceptReason =
      String(formData.get("acceptReason") ?? "").trim() || null;
    if (!usesDirectContact && !normalizedCandidateEmail) {
      setError("후보자 이메일이 없어 소개 이메일을 보낼 수 없어요.");
      return;
    }
    if (!usesDirectContact && introEmails.length === 0) {
      setError("Email intro에는 회사 담당자 이메일이 1개 이상 필요해요.");
      return;
    }
    setError("");
    try {
      await onSubmit({
        acceptReason,
        contactDirectly: usesDirectContact,
        introEmails: usesDirectContact ? [] : introEmails,
      });
      resetForm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "후보자 연결 결과를 확인하지 못했어요. 바로 다시 시도하지 말고 현재 상태와 메일을 먼저 확인해 주세요."
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
    if (nextContactDirectly && !allowContactDirectly) return;
    setContactDirectly(nextContactDirectly);
    if (nextContactDirectly) setEmailPreviewOpen(false);
    if (error) setError("");
  };

  return (
    <TalentCareerModal
      bodyClassName="max-h-[calc(100dvh-176px)] overflow-y-auto bg-bg-floating px-5 py-4 sm:px-6"
      closeOnBackdrop={!pending}
      description={
        usesDirectContact
          ? "후보자를 연결됨으로 표시하지만 Harper는 이메일을 보내지 않아요. 회사가 후보자에게 직접 연락해야 해요."
          : "Harper가 후보자와 선택한 담당자에게 소개 이메일을 바로 보내요. 보낸 이메일은 회수할 수 없어요."
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <MuteButton
            type="button"
            variant="default"
            size="md"
            onClick={handleClose}
            disabled={pending}
          >
            취소
          </MuteButton>
          <MuteButton
            disabled={
              pending ||
              (!usesDirectContact &&
                (!normalizedCandidateEmail || introEmails.length === 0))
            }
            form={acceptFormId}
            size="md"
            type="submit"
            variant="positive"
          >
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {usesDirectContact ? "Mark as connected" : "Send intro & connect"}
          </MuteButton>
        </div>
      }
      footerClassName="border-t border-neutral-1000-a05 bg-bg-floating px-5 py-4 sm:px-6"
      headerClassName="bg-bg-floating px-5 py-4 sm:px-6"
      mobileBottomSheet
      onClose={() => {
        if (!pending) handleClose();
      }}
      open={open}
      panelClassName="max-w-lg border-neutral-1000-a05 bg-bg-floating"
      showCloseButton={!pending}
      title="Connect candidate"
    >
      <form
        className="mt-0 space-y-4"
        id={acceptFormId}
        onSubmit={handleSubmit}
      >
        {allowContactDirectly ? (
          <div
            aria-label="연결 방식"
            className="relative grid h-10 grid-cols-2 rounded-full bg-neutral-1000-a05 p-1"
            role="tablist"
          >
            <motion.div
              animate={{ x: usesDirectContact ? "100%" : "0%" }}
              className="absolute bottom-1 left-1 top-1 w-[calc(50%_-_4px)] rounded-full bg-black shadow-sm"
              initial={false}
              transition={{ type: "spring", stiffness: 440, damping: 38 }}
            />
            <button
              aria-selected={!usesDirectContact}
              className={cn(
                "relative z-10 rounded-full text-[13px] font-medium transition-colors",
                usesDirectContact ? "text-neutral-muted" : "text-white"
              )}
              disabled={pending}
              onClick={() => selectConnectionMode(false)}
              role="tab"
              type="button"
            >
              Email intro
            </button>
            <button
              aria-selected={usesDirectContact}
              className={cn(
                "relative z-10 rounded-full text-[13px] font-medium transition-colors",
                usesDirectContact ? "text-white" : "text-neutral-muted"
              )}
              disabled={pending}
              onClick={() => selectConnectionMode(true)}
              role="tab"
              type="button"
            >
              Direct contact
            </button>
          </div>
        ) : null}

        {usesDirectContact ? (
          <div className="rounded-md bg-bg-weak p-3" role="tabpanel">
            <div className="text-[13px] font-medium text-neutral-primary">
              Direct contact
            </div>
            <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
              연결됨 상태만 저장하고 Harper는 소개 이메일을 보내지 않아요. 회사
              담당자가 후보자에게 직접 연락해 다음 단계를 진행해 주세요.
            </p>
          </div>
        ) : (
          <section
            aria-label="Email intro"
            className="overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-default"
            role="tabpanel"
          >
            <div className="border-b border-neutral-1000-a05 px-4 py-3 text-[13px] font-medium text-neutral-primary">
              Email intro
            </div>
            <div className="space-y-3 px-4 py-3">
              <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-[12px] leading-5 sm:grid-cols-[96px_minmax(0,1fr)]">
                <div className="text-neutral-soft">받는 사람</div>
                <div className="min-w-0 text-neutral-primary">
                  {normalizedCandidateEmail ? (
                    <>
                      <span>{candidateName}</span>{" "}
                      <span className="break-all text-neutral-muted">
                        &lt;{normalizedCandidateEmail}&gt;
                      </span>
                    </>
                  ) : (
                    <span className="text-critical">후보자 이메일 없음</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-[12px] leading-5 sm:grid-cols-[96px_minmax(0,1fr)]">
                <div className="text-neutral-soft">Recipients</div>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {introEmails.map((email) => (
                    <MuteButton
                      aria-label={`${memberNameByEmail.get(email) || email} 소개 메일에서 제외`}
                      className="h-7 max-w-full gap-1 rounded-full"
                      disabled={pending}
                      key={email}
                      onClick={() => toggleMemberEmail(email)}
                      size="sm"
                      title={`${memberNameByEmail.get(email) || email} · ${email}`}
                      variant="default"
                    >
                      <span className="max-w-24 truncate">
                        {memberNameByEmail.get(email) || email.split("@")[0]}
                      </span>
                      <span className="hidden max-w-40 truncate text-[11px] text-neutral-soft sm:inline">
                        {email}
                      </span>
                      <X className="size-3" />
                    </MuteButton>
                  ))}
                  {selectableMembers
                    .filter(
                      (member) =>
                        !selectedEmailSet.has(member.email.trim().toLowerCase())
                    )
                    .map((member) => {
                      const email = member.email.trim().toLowerCase();
                      return (
                        <MuteButton
                          aria-label={`${member.name || email} 소개 메일에 추가`}
                          className="h-7 max-w-full gap-1 rounded-full border-dashed text-neutral-muted"
                          disabled={pending}
                          key={member.userId}
                          onClick={() => toggleMemberEmail(email)}
                          size="sm"
                          title={`${member.name || email} · ${email}`}
                          variant="default"
                        >
                          <Plus className="size-3" />
                          <span className="max-w-24 truncate">
                            {member.name || email.split("@")[0]}
                          </span>
                        </MuteButton>
                      );
                    })}
                  {introEmails.length === 0 ? (
                    <span className="text-critical">
                      담당자를 1명 이상 선택해 주세요.
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-[12px] leading-5 sm:grid-cols-[96px_minmax(0,1fr)]">
                <div className="text-neutral-soft">제목</div>
                <div
                  className="line-clamp-2 min-w-0 text-neutral-primary"
                  title={introSubject}
                >
                  {introSubject}
                </div>
              </div>

              <div className="border-t border-neutral-1000-a05 pt-2">
                <MuteButton
                  aria-controls={emailPreviewId}
                  aria-expanded={emailPreviewOpen}
                  className="-ml-2 text-neutral-muted"
                  onClick={() =>
                    setEmailPreviewOpen((currentOpen) => !currentOpen)
                  }
                  size="sm"
                  variant="transparent"
                >
                  메일 내용 보기
                  <ChevronRight
                    className={cn(
                      "size-3.5 transition-transform",
                      emailPreviewOpen && "rotate-90"
                    )}
                  />
                </MuteButton>
                {emailPreviewOpen ? (
                  <div
                    className="mt-1 rounded-md bg-bg-weak px-3 py-2.5 text-[12px] leading-5 text-neutral-muted"
                    id={emailPreviewId}
                  >
                    후보자와 회사 담당자를 소개하고 역할과 추천 이유를 전하는
                    이메일이 전송 시 작성돼요. 전송 후에는 이 이메일에서 바로
                    대화를 이어갈 수 있으며, 보낸 이메일은 회수할 수 없어요.
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        )}

        <label className="block">
          <span className="text-[12px] font-medium text-neutral-primary">
            Connection note{" "}
            <span className="font-normal text-neutral-soft">· 선택</span>
          </span>
          <Textarea
            key={`${open}:acceptReason`}
            name="acceptReason"
            rows={3}
            placeholder="예: ML infra 경험이 이번 역할과 특히 잘 맞아요."
            className="mt-1.5 min-h-24 px-3 py-2 text-[13px] leading-5"
            disabled={pending}
          />
          <p className="mt-1 text-[12px] leading-5 text-neutral-soft">
            {usesDirectContact
              ? "작성해주시면 다음 후보 추천에 반영됩니다."
              : "작성해주시면 소개 메일과 다음 후보 추천에 반영됩니다."}
          </p>
        </label>
        {error ? (
          <div className="text-[12px] text-critical" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </TalentCareerModal>
  );
}

export function StopCandidateDialog({
  candidateName,
  connectionStarted = false,
  onClose,
  onSubmit,
  open,
  pending,
}: {
  candidateName: string;
  connectionStarted?: boolean;
  onClose: () => void;
  onSubmit: (args: { note: string | null }) => void | Promise<void>;
  open: boolean;
  pending?: boolean;
}) {
  const stopNoteId = useId();
  const stopNoteHelpId = useId();
  const stopReasonLabelId = useId();
  const stopFormId = useId();
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
  const normalizedCandidateName = candidateName.trim() || "후보자";
  const politeCandidateName = normalizedCandidateName.endsWith("님")
    ? normalizedCandidateName
    : `${normalizedCandidateName}님`;

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
          : "종료 결과를 확인하지 못했어요. 바로 다시 시도하지 말고 후보자의 현재 상태를 먼저 확인해 주세요."
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
    <TalentCareerModal
      bodyClassName="bg-bg-floating px-5 py-5 sm:px-6"
      closeOnBackdrop={!pending}
      footer={
        <div className="flex items-center justify-end gap-2">
          <MuteButton
            disabled={pending}
            onClick={handleClose}
            size="lg"
            type="button"
          >
            취소
          </MuteButton>
          <MuteButton
            disabled={pending}
            form={stopFormId}
            size="lg"
            type="submit"
            variant={connectionStarted ? "warn" : "critical"}
          >
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {connectionStarted ? "End connection" : "Reject candidate"}
          </MuteButton>
        </div>
      }
      mobileBottomSheet
      onClose={() => {
        if (!pending) handleClose();
      }}
      open={open}
      panelClassName="max-w-md border-neutral-1000-a05 bg-bg-floating"
      showCloseButton={!pending}
      title={connectionStarted ? "End connection" : "Reject candidate"}
    >
      <form className="space-y-4" id={stopFormId} onSubmit={handleSubmit}>
        <div className="space-y-2 text-[13px] leading-5 text-neutral-primary">
          <div className="font-medium">{normalizedCandidateName}</div>
          <div className="text-neutral-muted">
            {connectionStarted
              ? "이미 보낸 소개 이메일이나 회사에서 시작한 연락은 회수할 수 없어요. 현재 연결을 종료하면 Harper가 후보자에게 회사가 프로세스를 종료했다는 안내를 보내요. 이미 보이거나 전달된 안내도 회수할 수 없어요."
              : `${politeCandidateName}에게 회사가 이번 연결을 진행하지 않기로 했다는 종료 결정이 표시되고 Harper가 이를 안내해요. 실행 후 후보자에게 보이거나 전달된 안내는 회수할 수 없어요.`}
          </div>
        </div>
        <div className="space-y-2">
          <div
            className="text-[12px] font-medium text-neutral-primary"
            id={stopReasonLabelId}
          >
            연결을 거절하는 이유{" "}
            <span className="font-normal text-neutral-soft">· 선택</span>
          </div>
          <div
            aria-labelledby={stopReasonLabelId}
            className="flex flex-wrap gap-1.5"
            role="group"
          >
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
          <Textarea
            aria-describedby={stopNoteHelpId}
            aria-labelledby={stopReasonLabelId}
            id={stopNoteId}
            name="stopNote"
            value={stopNote}
            onChange={(event) => {
              setStopNote(event.target.value);
              if (error) setError("");
            }}
            rows={4}
            placeholder="예: 현재 찾는 역할보다 경력이 조금 주니어해요."
            className="min-h-24 px-3 py-2 text-[13px] leading-5"
            disabled={pending}
          />
          <p
            className="text-[12px] leading-5 text-neutral-soft"
            id={stopNoteHelpId}
          >
            다음 추천을 개선하는 데 참고합니다. 후보자에게는 공유되지 않아요.
          </p>
        </div>
        {error ? (
          <div className="text-[12px] text-critical" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </TalentCareerModal>
  );
}
