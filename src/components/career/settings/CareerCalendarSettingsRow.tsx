import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import { Ellipsis, Loader2, RefreshCw, Unplug } from "lucide-react";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerSidebarContext } from "../CareerSidebarContext";
import { useCareerCalendar } from "@/hooks/career/useCareerCalendar";
import CareerProfileSourceCard from "./CareerProfileSourceCard";
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
  const retryCallback = callback && Boolean(error);
  const statusText = retryCallback
    ? t("career.calendar.retry", "연결 저장 다시 시도")
    : connected
      ? t("career.calendar.connected", "연결됨")
      : t("career.calendar.connect", "연동하기");
  const activate = () => {
    if (retryCallback) {
      void finish().catch(setCallbackError);
      return;
    }
    void calendar.connect
      .mutateAsync()
      .then((result) => {
        if (result.status === "redirect")
          window.location.assign(result.authorizeUrl);
      })
      .catch(() => undefined);
  };

  return (
    <>
      <CareerProfileSourceCard
        icon={
          calendar.status.isLoading || busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Image
              src="/images/logos/calendar.png"
              alt=""
              width={22}
              height={22}
              className="h-[22px] w-[22px] object-contain"
            />
          )
        }
        title="Google Calendar"
        meta={retryCallback ? statusText : null}
        className={
          !connected && !retryCallback
            ? "border-primary/20 bg-primary-faded hover:border-primary/30 hover:bg-primary-faded w-full md:w-full"
            : "w-full md:w-full"
        }
        badge={
          retryCallback ? null : connected ? (
            <Badge size="sm" tone="positive" variant="faded">
              {statusText}
            </Badge>
          ) : (
            <span className="inline-flex rounded-md bg-primary px-2 py-1 text-[11px] font-medium leading-none text-neutral-00">
              {statusText}
            </span>
          )
        }
        onActivate={
          busy || calendar.status.isLoading || (connected && !retryCallback)
            ? undefined
            : activate
        }
        ariaLabel={`Google Calendar ${statusText}`}
        action={
          retryCallback ? (
            <RefreshCw className="m-1.5 h-3.5 w-3.5" aria-hidden="true" />
          ) : connected ? (
            <ActionDropdown
              align="start"
              trigger={
                <MuteButton
                  type="button"
                  size="sm"
                  variant="transparent"
                  disabled={busy}
                  aria-label={t("career.calendar.actions", "Google Calendar 메뉴")}
                  className="h-7 min-h-7 w-7 px-0"
                >
                  <Ellipsis className="h-4 w-4" />
                </MuteButton>
              }
            >
              <ActionDropdownItem
                tone="danger"
                onSelect={() => calendar.disconnect.mutate()}
              >
                <Unplug className="h-4 w-4" />
                {t("career.calendar.disconnect", "연결 해제")}
              </ActionDropdownItem>
            </ActionDropdown>
          ) : null
        }
      />
      {error ? (
        <Typography
          role="alert"
          variant="description"
          className="col-span-full text-critical"
        >
          {t(
            "career.calendar.failed",
            "Calendar 연결을 확인하지 못했어요. 다시 시도해 주세요."
          )}
        </Typography>
      ) : null}
    </>
  );
}
