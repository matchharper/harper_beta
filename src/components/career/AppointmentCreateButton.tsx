import { useId, useRef, useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { CalendarPlus, Loader2 } from "lucide-react";
import { ko, enUS } from "date-fns/locale";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { useAuthStore } from "@/store/useAuthStore";
import type { TalentMeetingSchedule } from "@/lib/career/meetings/types";
import { mergeCreatedAppointment } from "@/lib/career/meetingDisplay";
import type { CareerHistoryOpportunity } from "./types";

type Props = {
  roleId: string;
  positionTitle: string;
  companyName: string;
  onCreated?: (schedule: TalentMeetingSchedule) => void;
  subtle?: boolean;
};

function AppointmentForm({
  roleId,
  onCreated,
  onClose,
  onPendingChange,
}: Props & {
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const formId = useId();
  const { fetchWithAuth } = useCareerApi();
  const userId = useAuthStore((s) => s.session?.user.id);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date>();
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ body: string; id: string } | null>(null);
  const submitting = useRef(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current || !title.trim() || !date) return;
    const calendarDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const input = {
      roleId,
      title: title.trim(),
      calendarDate,
      startsAt: `${calendarDate}T00:00:00+09:00`,
      endsAt: null,
      content,
      timezone: "Asia/Seoul",
    };
    const body = JSON.stringify(input);
    if (request.current?.body !== body)
      request.current = { body, id: crypto.randomUUID() };
    submitting.current = true;
    setPending(true);
    onPendingChange(true);
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
      // Saved stage pages live in this history cache too. Refetching its query only
      // reloads New Opportunities, so update every cached occurrence of this role.
      if (userId)
        queryClient.setQueriesData<
          InfiniteData<{ items: CareerHistoryOpportunity[] }>
        >({ queryKey: ["career-history-opportunities", userId] }, (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.roleId === roleId
                      ? mergeCreatedAppointment(item, schedule)
                      : item
                  ),
                })),
              }
            : data
        );
      onCreated?.(schedule);
      void queryClient.invalidateQueries({
        queryKey: ["career-meeting-schedules", userId],
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
      onPendingChange(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <label
        htmlFor={`${formId}-title`}
        className="grid gap-1.5 text-[13px] text-neutral-primary"
      >
        {t("career.meetings.event_label", "일정")}
        <Input
          id={`${formId}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          disabled={pending}
        />
      </label>
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        locale={locale === "ko" ? ko : enUS}
        disabled={pending}
        className="rounded-lg bg-bg-floating p-0"
      />
      <label
        htmlFor={`${formId}-content`}
        className="grid gap-1.5 text-[13px] text-neutral-primary"
      >
        {t("career.meetings.content_label", "내용")}
        <Textarea
          id={`${formId}-content`}
          rows={2}
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
      <MuteButton
        type="submit"
        variant="dark"
        className="w-full"
        disabled={pending || !title.trim() || !date}
      >
        {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {t("career.meetings.save", "일정 저장")}
      </MuteButton>
    </form>
  );
}

export default function AppointmentCreateButton(props: Props) {
  const t = useCareerT();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const changeOpen = (next: boolean) => {
    if (!pending) setOpen(next);
  };
  const trigger = (
    <MuteButton
      onClick={mobile ? () => setOpen(true) : undefined}
      size="sm"
      variant={props.subtle ? "transparent" : "default"}
      className="shrink-0"
    >
      <CalendarPlus aria-hidden strokeWidth={1.5} className="size-3.5" />
      {t("career.meetings.add", "일정 추가")}
    </MuteButton>
  );
  const form = (
    <AppointmentForm
      {...props}
      onPendingChange={setPending}
      onClose={() => setOpen(false)}
    />
  );
  return (
    <div
      data-career-card-action="true"
      className="shrink-0"
      onClick={(event) => event.stopPropagation()}
    >
      {mobile ? (
        <>
          {trigger}
          <TalentCareerModal
            open={open}
            onClose={() => changeOpen(false)}
            mobileBottomSheet
            ariaLabel={t("career.meetings.add", "일정 추가")}
            bodyClassName="px-5 pb-6 pt-12"
          >
            {open && form}
          </TalentCareerModal>
        </>
      ) : (
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="w-[320px] max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-4"
            aria-label={t("career.meetings.add", "일정 추가")}
          >
            {form}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
