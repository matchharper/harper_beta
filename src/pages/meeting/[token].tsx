import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ko } from "date-fns/locale";
import { CalendarCheck, Check, LoaderCircle } from "lucide-react";
import {
  MeetingAvailabilityCalendar,
  MeetingAvailabilitySplitLayout,
  MeetingAvailabilityTimeButton,
} from "@/components/meetings/MeetingAvailabilityLayout";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import { MuteButton } from "@/components/ui/button";
import type {
  PublicMeetingInvitation,
  PublicMeetingInvitationResponse,
  PublicMeetingSlot,
} from "@/lib/meetings/invitation";
import { getDisplayableCompanyLogoUrl } from "@/lib/imageUrl";
import { cn } from "@/lib/utils";

type Copy = {
  alreadySubmitted: string;
  companyRequested: (company: string, organizer: string) => string;
  confirmed: string;
  expired: string;
  expiredDescription: string;
  calendarPending: string;
  calendarReady: string;
  calendarWithoutMeet: string;
  loadError: string;
  loading: string;
  noSlots: string;
  noSlotsDescription: string;
  openMeet: string;
  retry: string;
  selected: (count: number) => string;
  slotsChanged: string;
  submit: string;
  submitError: string;
  submitting: string;
  timezoneNotice: (candidate: string, timezone: string) => string;
  title: string;
};

const COPY: Record<"en" | "ko", Copy> = {
  en: {
    alreadySubmitted:
      "This link has already been submitted and cannot be edited.",
    companyRequested: (company, organizer) =>
      `${organizer} from ${company} would like to arrange a meeting with you.`,
    confirmed: "Your meeting time is confirmed",
    expired: "This link has expired",
    expiredDescription:
      "Please contact Harper or the company if you still need to share your availability.",
    calendarPending:
      "Your time is saved. Harper is checking the calendar invitation delivery.",
    calendarReady:
      "The calendar invitation has been sent to both sides with the Google Meet link.",
    calendarWithoutMeet:
      "The calendar invitation was sent, but a Google Meet link could not be created. Please contact Harper or the company before the meeting.",
    loadError:
      "We couldn't load this scheduling link. Please check the link and try again.",
    loading: "Loading available times",
    noSlots: "There are no available times right now",
    noSlotsDescription:
      "The company's availability may have changed. Harper will need to request new times.",
    openMeet: "Open Google Meet",
    retry: "Try again",
    selected: (count) => `${count} selected`,
    slotsChanged:
      "One of the selected times just became unavailable. Please choose again from the latest times.",
    submit: "Submit availability",
    submitError:
      "We couldn't submit your availability. Please wait a moment and try again.",
    submitting: "Submitting",
    timezoneNotice: (candidate, timezone) =>
      `Times are displayed in ${candidate}'s time zone (${timezone}).`,
    title: "Interview availability",
  },
  ko: {
    alreadySubmitted: "이미 제출한 링크이며 선택한 시간은 수정할 수 없어요.",
    companyRequested: (company, organizer) =>
      `${company}의 ${organizer}님이 미팅 일정을 요청했어요.`,
    confirmed: "미팅 시간이 확정됐어요",
    expired: "이 링크는 만료됐어요",
    expiredDescription:
      "가능한 시간을 다시 전달해야 한다면 Harper 또는 회사 담당자에게 알려 주세요.",
    calendarPending:
      "확정된 시간은 저장됐어요. Harper가 Calendar 초대 전달 상태를 확인하고 있어요.",
    calendarReady:
      "양측에 Calendar 초대를 보냈고 Google Meet 링크도 함께 전달했어요.",
    calendarWithoutMeet:
      "Calendar 초대는 보냈지만 Google Meet 링크를 만들지 못했어요. 미팅 전에 Harper 또는 회사 담당자에게 알려 주세요.",
    loadError:
      "일정 선택 정보를 불러오지 못했어요. 링크를 확인하고 다시 시도해 주세요.",
    loading: "가능한 시간을 불러오는 중",
    noSlots: "지금 선택할 수 있는 시간이 없어요",
    noSlotsDescription:
      "회사 측 일정이 바뀌었을 수 있어요. Harper가 새로운 가능 시간을 다시 받아야 해요.",
    openMeet: "Google Meet 열기",
    retry: "다시 불러오기",
    selected: (count) => `${count}개 선택`,
    slotsChanged:
      "선택한 시간 중 하나가 방금 불가능해졌어요. 최신 가능 시간에서 다시 골라 주세요.",
    submit: "Submit availability",
    submitError: "가능한 시간을 제출하지 못했어요. 잠시 후 다시 시도해 주세요.",
    submitting: "Submitting",
    timezoneNotice: (candidate, timezone) =>
      `${candidate}님의 시간대(${timezone})에 맞게 변경하여 표시했습니다.`,
    title: "인터뷰 가능 시간",
  },
};

