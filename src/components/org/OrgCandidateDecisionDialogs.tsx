import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { FormEvent, useId, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ORG_STOP_REASONS,
  extractCustomOrgStopReasons,
  useOrgStopReasonStore,
} from "@/store/useOrgStopReasonStore";

const CUSTOM_REASON = "__custom__";

export function StopCandidateDialog({
  candidateName,
  candidateNames,
  connectionStarted = false,
  defaultNote,
  mode = "reject",
  onClose,
  onSubmit,
  open,
  pending,
  suggestedReasons,
}: {
  candidateName?: string;
  /** Several candidates: each gets its own reason, one closing-note choice. */
  candidateNames?: string[];
  connectionStarted?: boolean;
  /** Reason filled in when the dialog opens (one per candidate, or shared). */
  defaultNote?: string | string[];
  /** `pass` closes a suggested candidate who was never contacted. */
  mode?: "reject" | "pass";
  onClose: () => void;
  onSubmit: (args: {
    note: string | null;
    /** One reason per candidate, in the order of `candidateNames`. */
    notes: string[];
    notifyCandidateOnClosure: boolean;
  }) => void | Promise<void>;
  open: boolean;
  pending?: boolean;
  /** Reasons from each candidate's own evaluation, offered first. */
  suggestedReasons?: string[][];
}) {
  const { locale, c } = useOrgLocale();
  const count = Math.max(1, candidateNames?.length ?? 1);
  const defaultNoteAt = (index: number) =>
    (Array.isArray(defaultNote) ? defaultNote[index] : defaultNote) ?? "";
  const stopFormId = useId();
  const stopReasonLabelId = useId();
  const previewId = useId();
  const [error, setError] = useState("");
  const [stopNote, setStopNote] = useState(defaultNoteAt(0));
  // With several candidates each row keeps its own reason.
  const [rowNotes, setRowNotes] = useState<string[]>(() =>
    Array.from({ length: count }, (_, index) => defaultNoteAt(index))
  );
  const [rowCustom, setRowCustom] = useState<boolean[]>(() =>
    Array.from({ length: count }, () => false)
  );
  const [notifyCandidateOnClosure, setNotifyCandidateOnClosure] =
    useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const savedReasons = useOrgStopReasonStore((state) => state.savedReasons);
  const rememberReasons = useOrgStopReasonStore(
    (state) => state.rememberReasons
  );
  const pass = mode === "pass";
  const stopReasonOptions = Array.from(
    new Set([
      ...(pass
        ? [
            c("경력·역량", "Experience / skills"),
            c("역할 적합도", "Role fit"),
            c("근무 조건", "Working preferences"),
            c("채용 시점", "Timing"),
          ]
        : []),
      ...DEFAULT_ORG_STOP_REASONS,
      ...savedReasons,
    ])
  );
  const suggestionsAt = (index: number) => suggestedReasons?.[index] ?? [];
  const optionsAt = (index: number) =>
    Array.from(new Set([...suggestionsAt(index), ...stopReasonOptions]));
  const selectedStopReasonSet = new Set(
    stopNote
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const names = (candidateNames ?? [candidateName ?? ""])
    .map((name) => name.trim())
    .filter(Boolean);
  const needsConfirmation = count > 1;
  const nameSummary =
    names.length > 3
      ? c("{p0} 외 {p1}명", "{p0} and {p1} more", {
          p0: names.slice(0, 3).join(", "),
          p1: names.length - 3,
        })
      : names.join(", ") || c("후보자", "Candidate");
  const title = pass
    ? c(
        "{p0}명 Pass",
        count === 1 ? "Pass 1 candidate" : "Pass {p0} candidates",
        {
          p0: count,
        }
      )
    : connectionStarted
      ? c(
          "{p0}명 연결 종료",
          count === 1 ? "End 1 connection" : "End {p0} connections",
          { p0: count }
        )
      : c(
          "{p0}명 연결 거절",
          count === 1 ? "Reject 1 candidate" : "Reject {p0} candidates",
          { p0: count }
        );
  const submitLabel = pass
    ? "Pass"
    : connectionStarted
      ? c("연결 종료", "End connection")
      : c("연결 거절", "Reject");

  const reset = () => {
    setError("");
    setStopNote(defaultNoteAt(0));
    setRowNotes(
      Array.from({ length: count }, (_, index) => defaultNoteAt(index))
    );
    setRowCustom(Array.from({ length: count }, () => false));
    setNotifyCandidateOnClosure(true);
    setPreviewOpen(false);
    setConfirmed(false);
  };
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // A reason is optional; an empty one is sent as none.
    const notes =
      count > 1 ? rowNotes.map((note) => note.trim()) : [stopNote.trim()];
    if (needsConfirmation && !confirmed) return;
    const customReasons = extractCustomOrgStopReasons(notes.join("\n"), [
      ...stopReasonOptions,
      ...(suggestedReasons ?? []).flat(),
    ]);
    setError("");
    try {
      await onSubmit({
        note: count > 1 ? null : notes[0] || null,
        notes,
        notifyCandidateOnClosure: !pass && notifyCandidateOnClosure,
      });
      rememberReasons(customReasons);
      reset();
    } catch (submitError) {
      setError(
        localizedOrgErrorMessage(
          submitError,
          locale,
          c(
            "종료 결과를 확인하지 못했어요. 바로 다시 시도하지 말고 후보자의 현재 상태를 먼저 확인해 주세요.",
            "We couldn't confirm whether the process ended. Check the candidate's current status before trying again."
          )
        )
      );
    }
  };
  const handleClose = () => {
    reset();
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
      description={count > 1 ? undefined : nameSummary}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {needsConfirmation ? (
            <label className="mr-1 inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-neutral-muted">
              <Checkbox
                checked={confirmed}
                className="size-3 rounded-[3px] bg-size-[10px_10px] checked:border-neutral-700 checked:bg-neutral-700"
                disabled={pending}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {pass
                ? c("{p0}명 모두 Pass할게요", "Pass all {p0}", { p0: count })
                : connectionStarted
                  ? c("{p0}명 모두 종료할게요", "End all {p0}", { p0: count })
                  : c("{p0}명 모두 거절할게요", "Reject all {p0}", {
                      p0: count,
                    })}
            </label>
          ) : null}
          <MuteButton disabled={pending} onClick={handleClose} type="button">
            {c("취소", "Cancel")}
          </MuteButton>
          <MuteButton
            disabled={pending || (needsConfirmation && !confirmed)}
            form={stopFormId}
            type="submit"
            variant={pass ? "dark" : "warn"}
          >
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
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
      title={title}
    >
      <form className="space-y-4" id={stopFormId} onSubmit={handleSubmit}>
        <div className="space-y-2">
          <div
            className="text-[12px] text-neutral-muted"
            id={stopReasonLabelId}
          >
            {c("사유", "Reason")}
            <span className="text-neutral-soft">
              {" · "}
              {c(
                "선택 · 다음 추천에만 쓰고 후보자에게는 공유하지 않아요",
                "Optional · used for future recommendations, never shared with the candidate"
              )}
            </span>
          </div>
          {count > 1 ? (
            <ul aria-labelledby={stopReasonLabelId} className="space-y-2">
              {names.map((name, index) => {
                const note = rowNotes[index] ?? "";
                const custom =
                  rowCustom[index] ||
                  (note !== "" && !optionsAt(index).includes(note));
                return (
                  <li key={`${name}:${index}`}>
                    <div className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-start gap-3">
                      <span className="truncate pt-1.5 text-[13px] leading-5 text-neutral-primary">
                        {name}
                      </span>
                      <Select
                        disabled={pending}
                        onValueChange={(value) => {
                          const picked = String(value);
                          setRowCustom((rows) =>
                            rows.map((row, at) =>
                              at === index ? picked === CUSTOM_REASON : row
                            )
                          );
                          setRowNotes((rows) =>
                            rows.map((row, at) =>
                              at === index
                                ? picked === CUSTOM_REASON
                                  ? ""
                                  : picked
                                : row
                            )
                          );
                          if (error) setError("");
                        }}
                        value={custom ? CUSTOM_REASON : note || null}
                      >
                        <SelectTrigger
                          aria-label={c("{p0} 사유", "Reason for {p0}", {
                            p0: name,
                          })}
                          className="h-auto min-h-8 w-full py-1.5 text-left text-[13px] leading-5 data-[size=default]:h-auto"
                        >
                          <SelectValue className="!whitespace-normal [overflow-wrap:anywhere]">
                            {custom ? (
                              c("직접 입력", "Write a reason")
                            ) : note ? (
                              note
                            ) : (
                              <span className="text-neutral-soft">
                                {c("사유 고르기", "Choose a reason")}
                              </span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent align="end">
                          <SelectItem value={CUSTOM_REASON}>
                            {c("직접 입력", "Write a reason")}
                          </SelectItem>
                          <SelectSeparator />
                          {suggestionsAt(index).length ? (
                            <>
                              <SelectGroup>
                                <SelectLabel>
                                  {c("Harper의 추천", "Harper's suggestions")}
                                </SelectLabel>
                                {suggestionsAt(index).map((reason) => (
                                  <SelectItem key={reason} value={reason}>
                                    {reason}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                              <SelectSeparator />
                            </>
                          ) : null}
                          {stopReasonOptions
                            .filter(
                              (reason) => !suggestionsAt(index).includes(reason)
                            )
                            .map((reason) => (
                              <SelectItem key={reason} value={reason}>
                                {reason}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {custom ? (
                      <Input
                        aria-label={c(
                          "{p0} 사유 직접 입력",
                          "Reason for {p0}",
                          {
                            p0: name,
                          }
                        )}
                        className="mt-1.5 h-8 text-[13px]"
                        disabled={pending}
                        maxLength={500}
                        onChange={(event) => {
                          const value = event.target.value;
                          setRowNotes((rows) =>
                            rows.map((row, at) => (at === index ? value : row))
                          );
                          if (error) setError("");
                        }}
                        placeholder={c("직접 입력", "Write a reason")}
                        value={note}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
              <div
                aria-labelledby={stopReasonLabelId}
                className="flex flex-wrap gap-1.5"
                role="group"
              >
                {optionsAt(0).map((reason) => {
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
                aria-labelledby={stopReasonLabelId}
                className="min-h-16 px-3 py-2 text-[13px] leading-5"
                disabled={pending}
                name="stopNote"
                onChange={(event) => {
                  setStopNote(event.target.value);
                  if (error) setError("");
                }}
                placeholder={c("직접 입력", "Write a reason")}
                rows={2}
                value={stopNote}
              />
            </>
          )}
        </div>
        {pass ? null : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={notifyCandidateOnClosure}
                disabled={pending}
                label={c(
                  "Harper가 종료 안내 보내기",
                  "Have Harper send a closing note"
                )}
                onChange={(event) =>
                  setNotifyCandidateOnClosure(event.target.checked)
                }
              />
              <MuteButton
                aria-controls={previewId}
                aria-expanded={previewOpen}
                className="text-[12px] text-blue-500 hover:text-blue-700"
                onClick={() => setPreviewOpen((value) => !value)}
                size="sm"
                variant="transparent"
              >
                {c("미리보기", "Preview")}
              </MuteButton>
            </div>
            {previewOpen ? (
              <div
                className="rounded-md border border-neutral-1000-a05 bg-bg-weak px-3 py-2.5 text-[12px] leading-5 text-neutral-700"
                id={previewId}
              >
                {notifyCandidateOnClosure
                  ? c(
                      "후보자 화면에 회사가 더 진행하지 않기로 했다고 표시되고, Harper가 후보자에게 종료를 안내해요. 남긴 사유는 전하지 않아요.",
                      "The candidate sees that your team isn't moving forward, and Harper lets them know the process has ended. Your reason isn't shared."
                    )
                  : c(
                      "후보자 화면에 종료 상태만 표시되고, Harper가 따로 안내하지는 않아요.",
                      "The candidate only sees the closed status. Harper won't send a separate note."
                    )}
                {connectionStarted
                  ? ` ${c(
                      "이미 보낸 소개 메일이나 직접 연락은 회수되지 않아요.",
                      "Intro emails and messages already sent can't be recalled."
                    )}`
                  : null}
              </div>
            ) : null}
          </div>
        )}
        {error ? (
          <div className="text-[12px] text-critical" role="alert">
            {error}
          </div>
        ) : null}
      </form>
    </TalentCareerModal>
  );
}
