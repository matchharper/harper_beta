import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/router";
import { CalendarDays } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerSidebarContext } from "../CareerSidebarContext";
import { useCareerCalendar } from "@/hooks/career/useCareerCalendar";
import {
  readCalendarCallback,
  withoutCalendarCallback,
} from "@/lib/integrations/googleCalendarCallback";

export function CareerCalendarSettingsRow() {
  const { user } = useCareerSidebarContext(),
    router = useRouter(),
    t = useCareerT(),
    calendar = useCareerCalendar(user?.id ?? "");
  const handled = useRef("");
  const [callbackError, setCallbackError] = useState<unknown>(null);
  const state =
    typeof router.query.calendarState === "string"
      ? router.query.calendarState
      : "";
  const callback = router.isReady && router.query.googleCalendar === "callback";
  const { mutateAsync: complete } = calendar.complete;
  const finish = useCallback(async () => {
    setCallbackError(null);
    const input = readCalendarCallback(router.query);
    if (!input) return;
    await complete(input);
    await router.replace(
      {
        pathname: router.pathname,
        query: withoutCalendarCallback(router.query),
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [complete, router]);
  useEffect(() => {
    if (!callback || !user?.id || handled.current === state) return;
    handled.current = state;
    void finish().catch(setCallbackError);
    // OAuth is an external completion event keyed by its signed nonce. Ordinary
    // status query refreshes must not complete the same callback repeatedly.
  }, [callback, state, user?.id, finish]);
  const busy =
    calendar.connect.isPending ||
    calendar.complete.isPending ||
    calendar.disconnect.isPending;
  const connected = calendar.status.data?.status === "active";
  const error =
    callbackError ??
    calendar.complete.error ??
    calendar.connect.error ??
    calendar.disconnect.error ??
    calendar.status.error;
  return (
    <section className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5" />
          <Typography as="h3" variant="title">
            Google Calendar
          </Typography>
        </div>
        {callback && error ? (
          <MuteButton
            disabled={busy}
            onClick={() => void finish().catch(setCallbackError)}
          >
            {t("career.calendar.retry", "연결 저장 다시 시도")}
          </MuteButton>
        ) : connected ? (
          <MuteButton
            disabled={busy}
            onClick={() => calendar.disconnect.mutate()}
          >
            {t("career.calendar.disconnect", "연결 해제")}
          </MuteButton>
        ) : (
          <MuteButton
            disabled={busy || calendar.status.isLoading}
            onClick={() =>
              void calendar.connect
                .mutateAsync()
                .then((result) => {
                  if (result.status === "redirect")
                    window.location.assign(result.authorizeUrl);
                })
                .catch(() => undefined)
            }
          >
            {t("career.calendar.connect", "Google Calendar 연결")}
          </MuteButton>
        )}
      </div>
      <Typography variant="description">
        {connected
          ? t(
              "career.calendar.connected",
              "연결됨 · 일정 확인과 요청한 일정 조율에 사용할 수 있어요."
            )
          : t(
              "career.calendar.description",
              "일정을 확인하고, 요청한 약속을 Calendar에 등록할 수 있어요."
            )}
      </Typography>
      {error ? (
        <Typography
          role="alert"
          variant="description"
          className="text-critical"
        >
          {t(
            "career.calendar.failed",
            "Calendar 연결을 확인하지 못했어요. 다시 시도해 주세요."
          )}
        </Typography>
      ) : null}
    </section>
  );
}
