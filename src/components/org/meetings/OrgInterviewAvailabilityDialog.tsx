import {
  ArrowLeft,
  Check,
  ChevronDown,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, getISODay } from "date-fns";
import { ko } from "date-fns/locale";
import Image from "next/image";
import { useRouter } from "next/router";
import * as Popover from "@radix-ui/react-popover";
import {
  MeetingAvailabilityCalendar,
  MeetingAvailabilitySplitLayout,
  MeetingAvailabilityTimeButton,
} from "@/components/meetings/MeetingAvailabilityLayout";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltips } from "@/components/ui/tooltip";
import {
  createDefaultMeetingAvailabilityDocument,
  getMeetingAvailabilityIntervalsForDate,
  isMeetingTimeRangeAvailable,
  ISO_WEEKDAYS,
  type IsoWeekdayKey,
  meetingAvailabilityDocumentsEqual,
  meetingDateKeyInTimezone,
  type MeetingCalendarBusyBlock,
  meetingMinutesToTime,
  type MeetingAvailabilityDocument,
  type MeetingAvailabilityInterval,
  meetingTimeToMinutes,
  normalizeMeetingAvailabilityInput,
  setMeetingTimeRangeAvailability,
} from "@/lib/meetings/availability";
import {
  calendarBusyBlockOverlapsDate,
  calendarBusyBlockOverlapsTimeRange,
} from "@/lib/meetings/calendarBusyBlocks";
import {
  useOrgMeetingAvailability,
  useSaveOrgMeetingAvailability,
  useUpdateOrgGoogleCalendarBusyBlock,
} from "@/hooks/org/useOrgMeetingAvailability";
import { useOrgGoogleCalendar } from "@/hooks/org/useOrgGoogleCalendar";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/store/useToastStore";

type PresetDays = "all" | "weekdays" | "weekends";

const PRESET_DAY_LABELS: Record<PresetDays, string> = {
  all: "매일",
  weekdays: "평일",
  weekends: "주말",
};

const START_TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) =>
  meetingMinutesToTime(index * 15)
);
const END_TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) =>
  meetingMinutesToTime((index + 1) * 15)
);
const HOUR_BLOCKS = Array.from({ length: 24 }, (_, hour) => ({
  end: meetingMinutesToTime((hour + 1) * 60),
  start: meetingMinutesToTime(hour * 60),
}));

function cloneDocument(
  availability: MeetingAvailabilityDocument
): MeetingAvailabilityDocument {
  return {
    dateOverrides: Object.fromEntries(
      Object.entries(availability.dateOverrides).map(([date, intervals]) => [
        date,
        intervals.map((interval) => ({ ...interval })),
      ])
    ),
    timezone: availability.timezone,
    weeklyRules: Object.fromEntries(
      ISO_WEEKDAYS.map(({ key }) => [
        key,
        availability.weeklyRules[key].map((interval) => ({ ...interval })),
      ])
    ) as MeetingAvailabilityDocument["weeklyRules"],
  };
}

function dateKey(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

function isoWeekdayKey(date: Date) {
  return String(getISODay(date)) as IsoWeekdayKey;
}

function calendarDateInTimezone(timezone: string) {
  const [year, month, day] = meetingDateKeyInTimezone(new Date(), timezone)
    .split("-")
    .map(Number);
  return new Date(year, month - 1, day);
}

function defaultBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
  } catch {
    return "Asia/Seoul";
  }
}

function supportedTimezones(currentTimezone: string) {
  let values: string[] = [];
  try {
    values = Intl.supportedValuesOf("timeZone");
  } catch {
    values = [
      "Asia/Seoul",
      "Asia/Tokyo",
      "Asia/Singapore",
      "Europe/London",
      "America/New_York",
      "America/Los_Angeles",
    ];
  }
  const prioritized = [
    currentTimezone,
    defaultBrowserTimezone(),
    "Asia/Seoul",
    "Asia/Tokyo",
  ];
  return [...new Set([...prioritized, ...values].filter(Boolean))];
}

function intervalListsEqual(
  left: MeetingAvailabilityInterval[],
  right: MeetingAvailabilityInterval[]
) {
  return (
    left.length === right.length &&
    left.every(
      (interval, index) =>
        interval.start === right[index]?.start &&
        interval.end === right[index]?.end
    )
  );
}

