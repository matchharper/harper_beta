import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgLocale, useOrgT } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { OrgErrorState } from "@/components/org/workspace/OrgErrorState";
import { OrgSection } from "@/components/org/workspace/OrgSection";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";
import { useOrgGoogleCalendar } from "@/hooks/org/useOrgGoogleCalendar";
import {
  readCalendarCallback,
  withoutCalendarCallback,
} from "@/lib/integrations/googleCalendarCallback";
import { useToastStore } from "@/store/useToastStore";
import Image from "next/image";

export function OrgGoogleCalendarIntegration({
  className,
  userId,
  workspaceId,
}: {
  className?: string;
  userId: string;
  workspaceId: string;
}) {
  const t = useOrgT();
  const { locale } = useOrgLocale();
  const router = useRouter();
  const addToast = useToastStore((state) => state.add);
  const hasCallback =
    router.isReady && router.query.googleCalendar === "callback";
  const { statusQuery, connect, complete, disconnect } = useOrgGoogleCalendar({
    userId,
    workspaceId,
    enabled: !hasCallback,
  });
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const handledCallback = useRef("");
  const { mutateAsync: completeAsync } = complete;

  const clearCallback = useCallback(() => {
    const query = withoutCalendarCallback(router.query);
    query.tab = "calendar";
    return router.replace(
      {
        pathname: router.pathname,
        query,
      },
      undefined,
      { shallow: true }
    );
  }, [router]);

  const finishConnection = useCallback(async () => {
    setCallbackError(null);
    try {
      const input = readCalendarCallback(router.query);
      if (!input) return;
      const result = await completeAsync(input);
      addToast({
        message:
          result.status === "active"
            ? t(
                "workspace.OrgGoogleCalendarIntegration.19d3b8e8",
                "Google Calendar 계정을 연결했어요."
              )
            : t(
                "workspace.OrgGoogleCalendarIntegration.a2bb4f91",
                "Google Calendar 연결을 완료하지 않았어요."
              ),
        variant: result.status === "active" ? "success" : "default",
      });
      await clearCallback();
    } catch (error) {
      const message = localizedOrgErrorMessage(
        error,
        locale,
        t(
          "workspace.OrgGoogleCalendarIntegration.7c8515ff",
          "Google Calendar 연결 결과를 저장하지 못했어요."
        )
      );
      setCallbackError(message);
      addToast({ message, variant: "error" });
      // Keep the callback on retryable failures, including a DB outage. Reload
      // or the retry button can finish the same browser-bound OAuth attempt.
    }
  }, [addToast, clearCallback, completeAsync, router.query, t]);

  useEffect(() => {
    if (!hasCallback) return;
    const key = `${userId}:${workspaceId}:${String(router.query.calendarState)}`;
    if (handledCallback.current === key) return;
    handledCallback.current = key;
    void finishConnection();
  }, [
    finishConnection,
    hasCallback,
    router.query.calendarState,
    userId,
    workspaceId,
  ]);

  const startConnection = async () => {
    setCallbackError(null);
    complete.reset();
    disconnect.reset();
    try {
      const result = await connect.mutateAsync();
      if (result.status === "redirect") {
        setRedirecting(true);
        window.location.assign(result.authorizeUrl);
      } else {
        if (hasCallback) await clearCallback();
        addToast({
          message: t(
            "workspace.OrgGoogleCalendarIntegration.6b72efe4",
            "Google Calendar 계정이 연결되어 있어요."
          ),
          variant: "success",
        });
      }
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(
          error,
          locale,
          t(
            "workspace.OrgGoogleCalendarIntegration.bd28fbec",
            "Google Calendar 연결을 시작하지 못했어요."
          )
        ),
        variant: "error",
      });
    }
  };

  const disconnectCalendar = async () => {
    connect.reset();
    try {
      await disconnect.mutateAsync();
      setDisconnectOpen(false);
      if (hasCallback) await clearCallback();
      addToast({
        message: t(
          "workspace.OrgGoogleCalendarIntegration.99ecaea2",
          "Google Calendar 연결을 해제했어요."
        ),
        variant: "success",
      });
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(
          error,
          locale,
          t(
            "workspace.OrgGoogleCalendarIntegration.bec31b55",
            "Google Calendar 연결 해제를 완료하지 못했어요."
          )
        ),
        variant: "error",
      });
      // The refreshed status distinguishes blocked Harper access from a fully
      // revoked vendor connection. Never show a success toast on partial failure.
      setDisconnectOpen(false);
    }
  };

  const busy =
    connect.isPending ||
    complete.isPending ||
    disconnect.isPending ||
    redirecting;
  const state = statusQuery.data?.status;
  const mutationError = connect.error ?? disconnect.error;

  return (
    <OrgSection className={className}>
      <div className="">
        <div className="flex flex-row gap-4 w-fit">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white border border-black/5">
            <Image
              alt={t("workspace.OrgGoogleCalendarIntegration.0204b951", "")}
              height={32}
              src="/images/logos/calendar.png"
              width={32}
            />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-normal flex items-center gap-2 text-neutral-primary">
              {t(
                "workspace.OrgGoogleCalendarIntegration.6d825a32",
                "Google Calendar"
              )}
              {state === "active" && (
                <Badge size="sm" tone="positive" variant="faded">
                  {t(
                    "workspace.OrgGoogleCalendarIntegration.14016533",
                    "연결됨"
                  )}
                </Badge>
              )}
            </h3>
            <p className="mt-1 max-w-2xl text-[13px] font-light leading-5 text-neutral-muted">
              {t(
                "workspace.OrgGoogleCalendarIntegration.b34542e1",
                "미팅 가능 시간을 확인하고,"
              )}
              <br />
              {t(
                "workspace.OrgGoogleCalendarIntegration.074866b9",
                "인터뷰 링크를 만들고 초대하기 위해 연결이 필요해요."
              )}
            </p>
          </div>
          <div
            aria-live="polite"
            className="flex shrink-0 items-center gap-3 ml-2"
          >
            {busy || (hasCallback && !callbackError) ? (
              <MuteButton disabled size="md">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
                {disconnect.isPending
                  ? t(
                      "workspace.OrgGoogleCalendarIntegration.4fa7af97",
                      "연결 해제 중"
                    )
                  : hasCallback
                    ? t(
                        "workspace.OrgGoogleCalendarIntegration.6d57f9e9",
                        "연결 확인 중"
                      )
                    : t(
                        "workspace.OrgGoogleCalendarIntegration.d2f44c02",
                        "연결 중"
                      )}
              </MuteButton>
            ) : hasCallback ? (
              <>
                <MuteButton onClick={() => void finishConnection()} size="md">
                  {t(
                    "workspace.OrgGoogleCalendarIntegration.8f9bbd63",
                    "저장 다시 시도"
                  )}
                </MuteButton>
                <MuteButton
                  onClick={() => void startConnection()}
                  size="md"
                  variant="transparent"
                >
                  {t(
                    "workspace.OrgGoogleCalendarIntegration.3c4d5d65",
                    "다시 연결"
                  )}
                </MuteButton>
              </>
            ) : statusQuery.isPending ? (
              <Skeleton
                aria-label={t(
                  "workspace.OrgGoogleCalendarIntegration.b0aa7f1c",
                  "연결 상태 확인 중"
                )}
                className="h-8 w-24"
              />
            ) : statusQuery.error ? (
              <MuteButton
                onClick={() => setDisconnectOpen(true)}
                size="md"
                variant="default"
              >
                {t(
                  "workspace.OrgGoogleCalendarIntegration.d1157882",
                  "연결 해제"
                )}
              </MuteButton>
            ) : state === "active" ? (
              <>
                <MuteButton
                  onClick={() => setDisconnectOpen(true)}
                  size="md"
                  variant="default"
                >
                  {t(
                    "workspace.OrgGoogleCalendarIntegration.d1157882",
                    "연결 해제"
                  )}
                </MuteButton>
              </>
            ) : state === "disabled" ? (
              <MuteButton onClick={() => void disconnectCalendar()} size="md">
                {t(
                  "workspace.OrgGoogleCalendarIntegration.a865cf6c",
                  "연결 해제 다시 시도"
                )}
              </MuteButton>
            ) : (
              <MuteButton onClick={() => void startConnection()} size="md">
                {state === "expired"
                  ? t(
                      "workspace.OrgGoogleCalendarIntegration.3c4d5d65",
                      "다시 연결"
                    )
                  : t(
                      "workspace.OrgGoogleCalendarIntegration.db12bd89",
                      "연결"
                    )}
              </MuteButton>
            )}
          </div>
        </div>
        {!hasCallback && state === "disabled" ? (
          <p className="pb-4 text-[13px] leading-5 text-neutral-muted">
            {t(
              "workspace.OrgGoogleCalendarIntegration.6193d97f",
              "Harper의 접근은 차단되어 있어요. 외부 계정 연결 해제를 마치려면 다시 시도해 주세요."
            )}
          </p>
        ) : !hasCallback && state === "expired" ? (
          <p className="pb-4 text-[13px] leading-5 text-neutral-muted">
            {t(
              "workspace.OrgGoogleCalendarIntegration.13ae6a5f",
              "Google Calendar 연결이 만료되었거나 해제됐어요. 사용하려면 다시 연결해 주세요."
            )}
          </p>
        ) : null}
        {callbackError ? (
          <OrgErrorState message={callbackError} className="mb-4" />
        ) : null}
        {!hasCallback && statusQuery.error ? (
          <OrgErrorState
            message={statusQuery.error.message}
            onRetry={() => void statusQuery.refetch()}
            className="mb-4"
          />
        ) : null}
        {mutationError ? (
          <OrgErrorState message={mutationError.message} className="mb-4" />
        ) : null}
      </div>
      <TalentCareerModal
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        mobileBottomSheet
        title={
          <>
            {t(
              "workspace.OrgGoogleCalendarIntegration.c43dd4cf",
              "Google Calendar 연결을 해제할까요?"
            )}
          </>
        }
        description={
          <>
            {t(
              "workspace.OrgGoogleCalendarIntegration.dea4eeb2",
              "내 Harper 계정의 연결만 해제해요. 기존 Google Calendar 일정과 다른 팀원의 연결은 변경하지 않아요."
            )}
          </>
        }
        panelClassName="max-w-md"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <MuteButton
              disabled={busy}
              onClick={() => setDisconnectOpen(false)}
            >
              {t("workspace.OrgGoogleCalendarIntegration.12a65c39", "취소")}
            </MuteButton>
            <MuteButton
              disabled={busy}
              onClick={() => void disconnectCalendar()}
              variant="warn"
            >
              {disconnect.isPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : null}
              {t(
                "workspace.OrgGoogleCalendarIntegration.d1157882",
                "연결 해제"
              )}
            </MuteButton>
          </div>
        }
      >
        <></>
      </TalentCareerModal>
    </OrgSection>
  );
}
