import { useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import type { TalentMeetingSchedule } from "@/lib/career/meetings/types";

type Props = {
  roleId: string;
  positionTitle: string;
  companyName: string;
  onCreated?: (schedule: TalentMeetingSchedule) => void;
};

function AppointmentCreateModal({
  roleId,
  positionTitle,
  companyName,
  onCreated,
  onClose,
}: Props & { onClose: () => void }) {
  const t = useCareerT();
  const formId = useId();
  const { fetchWithAuth } = useCareerApi();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ body: string; id: string } | null>(null);
  const submitting = useRef(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const startsAt = new Date(start),
      endsAt = end ? new Date(end) : null;
    if (
      !title.trim() ||
      !Number.isFinite(startsAt.getTime()) ||
      (endsAt && (!Number.isFinite(endsAt.getTime()) || endsAt <= startsAt))
    ) {
      setError(
        t(
          "career.meetings.invalid_time",
          "제목과 시작 시간을 입력하고, 종료 시간은 시작 시간 이후로 선택해 주세요."
        )
      );
      return;
    }
    const input = {
      roleId,
      title: title.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt?.toISOString() ?? null,
      content,
      timezone,
    };
    const body = JSON.stringify(input);
    if (request.current?.body !== body)
      request.current = { body, id: crypto.randomUUID() };
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetchWithAuth("/api/talent/meeting-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, requestId: request.current.id }),
      });
      if (!response.ok) throw new Error("Schedule could not be saved");
      const { schedule } = (await response.json()) as {
        schedule: TalentMeetingSchedule;
      };
      onCreated?.(schedule);
      void queryClient.invalidateQueries({
        queryKey: ["career-meeting-schedules"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["career-history-opportunities"],
      });
      onClose();
    } catch {
      setError(
        t(
          "career.meetings.save_error",
          "일정을 저장하지 못했어요. 다시 시도해 주세요."
        )
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <TalentCareerModal
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      mobileBottomSheet
      panelClassName="max-w-[480px]"
      headerClassName="[&_h2]:text-sm [&_h2]:font-normal"
      bodyClassName="px-5 pb-2"
      footerClassName="flex justify-end"
      title={t("career.meetings.add", "일정 추가")}
      description={
        <span>
          {companyName} · {positionTitle}
        </span>
      }
      footer={
        <MuteButton
          variant="dark"
          size="sm"
          type="submit"
          form={formId}
          disabled={pending}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {t("career.meetings.save", "일정 저장")}
        </MuteButton>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <label
          className="grid gap-2 text-[13px] text-neutral-primary"
          htmlFor={`${formId}-title`}
        >
          {t("career.meetings.title", "일정 이름")}
          <Input
            id={`${formId}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={pending}
            autoFocus
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label
            className="grid min-w-0 gap-2 text-[13px] text-neutral-primary"
            htmlFor={`${formId}-start`}
          >
            {t("career.meetings.start", "시작")}
            <Input
              id={`${formId}-start`}
              type="datetime-local"
              className="min-w-0"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
              disabled={pending}
            />
          </label>
          <label
            className="grid min-w-0 gap-2 text-[13px] text-neutral-primary"
            htmlFor={`${formId}-end`}
          >
            {t("career.meetings.end_optional", "종료 (선택)")}
            <Input
              id={`${formId}-end`}
              type="datetime-local"
              className="min-w-0"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              disabled={pending}
            />
          </label>
        </div>
        <p className="text-xs text-neutral-muted">{timezone}</p>
        <label
          className="grid gap-2 text-[13px] text-neutral-primary"
          htmlFor={`${formId}-content`}
        >
          {t("career.meetings.notes", "준비할 내용 · 메모")}
          <Textarea
            id={`${formId}-content`}
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={pending}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        )}
      </form>
    </TalentCareerModal>
  );
}

export default function AppointmentCreateButton(props: Props) {
  const t = useCareerT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <MuteButton onClick={() => setOpen(true)} size="sm" className="shrink-0">
        <CalendarPlus aria-hidden strokeWidth={1.5} className="size-3.5" />
        {t("career.meetings.add", "일정 추가")}
      </MuteButton>
      {open && (
        <AppointmentCreateModal {...props} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