function resolvedBrowserTimezone(fallback: string) {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return fallback;
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return fallback;
  }
}

function dateKeyInTimezone(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function dateKeyFromLocalDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(value: string, locale: "en" | "ko", timezone: string) {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "full",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatDateKey(dateKey: string, locale: "en" | "ko") {
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(dateFromKey(dateKey));
}

function formatTimeRange(
  slot: PublicMeetingSlot,
  locale: "en" | "ko",
  timezone: string
) {
  const formatter = new Intl.DateTimeFormat(
    locale === "ko" ? "ko-KR" : "en-US",
    {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone: timezone,
    }
  );
  return `${formatter.format(new Date(slot.startAt))}–${formatter.format(new Date(slot.endAt))}`;
}

async function fetchInvitation(token: string) {
  const response = await fetch(`/api/meeting/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || "Failed to load interview availability");
  }
  return body as PublicMeetingInvitationResponse;
}

function StateCard({
  action,
  description,
  title,
}: {
  action?: { href: string; label: string };
  description: string;
  title: string;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-neutral-1000-a05 bg-bg-floating p-8 text-center shadow-sm">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-bg-weak">
        <CalendarCheck className="size-5 text-neutral-muted" />
      </div>
      <h1 className="mt-4 text-[20px] font-medium text-neutral-primary">
        {title}
      </h1>
      <p className="mt-2 whitespace-pre-line text-[13px] leading-6 text-neutral-muted">
        {description}
      </p>
      {action ? (
        <a
          className="mt-4 inline-flex text-[13px] font-medium text-link underline underline-offset-2"
          href={action.href}
          rel="noreferrer"
          target="_blank"
        >
          {action.label}
        </a>
      ) : null}
    </div>
  );
}

function CompanyLogo({
  companyName,
  logoUrl: rawLogoUrl,
}: {
  companyName: string;
  logoUrl: string | null;
}) {
  const logoUrl = getDisplayableCompanyLogoUrl(rawLogoUrl);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const showLogo = Boolean(logoUrl && logoUrl !== failedLogoUrl);

  return (
    <span className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-1000-a05 bg-bg-weak text-[11px] font-medium text-neutral-muted">
      {companyName.trim().slice(0, 1).toUpperCase() || "?"}
      {showLogo && logoUrl ? (
        <Image
          alt=""
          className="absolute inset-0 size-full bg-bg-floating object-contain p-0.5"
          height={28}
          onError={() => setFailedLogoUrl(logoUrl)}
          src={logoUrl}
          unoptimized
          width={28}
        />
      ) : null}
    </span>
  );
}

export default function MeetingInvitationPage() {
  const router = useRouter();
  const token =
    typeof router.query.token === "string" ? router.query.token : "";
  const [invitation, setInvitation] = useState<PublicMeetingInvitation | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [candidateTimezone, setCandidateTimezone] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const slotListRef = useRef<HTMLDivElement>(null);
  const slotGroupRefs = useRef<Record<string, HTMLElement | null>>({});

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchInvitation(token);
      const timezone = resolvedBrowserTimezone(response.invitation.timezone);
      setInvitation(response.invitation);
      setCandidateTimezone(timezone);
      setSelectedSlotIds([]);
      setSelectedDateKey(
        response.invitation.slots[0]
          ? dateKeyInTimezone(response.invitation.slots[0].startAt, timezone)
          : ""
      );
    } catch {
      setError(COPY[invitation?.locale ?? "en"].loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!router.isReady || !token) return;
    let cancelled = false;
    void fetchInvitation(token)
      .then((response) => {
        if (cancelled) return;
        const timezone = resolvedBrowserTimezone(response.invitation.timezone);
        setInvitation(response.invitation);
        setCandidateTimezone(timezone);
        setSelectedSlotIds([]);
        setSelectedDateKey(
          response.invitation.slots[0]
            ? dateKeyInTimezone(response.invitation.slots[0].startAt, timezone)
            : ""
        );
      })
      .catch(() => {
        if (cancelled) return;
        setError(COPY.en.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router.isReady, token]);

  const locale = invitation?.locale ?? "en";
  const copy = COPY[locale];
  const displayTimezone =
    candidateTimezone || invitation?.timezone || "Asia/Seoul";
  const slotGroups = useMemo(() => {
    const groupedSlots = new Map<string, PublicMeetingSlot[]>();

    for (const slot of invitation?.slots ?? []) {
      const dateKey = dateKeyInTimezone(slot.startAt, displayTimezone);
      const groupedDateSlots = groupedSlots.get(dateKey);
      if (groupedDateSlots) {
        groupedDateSlots.push(slot);
      } else {
        groupedSlots.set(dateKey, [slot]);
      }
    }

    return Array.from(groupedSlots, ([dateKey, slots]) => ({ dateKey, slots }));
  }, [displayTimezone, invitation?.slots]);
  const availableDateKeys = useMemo(
    () => slotGroups.map((group) => group.dateKey),
    [slotGroups]
  );
  const selectedDate = selectedDateKey
    ? dateFromKey(selectedDateKey)
    : undefined;

  const selectDate = (dateKey: string, behavior: ScrollBehavior = "smooth") => {
    setSelectedDateKey(dateKey);
    window.requestAnimationFrame(() => {
      const list = slotListRef.current;
      const section = slotGroupRefs.current[dateKey];
      if (!list || !section) return;
      list.scrollTo({ behavior, top: section.offsetTop });
    });
  };

  const toggleSlot = (slotId: string) => {
    setError("");
    setSelectedSlotIds((current) => {
      if (current.includes(slotId))
        return current.filter((id) => id !== slotId);
      if (current.length >= 5) return current;
      return [...current, slotId];
    });
  };

  const submit = async () => {
    if (!token || selectedSlotIds.length === 0) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/meeting/${encodeURIComponent(token)}`,
        {
          body: JSON.stringify({ slotIds: selectedSlotIds }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      if (!response.ok) {
        if (response.status === 409) {
          await load();
          setError(copy.slotsChanged);
          return;
        }
        throw new Error(copy.submitError);
      }
      await load();
    } catch {
      setError(copy.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className={cn(
        "min-h-screen bg-bg-default px-4 pb-8 pt-8 text-neutral-primary sm:px-6 sm:pb-12 sm:pt-12",
        selectedSlotIds.length > 0 && "pb-28 sm:pb-28 md:pb-12"
      )}
    >
      <Head>
        <title>{`${copy.title} · Harper`}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      {loading ? (
        <div className="mx-auto flex max-w-lg items-center justify-center gap-2 rounded-xl border border-neutral-1000-a05 bg-bg-floating p-10 text-[13px] text-neutral-muted">
          <LoaderCircle className="size-4 animate-spin" />
          {copy.loading}
        </div>
      ) : error && !invitation ? (
        <div className="mx-auto max-w-lg rounded-xl border border-neutral-1000-a05 bg-bg-floating p-8 text-center">
          <p className="text-[13px] leading-6 text-critical">{error}</p>
          <MuteButton
            className="mt-4"
            onClick={() => void load()}
            variant="default"
          >
            {copy.retry}
          </MuteButton>
        </div>
      ) : invitation?.state === "expired" ? (
        <StateCard description={copy.expiredDescription} title={copy.expired} />
      ) : invitation?.state === "no_slots" ? (
        <StateCard description={copy.noSlotsDescription} title={copy.noSlots} />
      ) : invitation?.state === "submitted" ? (
        <StateCard
          action={
            invitation.calendar?.meetUrl
              ? { href: invitation.calendar.meetUrl, label: copy.openMeet }
              : undefined
          }
          description={
            invitation.confirmedAt
              ? `${formatDate(invitation.confirmedAt, locale, displayTimezone)} · ${formatTimeRange(
                  {
                    dateKey: "",
                    endAt: new Date(
                      new Date(invitation.confirmedAt).getTime() +
                        invitation.durationMinutes * 60_000
                    ).toISOString(),
                    slotId: "confirmed",
                    startAt: invitation.confirmedAt,
                  },
                  locale,
                  displayTimezone
                )}\n\n${copy.alreadySubmitted}\n${
                  invitation.calendar?.status === "created"
                    ? copy.calendarReady
                    : invitation.calendar?.status === "created_without_meet"
                      ? copy.calendarWithoutMeet
                      : copy.calendarPending
                }`
              : copy.alreadySubmitted
          }
          title={copy.confirmed}
        />
      ) : invitation ? (
        <div className="mx-auto max-w-5xl">
          <OrgPageHeader
            description={
              <span className="flex items-center gap-2">
                <CompanyLogo
                  companyName={invitation.companyName}
                  logoUrl={invitation.companyLogoUrl}
                />
                <span>
                  {copy.companyRequested(
                    invitation.companyName,
                    invitation.organizerName
                  )}{" "}
                  · {invitation.durationMinutes} min
                </span>
              </span>
            }
            title={invitation.title}
          />
          <p className="mt-0 text-[13px] leading-5 text-neutral-muted">
            {copy.timezoneNotice(invitation.candidateName, displayTimezone)}
          </p>
          {invitation.message ? (
            <p className="mt-2 max-w-3xl text-[14px] leading-6 text-neutral-muted">
              {invitation.message}
            </p>
          ) : null}

          <div className="mt-4 flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-neutral-1000-a05 bg-bg-floating shadow-sm md:h-[min(620px,calc(100svh-12rem))] md:min-h-[520px]">
            <MeetingAvailabilitySplitLayout
              calendar={
                <MeetingAvailabilityCalendar
                  disabled={(date) =>
                    !availableDateKeys.includes(dateKeyFromLocalDate(date))
                  }
                  locale={locale === "ko" ? ko : undefined}
                  mode="single"
                  modifiers={{ available: availableDateKeys.map(dateFromKey) }}
                  month={selectedDate}
                  onMonthChange={(date) => {
                    const sameMonth = availableDateKeys.find((dateKey) => {
                      const candidate = dateFromKey(dateKey);
                      return (
                        candidate.getFullYear() === date.getFullYear() &&
                        candidate.getMonth() === date.getMonth()
                      );
                    });
                    if (sameMonth) selectDate(sameMonth);
                  }}
                  onSelect={(date) => {
                    if (date) selectDate(dateKeyFromLocalDate(date));
                  }}
                  selected={selectedDate}
                />
              }
              className="min-h-0 flex-1"
              contentPaneClassName="flex min-h-[420px] flex-col md:overflow-hidden"
            >
              <div
                className="relative min-h-0 flex-1 overflow-y-auto px-5 [scrollbar-gutter:stable] sm:px-6"
                ref={slotListRef}
              >
                {slotGroups.map((group, index) => (
                  <section
                    className={cn(
                      "scroll-mt-0",
                      index > 0 && "border-t border-neutral-1000-a05"
                    )}
                    key={group.dateKey}
                    ref={(node) => {
                      slotGroupRefs.current[group.dateKey] = node;
                    }}
                  >
                    <h2 className="sticky top-0 z-10 bg-bg-floating py-4 text-[13px] font-medium text-neutral-primary">
                      {formatDateKey(group.dateKey, locale)}
                    </h2>
                    <div className="grid gap-2 pb-4 sm:grid-cols-2">
                      {group.slots.map((slot) => {
                        const selected = selectedSlotIds.includes(slot.slotId);
                        return (
                          <MeetingAvailabilityTimeButton
                            aria-pressed={selected}
                            className={cn(selected && "bg-primary-faded/50")}
                            key={slot.slotId}
                            onClick={() => toggleSlot(slot.slotId)}
                            type="button"
                          >
                            <span>
                              {formatTimeRange(slot, locale, displayTimezone)}
                            </span>
                            {selected ? (
                              <Check className="size-4 text-primary" />
                            ) : null}
                          </MeetingAvailabilityTimeButton>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </MeetingAvailabilitySplitLayout>
            <footer className="hidden min-h-[70px] shrink-0 gap-3 border-t border-neutral-1000-a05 bg-bg-floating px-6 py-3 md:flex md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <span className="text-[12px] text-neutral-muted">
                  {copy.selected(selectedSlotIds.length)}
                </span>
                {error ? (
                  <p
                    className="mt-1 text-[12px] leading-5 text-critical"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
              <MuteButton
                disabled={selectedSlotIds.length === 0 || submitting}
                onClick={() => void submit()}
                size="lg"
                variant="primary"
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {submitting ? copy.submitting : copy.submit}
              </MuteButton>
            </footer>
          </div>
          {selectedSlotIds.length > 0 ? (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-1000-a05 bg-bg-floating px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] md:hidden">
              <div className="mx-auto max-w-5xl">
                {error ? (
                  <p
                    className="mb-2 text-[12px] leading-5 text-critical"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
                <MuteButton
                  className="w-full"
                  disabled={submitting}
                  onClick={() => void submit()}
                  size="lg"
                  variant="primary"
                >
                  {submitting ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  {submitting ? copy.submitting : copy.submit}
                </MuteButton>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