function getDefaultNewInterval(intervals: MeetingAvailabilityInterval[]) {
  const lastEnd = meetingTimeToMinutes(intervals.at(-1)?.end ?? "09:00", true);
  const startMinutes = Math.min(lastEnd ?? 9 * 60, 23 * 60);
  return {
    end: meetingMinutesToTime(Math.min(startMinutes + 60, 24 * 60)),
    start: meetingMinutesToTime(startMinutes),
  };
}

function TimeSelect({
  className,
  endOfDay = false,
  label,
  onChange,
  portalContainer,
  value,
}: {
  className?: string;
  endOfDay?: boolean;
  label: string;
  onChange: (value: string) => void;
  portalContainer: HTMLElement | null;
  value: string;
}) {
  const options = endOfDay ? END_TIME_OPTIONS : START_TIME_OPTIONS;
  return (
    <Select
      modal={false}
      onValueChange={(nextValue) => onChange(nextValue ?? value)}
      value={value}
    >
      <SelectTrigger
        aria-label={label}
        className={cn(
          "w-[92px] [&_[data-slot=select-icon]]:opacity-0 [&_[data-slot=select-icon]]:transition-opacity hover:[&_[data-slot=select-icon]]:opacity-100 focus-visible:[&_[data-slot=select-icon]]:opacity-100 data-[popup-open]:[&_[data-slot=select-icon]]:opacity-100",
          className
        )}
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        container={portalContainer}
      >
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function IntervalEditor({
  intervals,
  onChange,
  portalContainer,
}: {
  intervals: MeetingAvailabilityInterval[];
  onChange: (intervals: MeetingAvailabilityInterval[]) => void;
  portalContainer: HTMLElement | null;
}) {
  const updateInterval = (
    index: number,
    field: "end" | "start",
    value: string
  ) => {
    const next = intervals.map((interval) => ({ ...interval }));
    next[index][field] = value;
    const startMinutes = meetingTimeToMinutes(next[index].start) ?? 0;
    const endMinutes = meetingTimeToMinutes(next[index].end, true) ?? 0;
    if (field === "start" && startMinutes >= endMinutes) {
      next[index].end = meetingMinutesToTime(
        Math.min(startMinutes + 60, 24 * 60)
      );
    }
    if (field === "end" && endMinutes <= startMinutes) {
      next[index].start = meetingMinutesToTime(Math.max(endMinutes - 60, 0));
    }
    onChange(next);
  };

  return (
    <div className="grid gap-2">
      {intervals.map((interval, index) => (
        <div
          className="flex min-w-0 items-center gap-1.5"
          key={`${index}-${interval.start}-${interval.end}`}
        >
          <TimeSelect
            label={`시작 시간 ${index + 1}`}
            onChange={(value) => updateInterval(index, "start", value)}
            portalContainer={portalContainer}
            value={interval.start}
          />
          <span className="text-[12px] text-neutral-soft">–</span>
          <TimeSelect
            endOfDay
            label={`종료 시간 ${index + 1}`}
            onChange={(value) => updateInterval(index, "end", value)}
            portalContainer={portalContainer}
            value={interval.end}
          />
          <MuteButton
            aria-label={`${interval.start}부터 ${interval.end} 시간 삭제`}
            onClick={() =>
              onChange(intervals.filter((_, itemIndex) => itemIndex !== index))
            }
            size="sm"
            variant="transparent"
          >
            <Trash2 className="size-3.5" />
          </MuteButton>
          {index === intervals.length - 1 ? (
            <MuteButton
              disabled={
                intervals.length >= 8 ||
                meetingTimeToMinutes(interval.end, true) === 24 * 60
              }
              onClick={() =>
                onChange([...intervals, getDefaultNewInterval(intervals)])
              }
              size="sm"
              variant="transparent"
            >
              <Plus className="size-3.5" />
              추가
            </MuteButton>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function WeekdayRow({
  intervals,
  label,
  onChange,
  portalContainer,
}: {
  intervals: MeetingAvailabilityInterval[];
  label: string;
  onChange: (intervals: MeetingAvailabilityInterval[]) => void;
  portalContainer: HTMLElement | null;
}) {
  return (
    <div className="grid gap-3 border-t border-neutral-1000-a05 py-3 sm:grid-cols-[112px_minmax(0,1fr)]">
      <div className="pt-1">
        <span className="text-[13px] font-medium text-neutral-primary">
          {label}
        </span>
      </div>
      {intervals.length > 0 ? (
        <IntervalEditor
          intervals={intervals}
          onChange={onChange}
          portalContainer={portalContainer}
        />
      ) : (
        <div className="flex min-h-8 items-center justify-between gap-3">
          <p className="text-[13px] text-neutral-soft">가능한 시간 없음</p>
          <MuteButton
            onClick={() => onChange([{ end: "19:00", start: "10:00" }])}
            size="sm"
            variant="transparent"
          >
            <Plus className="size-3.5" />
            추가
          </MuteButton>
        </div>
      )}
    </div>
  );
}

function HourTimeline({
  calendarBusyBlocks,
  calendarBusyUpdatePending,
  dateKey,
  intervals,
  onMakeCalendarBusyBlocksAvailable,
  onToggle,
  timezone,
}: {
  calendarBusyBlocks: MeetingCalendarBusyBlock[];
  calendarBusyUpdatePending: boolean;
  dateKey: string;
  intervals: MeetingAvailabilityInterval[];
  onMakeCalendarBusyBlocksAvailable: (
    busyBlocks: MeetingCalendarBusyBlock[]
  ) => void;
  onToggle: (block: MeetingAvailabilityInterval, available: boolean) => void;
  timezone: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    const morning = container?.querySelector<HTMLElement>(
      '[data-hour-start="08:00"]'
    );
    if (!container || !morning) return;
    container.scrollTop =
      morning.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;
  }, []);

  return (
    <div
      className="max-h-[380px] overflow-y-auto pr-1 [scrollbar-gutter:stable]"
      ref={scrollRef}
    >
      <div className="grid gap-1.5 pb-1 sm:grid-cols-2">
        {HOUR_BLOCKS.map((block) => {
          const available = isMeetingTimeRangeAvailable({
            intervals,
            rangeEnd: block.end,
            rangeStart: block.start,
          });
          const blockingCalendarBusyBlocks = available
            ? calendarBusyBlocks.filter(
                (busyBlock) =>
                  busyBlock.isBlocking &&
                  calendarBusyBlockOverlapsTimeRange({
                    busyBlock,
                    dateKey,
                    rangeEnd: block.end,
                    rangeStart: block.start,
                    timezone,
                  })
              )
            : [];
          const calendarBlocked = blockingCalendarBusyBlocks.length > 0;
          const effectivelyAvailable = available && !calendarBlocked;
          const actionLabel = calendarBlocked
            ? "Google Calendar 일정에서 제외됨. 가능한 시간으로 변경"
            : available
              ? "가능 시간에서 빼기"
              : "가능 시간으로 추가";
          return (
            <MeetingAvailabilityTimeButton
              aria-label={`${block.start}부터 ${block.end}까지 ${actionLabel}`}
              aria-pressed={effectivelyAvailable}
              className={cn(
                calendarBlocked
                  ? "bg-action-faded hover:bg-action-faded/80"
                  : available && "bg-primary-faded/50"
              )}
              data-hour-start={block.start}
              disabled={calendarBlocked && calendarBusyUpdatePending}
              key={block.start}
              onClick={() => {
                if (calendarBlocked) {
                  onMakeCalendarBusyBlocksAvailable(blockingCalendarBusyBlocks);
                  return;
                }
                onToggle(block, available);
              }}
            >
              <span>
                {block.start}–{block.end}
              </span>
              {calendarBlocked ? (
                <span className="flex items-center gap-1.5 text-[10px] font-normal text-neutral-muted">
                  <Image
                    alt=""
                    aria-hidden="true"
                    height={14}
                    src="/images/logos/calendar.png"
                    width={14}
                  />
                  자동 불가 처리
                </span>
              ) : available ? (
                <Check className="size-4 text-primary" />
              ) : null}
            </MeetingAvailabilityTimeButton>
          );
        })}
      </div>
    </div>
  );
}

function DateOverridePanel({
  availability,
  calendarBusyBlocks,
  calendarBusyUpdatePending,
  date,
  onBack,
  onChange,
  onMakeCalendarBusyBlocksAvailable,
}: {
  availability: MeetingAvailabilityDocument;
  calendarBusyBlocks: MeetingCalendarBusyBlock[];
  calendarBusyUpdatePending: boolean;
  date: Date;
  onBack: () => void;
  onChange: (availability: MeetingAvailabilityDocument) => void;
  onMakeCalendarBusyBlocksAvailable: (
    busyBlocks: MeetingCalendarBusyBlock[]
  ) => void;
}) {
  const key = dateKey(date);
  const weekdayKey = isoWeekdayKey(date);
  const weekday = ISO_WEEKDAYS.find((item) => item.key === weekdayKey)!;
  const weeklyIntervals = availability.weeklyRules[weekdayKey];
  const hasOverride = Object.prototype.hasOwnProperty.call(
    availability.dateOverrides,
    key
  );
  const intervals = getMeetingAvailabilityIntervalsForDate(
    availability,
    key,
    weekdayKey
  );
  const calendarBusyBlocksForDate = calendarBusyBlocks.filter((busyBlock) =>
    calendarBusyBlockOverlapsDate({
      busyBlock,
      dateKey: key,
      timezone: availability.timezone,
    })
  );
  const unavailable = intervals.length === 0;
  const availableBeforeClosedRef = useRef<MeetingAvailabilityInterval[]>(
    intervals.length > 0
      ? intervals.map((interval) => ({ ...interval }))
      : weeklyIntervals.length > 0
        ? weeklyIntervals.map((interval) => ({ ...interval }))
        : [{ end: "18:00", start: "08:00" }]
  );

  useEffect(() => {
    if (intervals.length > 0) {
      availableBeforeClosedRef.current = intervals.map((interval) => ({
        ...interval,
      }));
    }
  }, [intervals]);

  const setDateIntervals = (nextIntervals: MeetingAvailabilityInterval[]) => {
    const next = cloneDocument(availability);
    if (intervalListsEqual(nextIntervals, weeklyIntervals)) {
      delete next.dateOverrides[key];
    } else {
      next.dateOverrides[key] = nextIntervals.map((interval) => ({
        ...interval,
      }));
    }
    onChange(next);
  };

  return (
    <div className="min-h-full p-5 sm:p-6">
      <MuteButton onClick={onBack} size="sm" variant="transparent">
        <ArrowLeft className="size-4" />
        돌아가기
      </MuteButton>
      <h3 className="mt-4 text-[16px] font-medium text-neutral-primary">
        {format(date, "M월 d일 EEEE", { locale: ko })}
      </h3>
      <div className="mt-5 flex items-center justify-between gap-3">
        <Checkbox
          checked={unavailable}
          label="미팅 불가"
          onChange={(event) => {
            if (event.target.checked) {
              setDateIntervals([]);
              return;
            }
            setDateIntervals(
              availableBeforeClosedRef.current.map((interval) => ({
                ...interval,
              }))
            );
          }}
          size="medium"
        />
        {hasOverride ? (
          <MuteButton
            onClick={() => {
              const next = cloneDocument(availability);
              delete next.dateOverrides[key];
              onChange(next);
            }}
            size="sm"
            variant="transparent"
          >
            초기화
          </MuteButton>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-medium text-neutral-primary">
              가능한 시간
            </p>
          </div>
          {/* <span className="text-[11px] text-neutral-muted">
            {intervals.length > 0 ? "" : "불가능"}
          </span> */}
        </div>
        <HourTimeline
          calendarBusyBlocks={calendarBusyBlocksForDate}
          calendarBusyUpdatePending={calendarBusyUpdatePending}
          dateKey={key}
          intervals={intervals}
          onMakeCalendarBusyBlocksAvailable={onMakeCalendarBusyBlocksAvailable}
          onToggle={(block, available) => {
            setDateIntervals(
              setMeetingTimeRangeAvailability({
                available: !available,
                intervals,
                rangeEnd: block.end,
                rangeStart: block.start,
              })
            );
          }}
          timezone={availability.timezone}
        />
      </div>
    </div>
  );
}

function WeeklyEditor({
  availability,
  onChange,
  portalContainer,
}: {
  availability: MeetingAvailabilityDocument;
  onChange: (availability: MeetingAvailabilityDocument) => void;
  portalContainer: HTMLElement | null;
}) {
  const [presetDays, setPresetDays] = useState<PresetDays>("weekdays");
  const [presetEnd, setPresetEnd] = useState("19:00");
  const [presetStart, setPresetStart] = useState("10:00");
  const [presetOpen, setPresetOpen] = useState(false);

  const presetStartMinutes = meetingTimeToMinutes(presetStart) ?? 0;
  const presetEndMinutes = meetingTimeToMinutes(presetEnd, true) ?? 0;

  const applyPreset = () => {
    if (presetStartMinutes >= presetEndMinutes) return;
    const targetKeys = ISO_WEEKDAYS.map(({ key }) => key).filter((key) => {
      if (presetDays === "all") return true;
      if (presetDays === "weekdays") return Number(key) <= 5;
      return Number(key) >= 6;
    });
    const next = cloneDocument(availability);
    for (const key of targetKeys) {
      const interval = { end: presetEnd, start: presetStart };
      next.weeklyRules[key] = [interval];
    }
    onChange(next);
  };

  return (
    <div className="min-h-full p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-medium text-neutral-primary">
            가능한 일정
          </h3>
          <p className="mt-1 text-[12px] font-light leading-4 text-neutral-muted">
            미팅 스케줄링을 허용할 요일과 시간을 설정하세요.
            <br />
            날짜를 선택하면 그날의 일정만 조정할 수 있어요.
          </p>
        </div>
        <Popover.Root onOpenChange={setPresetOpen} open={presetOpen}>
          <Popover.Trigger asChild>
            <MuteButton
              aria-expanded={presetOpen}
              aria-haspopup="dialog"
              size="sm"
              variant="neutral"
            >
              반복
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  presetOpen && "rotate-180"
                )}
              />
            </MuteButton>
          </Popover.Trigger>
          <Popover.Portal container={portalContainer}>
            <Popover.Content
              align="end"
              className="z-[110] w-[min(340px,calc(100vw-32px))] rounded-lg border border-neutral-1000-a10 bg-bg-floating p-3 shadow-[0_18px_48px_color-mix(in_srgb,var(--color-neutral-1000)_16%,transparent)] outline-none"
              onInteractOutside={(event) => {
                const target = event.target as Element | null;
                if (target?.closest("[data-slot=select-content]")) {
                  event.preventDefault();
                }
              }}
              sideOffset={6}
            >
              <div className="grid grid-cols-2 gap-2">
                <Select
                  modal={false}
                  onValueChange={(value) =>
                    setPresetDays((value ?? "weekdays") as PresetDays)
                  }
                  value={presetDays}
                >
                  <SelectTrigger
                    aria-label="적용할 요일"
                    className="col-span-2"
                    size="sm"
                  >
                    <SelectValue>{PRESET_DAY_LABELS[presetDays]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    container={portalContainer}
                  >
                    <SelectItem value="weekdays">평일</SelectItem>
                    <SelectItem value="weekends">주말</SelectItem>
                    <SelectItem value="all">매일</SelectItem>
                  </SelectContent>
                </Select>
                <TimeSelect
                  className="w-full"
                  label="반복 시작 시간"
                  onChange={(value) => {
                    setPresetStart(value);
                    const startMinutes = meetingTimeToMinutes(value) ?? 0;
                    if (startMinutes >= presetEndMinutes) {
                      setPresetEnd(
                        meetingMinutesToTime(
                          Math.min(startMinutes + 60, 24 * 60)
                        )
                      );
                    }
                  }}
                  portalContainer={portalContainer}
                  value={presetStart}
                />
                <TimeSelect
                  className="w-full"
                  endOfDay
                  label="반복 종료 시간"
                  onChange={(value) => {
                    setPresetEnd(value);
                    const endMinutes = meetingTimeToMinutes(value, true) ?? 0;
                    if (endMinutes <= presetStartMinutes) {
                      setPresetStart(
                        meetingMinutesToTime(Math.max(endMinutes - 60, 0))
                      );
                    }
                  }}
                  portalContainer={portalContainer}
                  value={presetEnd}
                />
                <MuteButton
                  className="col-span-2 w-full"
                  disabled={presetStartMinutes >= presetEndMinutes}
                  onClick={() => {
                    applyPreset();
                    setPresetOpen(false);
                  }}
                  size="sm"
                  variant="dark"
                >
                  적용
                </MuteButton>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div className="mt-5 border-b border-neutral-1000-a05">
        {ISO_WEEKDAYS.map(({ key, label }) => (
          <WeekdayRow
            intervals={availability.weeklyRules[key]}
            key={key}
            label={label}
            onChange={(intervals) => {
              const next = cloneDocument(availability);
              next.weeklyRules[key] = intervals;
              onChange(next);
            }}
            portalContainer={portalContainer}
          />
        ))}
      </div>
    </div>
  );
}

export function OrgInterviewAvailabilityDialog({
  onRequestClose,
  open,
  userId,
  workspaceId,
}: {
  onRequestClose: () => void;
  open: boolean;
  userId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const addToast = useToastStore((state) => state.add);
  const availabilityQuery = useOrgMeetingAvailability({
    enabled: open,
    workspaceId,
  });
  const saveAvailability = useSaveOrgMeetingAvailability(workspaceId);
  const calendar = useOrgGoogleCalendar({
    enabled: open,
    userId,
    workspaceId,
  });
  const updateCalendarBusyBlock =
    useUpdateOrgGoogleCalendarBusyBlock(workspaceId);
  const allowPopNavigationRef = useRef(false);
  const initializedRef = useRef(false);
  const [baseline, setBaseline] = useState<MeetingAvailabilityDocument | null>(
    null
  );
  const [conflict, setConflict] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [draft, setDraft] = useState<MeetingAvailabilityDocument>(() =>
    createDefaultMeetingAvailabilityDocument()
  );
  const [editorError, setEditorError] = useState("");
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const timezoneOptions = useMemo(
    () => supportedTimezones(draft.timezone),
    [draft.timezone]
  );

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (!availabilityQuery.isSuccess || initializedRef.current) return;
    allowPopNavigationRef.current = false;
    const saved = availabilityQuery.data.availability;
    const next = saved
      ? cloneDocument(saved)
      : createDefaultMeetingAvailabilityDocument(defaultBrowserTimezone());
    setDraft(next);
    setBaseline(cloneDocument(next));
    setExpectedVersion(saved?.version ?? null);
    setSelectedDate(null);
    setConflict(false);
    setEditorError("");
    initializedRef.current = true;
  }, [availabilityQuery.data, availabilityQuery.isSuccess, open]);

  const dirty = baseline
    ? !meetingAvailabilityDocumentsEqual(draft, baseline)
    : false;
  const canSave =
    Boolean(baseline) &&
    (expectedVersion === null || dirty) &&
    !saveAvailability.isPending;
  useEffect(() => {
    if (!open) return;
    router.beforePopState(() => {
      if (dirty && !allowPopNavigationRef.current) {
        setDiscardOpen(true);
        return false;
      }
      return true;
    });
    return () => router.beforePopState(() => true);
  }, [dirty, open, router]);

  useEffect(() => {
    if (!open || !dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, open]);

  const requestClose = () => {
    if (saveAvailability.isPending) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    allowPopNavigationRef.current = true;
    onRequestClose();
  };

  const save = async () => {
    setEditorError("");
    setConflict(false);
    let normalized: MeetingAvailabilityDocument;
    try {
      normalized = normalizeMeetingAvailabilityInput(draft);
    } catch (error) {
      setEditorError(
        error instanceof Error
          ? error.message
          : "가능 시간 설정을 확인해 주세요."
      );
      return;
    }
    try {
      const payload = await saveAvailability.mutateAsync({
        availability: normalized,
        expectedVersion,
      });
      if (!payload.availability) return;
      const saved = cloneDocument(payload.availability);
      setDraft(saved);
      setBaseline(cloneDocument(saved));
      setExpectedVersion(payload.availability.version);
      allowPopNavigationRef.current = true;
      addToast({
        message: "알려주신 가능 시간으로 설정해두었어요.",
        variant: "success",
      });
      onRequestClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "인터뷰 가능 시간을 저장하지 못했습니다.";
      setConflict(message.includes("다른 화면"));
      setEditorError(message);
    }
  };

  const reloadLatest = async () => {
    setEditorError("");
    const result = await availabilityQuery.refetch();
    if (result.error) {
      setEditorError(
        result.error instanceof Error
          ? result.error.message
          : "최신 가능 시간을 불러오지 못했어요."
      );
      return;
    }
    const saved = result.data?.availability;
    const next = saved
      ? cloneDocument(saved)
      : createDefaultMeetingAvailabilityDocument(defaultBrowserTimezone());
    setDraft(next);
    setBaseline(cloneDocument(next));
    setExpectedVersion(saved?.version ?? null);
    setConflict(false);
  };

  const makeCalendarBusyBlocksAvailable = async (
    busyBlocks: MeetingCalendarBusyBlock[]
  ) => {
    const blockingBusyBlocks = [
      ...new Map(
        busyBlocks
          .filter((busyBlock) => busyBlock.isBlocking)
          .map((busyBlock) => [busyBlock.id, busyBlock])
      ).values(),
    ];
    if (blockingBusyBlocks.length === 0) return;
    try {
      await Promise.all(
        blockingBusyBlocks.map((busyBlock) =>
          updateCalendarBusyBlock.mutateAsync({
            busyBlockId: busyBlock.id,
            isBlocking: false,
          })
        )
      );
      addToast({
        message: "Google Calendar 일정을 미팅 가능한 시간으로 바꿨어요.",
        variant: "success",
      });
    } catch (error) {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : "Google Calendar 일정을 바꾸지 못했어요.",
        variant: "error",
      });
    }
  };

  const selectedDateKey = selectedDate ? dateKey(selectedDate) : null;
  const today = calendarDateInTimezone(draft.timezone);
  const isPastDate = (date: Date) => date.getTime() < today.getTime();
  const isAvailableDate = (date: Date) =>
    !isPastDate(date) &&
    getMeetingAvailabilityIntervalsForDate(
      draft,
      dateKey(date),
      isoWeekdayKey(date)
    ).length > 0;
  const isOverrideDate = (date: Date) =>
    !isPastDate(date) &&
    Object.prototype.hasOwnProperty.call(draft.dateOverrides, dateKey(date));
  const isClosedOverrideDate = (date: Date) =>
    isOverrideDate(date) && draft.dateOverrides[dateKey(date)].length === 0;
  const isCalendarBusyDate = (date: Date) =>
    !isPastDate(date) &&
    (availabilityQuery.data?.calendarBusyBlocks ?? []).some(
      (busyBlock) =>
        busyBlock.isBlocking &&
        calendarBusyBlockOverlapsDate({
          busyBlock,
          dateKey: dateKey(date),
          timezone: draft.timezone,
        })
    );

  return (
    <>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose();
        }}
        open={open}
      >
        <DialogContent
          hideCloseButton
          className="!inset-0 m-auto h-[100svh] w-screen max-w-none !translate-x-0 !translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none p-0 data-[state=closed]:animate-none data-[state=open]:animate-none sm:h-[min(760px,calc(100svh-2rem))] sm:w-[calc(100vw-2rem)] sm:max-w-[1120px] sm:rounded-2xl"
          overlayClassName="data-[state=closed]:animate-none data-[state=open]:animate-none"
          ref={setPortalContainer}
        >
          <header className="flex min-h-[60px] items-center justify-between gap-4 border-b border-neutral-1000-a05 px-5 py-3 sm:px-6">
            <div className="min-w-0">
              <DialogTitle className="text-[18px]">
                미팅 가능한 일정
              </DialogTitle>
            </div>
            <MuteButton
              aria-label="닫기"
              disabled={saveAvailability.isPending}
              onClick={requestClose}
              variant="transparent"
            >
              <X className="size-4" />
            </MuteButton>
          </header>

          {availabilityQuery.isLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-neutral-muted" />
            </div>
          ) : availabilityQuery.error ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-[14px] text-neutral-primary">
                인터뷰 가능 시간을 불러오지 못했어요.
              </p>
              <p className="max-w-sm text-[12px] text-neutral-muted">
                {availabilityQuery.error instanceof Error
                  ? availabilityQuery.error.message
                  : "잠시 후 다시 시도해 주세요."}
              </p>
              <MuteButton onClick={() => void availabilityQuery.refetch()}>
                다시 불러오기
              </MuteButton>
            </div>
          ) : !baseline ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-neutral-muted" />
            </div>
          ) : (
            <MeetingAvailabilitySplitLayout
              calendar={
                <>
                  <MeetingAvailabilityCalendar
                    disabled={{ before: today }}
                    locale={ko}
                    mode="single"
                    modifiers={{
                      available: isAvailableDate,
                      calendarBusy: isCalendarBusyDate,
                      closedOverride: isClosedOverrideDate,
                      override: isOverrideDate,
                    }}
                    modifiersClassNames={{
                      calendarBusy:
                        "[&>button]:relative [&>button]:after:absolute [&>button]:after:bottom-1.5 [&>button]:after:left-1/2 [&>button]:after:size-1 [&>button]:after:-translate-x-1/2 [&>button]:after:rounded-full [&>button]:after:bg-action [&>button]:after:content-['']",
                      closedOverride:
                        "[&>button]:rounded-md [&>button]:bg-bg-weak [&>button]:text-neutral-disabled [&>button]:hover:bg-bg-weak [&>button[data-selected-single=true]]:bg-primary [&>button[data-selected-single=true]]:text-neutral-00",
                      override:
                        "[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-primary/50",
                    }}
                    onSelect={(date) => date && setSelectedDate(date)}
                    selected={selectedDate ?? undefined}
                  />

                  <div className="mt-5 border-t border-neutral-1000-a05 pt-4">
                    <label
                      className="text-[12px] font-medium text-neutral-primary"
                      htmlFor="availability-timezone"
                    >
                      시간대
                    </label>
                    <Combobox
                      autoHighlight
                      items={timezoneOptions}
                      onValueChange={(value) => {
                        if (!value) return;
                        setDraft((current) => ({
                          ...current,
                          timezone: value,
                        }));
                      }}
                      value={draft.timezone}
                    >
                      <ComboboxInput
                        aria-label="시간대 검색"
                        className="mt-2 h-10 bg-bg-floating"
                        id="availability-timezone"
                        placeholder="시간대 검색"
                        showClear={false}
                      />
                      <ComboboxContent
                        className="z-[130]"
                        container={portalContainer}
                      >
                        <ComboboxEmpty>
                          일치하는 시간대가 없습니다.
                        </ComboboxEmpty>
                        <ComboboxList>
                          {(timezone) => (
                            <ComboboxItem key={timezone} value={timezone}>
                              {timezone}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </div>
                </>
              }
            >
              {selectedDate && selectedDateKey ? (
                <DateOverridePanel
                  availability={draft}
                  calendarBusyBlocks={
                    availabilityQuery.data?.calendarBusyBlocks ?? []
                  }
                  calendarBusyUpdatePending={updateCalendarBusyBlock.isPending}
                  date={selectedDate}
                  key={`date-${selectedDateKey}`}
                  onBack={() => setSelectedDate(null)}
                  onChange={setDraft}
                  onMakeCalendarBusyBlocksAvailable={(busyBlocks) =>
                    void makeCalendarBusyBlocksAvailable(busyBlocks)
                  }
                />
              ) : (
                <WeeklyEditor
                  availability={draft}
                  onChange={setDraft}
                  portalContainer={portalContainer}
                />
              )}
            </MeetingAvailabilitySplitLayout>
          )}

          <footer className="flex min-h-[70px] flex-col gap-3 border-t border-neutral-1000-a05 bg-bg-floating px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {calendar.statusQuery.data?.status === "active" ? (
                <Tooltips
                  side="top"
                  text="5분 단위로, 그리고 일정 선택을 요청받은 사람이 달력을 열 때 자동으로 일정을 읽어와 불가능한 시간을 처리합니다."
                >
                  <Badge
                    aria-label="Google Calendar 연동됨"
                    className="bg-black/5 text-neutral-primary"
                    size="md"
                    tabIndex={0}
                  >
                    <Image
                      src="/images/logos/calendar.png"
                      alt=""
                      width={16}
                      height={16}
                    />
                    연동됨
                  </Badge>
                </Tooltips>
              ) : !calendar.statusQuery.isPending ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] leading-5 text-neutral-muted">
                  <Image
                    src="/images/logos/calendar.png"
                    alt=""
                    width={16}
                    height={16}
                  />
                  연동 안 됨
                </span>
              ) : null}
              {editorError ? (
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-critical">
                  <span>{editorError}</span>
                  {conflict ? (
                    <MuteButton
                      onClick={() => void reloadLatest()}
                      size="sm"
                      variant="transparent"
                    >
                      최신 설정 불러오기
                    </MuteButton>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 justify-end gap-2">
              <MuteButton
                disabled={saveAvailability.isPending}
                onClick={requestClose}
                size="lg"
              >
                닫기
              </MuteButton>
              <MuteButton
                disabled={!canSave}
                onClick={() => void save()}
                size="lg"
                variant="primary"
              >
                {saveAvailability.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                가능 시간 저장하기
              </MuteButton>
            </div>
          </footer>
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-sm gap-5 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px]">
              저장하지 않고 닫을까요?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              방금 바꾼 반복 시간과 날짜별 예외는 저장되지 않아요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <MuteButton onClick={() => setDiscardOpen(false)}>
              계속 편집
            </MuteButton>
            <MuteButton
              onClick={() => {
                setDiscardOpen(false);
                allowPopNavigationRef.current = true;
                onRequestClose();
              }}
              variant="warn"
            >
              저장하지 않고 닫기
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
