import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, Clock, LoaderCircle } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { MuteButton } from "@/components/ui/button";
import type {
  PublicMeetingInvitation,
  PublicMeetingInvitationResponse,
  PublicMeetingSlot,
} from "@/lib/meetings/invitation";
import { cn } from "@/lib/utils";

type Copy = {
  alreadySubmitted: string;
  availableTimes: string;
  chooseDate: string;
  chooseHint: string;
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
  title: string;
};

const COPY: Record<"en" | "ko", Copy> = {
  en: {
    alreadySubmitted:
      "This link has already been submitted and cannot be edited.",
    availableTimes: "Available times",
    chooseDate: "Choose a date",
    chooseHint:
      "Select 1–5 times. Choosing two or three is helpful when possible.",
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
    title: "Interview availability",
  },
  ko: {
    alreadySubmitted: "이미 제출한 링크이며 선택한 시간은 수정할 수 없어요.",
    availableTimes: "가능한 시간",
    chooseDate: "날짜를 선택해 주세요",
    chooseHint:
      "가능한 시간을 1~5개 골라 주세요. 가능하면 2~3개를 선택해 주시면 좋아요.",
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
    submit: "가능한 시간 제출하기",
    submitError: "가능한 시간을 제출하지 못했어요. 잠시 후 다시 시도해 주세요.",
    submitting: "제출하는 중",
    title: "인터뷰 가능 시간",
  },
};

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

function formatTimeRange(
  slot: PublicMeetingSlot,
  locale: "en" | "ko",
  timezone: string
) {
  const formatter = new Intl.DateTimeFormat(
    locale === "ko" ? "ko-KR" : "en-US",
    { hour: "numeric", minute: "2-digit", timeZone: timezone }
  );
  return `${formatter.format(new Date(slot.startAt))} – ${formatter.format(new Date(slot.endAt))}`;
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

export default function MeetingInvitationPage() {
  const router = useRouter();
  const token =
    typeof router.query.token === "string" ? router.query.token : "";
  const [invitation, setInvitation] = useState<PublicMeetingInvitation | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchInvitation(token);
      setInvitation(response.invitation);
      setSelectedSlotIds([]);
      setSelectedDateKey(response.invitation.slots[0]?.dateKey ?? "");
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
        setInvitation(response.invitation);
        setSelectedSlotIds([]);
        setSelectedDateKey(response.invitation.slots[0]?.dateKey ?? "");
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
  const availableDateKeys = useMemo(
    () =>
      Array.from(new Set(invitation?.slots.map((slot) => slot.dateKey) ?? [])),
    [invitation?.slots]
  );
  const slotsForDate = useMemo(
    () =>
      invitation?.slots.filter((slot) => slot.dateKey === selectedDateKey) ??
      [],
    [invitation?.slots, selectedDateKey]
  );
  const selectedDate = selectedDateKey
    ? dateFromKey(selectedDateKey)
    : undefined;

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
    <main className="min-h-screen bg-bg-basement px-4 py-8 text-neutral-primary sm:px-6 sm:py-12">
      <Head>
        <title>{copy.title} · Harper</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <div className="mx-auto mb-6 flex max-w-5xl items-center gap-2">
        <Image
          alt="Harper"
          className="size-7 rounded-md"
          height={28}
          src="/images/logo.png"
          width={28}
        />
        <span className="text-[15px] font-medium">Harper</span>
      </div>

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
              ? `${formatDate(invitation.confirmedAt, locale, invitation.timezone)} · ${formatTimeRange(
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
                  invitation.timezone
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
        <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-neutral-1000-a05 bg-bg-floating shadow-sm">
          <header className="border-b border-neutral-1000-a05 px-5 py-5 sm:px-7">
            <p className="text-[12px] font-medium text-primary">{copy.title}</p>
            <h1 className="mt-1 text-[22px] font-medium tracking-tight text-neutral-primary">
              {invitation.title}
            </h1>
            <p className="mt-2 text-[13px] leading-6 text-neutral-muted">
              {copy.companyRequested(
                invitation.companyName,
                invitation.organizerName
              )}{" "}
              {invitation.durationMinutes} min · {invitation.timezone}
            </p>
            {invitation.message ? (
              <p className="mt-3 rounded-lg bg-bg-weak px-3 py-2 text-[13px] leading-6 text-neutral-muted">
                {invitation.message}
              </p>
            ) : null}
          </header>

          <div className="grid min-h-[520px] md:grid-cols-[minmax(320px,0.9fr)_minmax(360px,1.1fr)]">
            <section className="border-b border-neutral-1000-a05 p-5 sm:p-7 md:border-b-0 md:border-r">
              <h2 className="text-[13px] font-medium text-neutral-primary">
                {copy.chooseDate}
              </h2>
              <Calendar
                className="mt-4 bg-bg-floating p-0 [--cell-size:2.5rem]"
                disabled={(date) =>
                  !availableDateKeys.includes(dateKeyFromLocalDate(date))
                }
                mode="single"
                modifiers={{ available: availableDateKeys.map(dateFromKey) }}
                modifiersClassNames={{
                  available:
                    "[&_button]:bg-primary-faded [&_button]:text-primary hover:[&_button]:bg-primary-faded",
                }}
                month={selectedDate}
                onMonthChange={(date) => {
                  const sameMonth = availableDateKeys.find((dateKey) => {
                    const candidate = dateFromKey(dateKey);
                    return (
                      candidate.getFullYear() === date.getFullYear() &&
                      candidate.getMonth() === date.getMonth()
                    );
                  });
                  if (sameMonth) setSelectedDateKey(sameMonth);
                }}
                onSelect={(date) => {
                  if (date) setSelectedDateKey(dateKeyFromLocalDate(date));
                }}
                selected={selectedDate}
                showOutsideDays={false}
              />
            </section>

            <section className="flex min-h-0 flex-col p-5 sm:p-7">
              <div>
                <h2 className="text-[13px] font-medium text-neutral-primary">
                  {copy.availableTimes}
                </h2>
                <p className="mt-1 text-[12px] leading-5 text-neutral-muted">
                  {copy.chooseHint}
                </p>
              </div>
              <div className="mt-4 grid max-h-[340px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {slotsForDate.map((slot) => {
                  const selected = selectedSlotIds.includes(slot.slotId);
                  return (
                    <MuteButton
                      aria-pressed={selected}
                      className={cn(
                        "w-full justify-start",
                        selected &&
                          "border-primary/30 bg-primary-faded text-primary"
                      )}
                      key={slot.slotId}
                      onClick={() => toggleSlot(slot.slotId)}
                      size="lg"
                      type="button"
                      variant="default"
                    >
                      {selected ? (
                        <Check className="size-4" />
                      ) : (
                        <Clock className="size-4" />
                      )}
                      {formatTimeRange(slot, locale, invitation.timezone)}
                    </MuteButton>
                  );
                })}
              </div>
              <div className="mt-auto border-t border-neutral-1000-a05 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] text-neutral-muted">
                    {copy.selected(selectedSlotIds.length)}
                  </span>
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
                </div>
                {error ? (
                  <p
                    className="mt-3 text-[12px] leading-5 text-critical"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </main>
  );
}
