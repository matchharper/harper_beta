import * as Popover from "@radix-ui/react-popover";
import { Bell, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { CareerTalentNotification } from "@/components/career/types";
import { careerCx } from "@/components/career/ui/CareerPrimitives";

const notificationDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const formatNotificationDate = (value: string) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "";
  return notificationDateFormatter.format(new Date(timestamp));
};

const CareerNotificationsPopover = ({
  notifications,
  unreadNotificationCount,
  notificationsMarkingAsRead,
  notificationsError,
  onMarkNotificationsRead,
  showLabel = true,
  align = "start",
  side = "right",
  sideOffset = 18,
  buttonClassName,
}: {
  notifications: CareerTalentNotification[];
  unreadNotificationCount: number;
  notificationsMarkingAsRead: boolean;
  notificationsError: string;
  onMarkNotificationsRead: () => void | Promise<void>;
  showLabel?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  buttonClassName?: string;
}) => {
  const [open, setOpen] = useState(false);

  const summaryText = useMemo(() => {
    if (notifications.length === 0) {
      return "아직 받은 알림이 없습니다.";
    }

    if (unreadNotificationCount > 0) {
      return `${unreadNotificationCount}개의 새 알림이 있습니다.`;
    }

    return "모든 알림을 확인했습니다.";
  }, [notifications.length, unreadNotificationCount]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (
        nextOpen &&
        unreadNotificationCount > 0 &&
        !notificationsMarkingAsRead
      ) {
        void onMarkNotificationsRead();
      }
    },
    [
      notificationsMarkingAsRead,
      onMarkNotificationsRead,
      unreadNotificationCount,
    ]
  );

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="알림"
          className={careerCx(
            "inline-flex items-center gap-2 text-sm transition-colors",
            showLabel
              ? "mt-1 h-11 w-full rounded-md px-3 hover:bg-beige200"
              : "items-center justify-center",
            open && showLabel && "bg-beige200",
            buttonClassName
          )}
        >
          <span className="relative flex h-5 w-5 items-center justify-center">
            <Bell className="h-4 w-4" />
            {unreadNotificationCount > 0 && (
              <>
                <span
                  className={careerCx(
                    "absolute h-2.5 w-2.5 rounded-full bg-beige900",
                    !showLabel && "absolute right-0 top-0"
                  )}
                />
                {!showLabel && (
                  <span className="sr-only">
                    읽지 않은 알림 {unreadNotificationCount}개
                  </span>
                )}
              </>
            )}
          </span>
          {showLabel ? (
            <span className="flex-1 text-left">알림</span>
          ) : (
            <span className="sr-only">알림</span>
          )}
          {showLabel ? <span className="h-5 w-5" aria-hidden="true" /> : null}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={16}
          className="z-[60] w-[380px] max-w-[calc(100vw-2rem)] rounded-[16px] border border-beige900/10 bg-[#f7f1e6]/95 p-4 text-beige900 shadow-[0_18px_60px_rgba(59,46,37,0.2)] backdrop-blur"
        >
          <div className="flex items-start justify-between gap-4 border-b border-beige900/10 pb-3">
            <div>
              <div className="text-[15px] font-medium leading-5">알림</div>
              <div className="mt-1 text-[13px] leading-5 text-beige900/55">
                {summaryText}
              </div>
            </div>

            {notificationsMarkingAsRead && (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-beige900/40" />
            )}
          </div>

          {notificationsError && (
            <div className="mt-3 rounded-[10px] border border-red-500/15 bg-red-500/5 px-3 py-2 text-[12px] leading-5 text-red-700">
              {notificationsError}
            </div>
          )}

          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {notifications.length === 0 ? null : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={careerCx(
                    "rounded-[12px] border px-4 py-3 transition-colors",
                    notification.isRead
                      ? "border-beige900/10 bg-white/70"
                      : "border-beige900/20 bg-beige100/80"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={careerCx(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        notification.isRead ? "bg-beige900/15" : "bg-beige900"
                      )}
                    />

                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[14px] leading-6 text-beige900 [&_strong]:font-semibold"
                        dangerouslySetInnerHTML={{
                          __html:
                            notification.message?.trim() ||
                            "내용이 비어 있는 알림입니다.",
                        }}
                      />
                      <div className="mt-1 text-[12px] leading-5 text-beige900/45">
                        {formatNotificationDate(notification.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

export default CareerNotificationsPopover;
