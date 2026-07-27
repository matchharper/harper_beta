import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import React, { useEffect, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { showToast } from "@/components/toast/toast";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import {
  getTalentAccountEmailChangePendingState,
  isTalentAccountEmailUnavailableError,
  TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE,
} from "@/lib/career/accountEmailErrors";
import { supabase } from "@/lib/supabase";
import Face from "@/components/common/Face";

type SyncedProfile = {
  email: string | null;
  name: string | null;
  user_id: string;
};

type CareerEmailChangeModalProps = {
  currentEmail: string;
  onChanged: (profile: SyncedProfile) => void;
  onClose: () => void;
  open: boolean;
  returnPath: string;
};

const normalizeEmail = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isValidEmail = (value: string) =>
  value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

const CareerEmailChangeModal = ({
  currentEmail,
  onChanged,
  onClose,
  open,
  returnPath,
}: CareerEmailChangeModalProps) => {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const normalizedCurrentEmail = normalizeEmail(currentEmail);
  const [draftEmail, setDraftEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingExpiresAtMs, setPendingExpiresAtMs] = useState<number | null>(
    null
  );
  const [sendPending, setSendPending] = useState(false);
  const [checkPending, setCheckPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [resendCompleted, setResendCompleted] = useState(false);
  const [requestCode, setRequestCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;

      const pendingState = getTalentAccountEmailChangePendingState(data.user);
      setPendingEmail(pendingState.email);
      setPendingExpiresAtMs(pendingState.expiresAtMs);
      setResendCompleted(false);
      setRequestCode("");
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !pendingExpiresAtMs) return;

    const expirePendingEmail = () => {
      setPendingEmail("");
      setPendingExpiresAtMs(null);
      setResendCompleted(false);
      setRequestCode("");
      setError("");
      setInfo("");
    };
    const remainingMs = pendingExpiresAtMs - Date.now();
    if (remainingMs <= 0) {
      expirePendingEmail();
      return;
    }

    const expirationTimer = window.setTimeout(expirePendingEmail, remainingMs);
    return () => window.clearTimeout(expirationTimer);
  }, [open, pendingExpiresAtMs]);

  const handleClose = () => {
    setDraftEmail("");
    setPendingEmail("");
    setPendingExpiresAtMs(null);
    setResendCompleted(false);
    setRequestCode("");
    setError("");
    setInfo("");
    onClose();
  };

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendPending) return;

    const email = normalizeEmail(draftEmail);
    setError("");
    setInfo("");

    if (!isValidEmail(email)) {
      setError(
        t(
          "career.settings.email_change.invalid",
          "유효한 이메일을 입력해주세요."
        )
      );
      return;
    }
    if (email === normalizedCurrentEmail) {
      setError(
        t(
          "career.settings.email_change.same_email",
          "현재 사용 중인 이메일과 같습니다."
        )
      );
      return;
    }

    setSendPending(true);
    try {
      const checkResponse = await fetchWithAuth(
        "/api/talent/account/email/check",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        }
      );
      const checkPayload = await checkResponse.json().catch(() => ({}));
      if (!checkResponse.ok) {
        const checkErrorMessage =
          checkPayload?.code === "EMAIL_IN_USE"
            ? t(
                "career.settings.email_change.in_use",
                TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE
              )
            : checkPayload?.error;
        throw new Error(
          checkErrorMessage ??
            t(
              "career.settings.email_change.availability_check_failed",
              "이메일을 확인하지 못했습니다."
            )
        );
      }

      const requestResponse = await fetchWithAuth(
        "/api/talent/account/email/request",
        {
          method: "POST",
          body: JSON.stringify({ email, returnPath }),
        }
      );
      const requestPayload = await requestResponse.json().catch(() => ({}));
      if (!requestResponse.ok) {
        throw new Error(
          requestPayload?.code === "EMAIL_IN_USE" ||
            isTalentAccountEmailUnavailableError(requestPayload)
            ? t(
                "career.settings.email_change.in_use",
                TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE
              )
            : requestPayload?.error
        );
      }

      const nextPendingState = getTalentAccountEmailChangePendingState({
        email_change_sent_at: String(requestPayload?.sentAt ?? ""),
        new_email: normalizeEmail(requestPayload?.pendingEmail) || email,
      });
      setPendingEmail(nextPendingState.email);
      setPendingExpiresAtMs(nextPendingState.expiresAtMs);
      setRequestCode(String(requestPayload?.requestCode ?? ""));
      setResendCompleted(false);
    } catch (sendError) {
      setError(
        getErrorMessage(
          sendError,
          t(
            "career.settings.email_change.send_failed",
            "인증 메일을 보내지 못했습니다."
          )
        )
      );
    } finally {
      setSendPending(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail || resendPending || resendCompleted) return;

    setResendPending(true);
    setError("");
    setInfo("");
    try {
      const response = await fetchWithAuth(
        "/api/talent/account/email/request",
        {
          method: "POST",
          body: JSON.stringify({
            email: pendingEmail,
            resend: true,
            returnPath,
          }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.code === "EMAIL_IN_USE" ||
            isTalentAccountEmailUnavailableError(payload)
            ? t(
                "career.settings.email_change.in_use",
                TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE
              )
            : payload?.error
        );
      }
      setResendCompleted(true);
      const nextPendingState = getTalentAccountEmailChangePendingState({
        email_change_sent_at: String(payload?.sentAt ?? ""),
        new_email: pendingEmail,
      });
      setPendingEmail(nextPendingState.email);
      setPendingExpiresAtMs(nextPendingState.expiresAtMs);
      setRequestCode(String(payload?.requestCode ?? ""));
      showToast({
        message: t(
          "career.settings.email_change.resent",
          "새 이메일로 인증 메일을 다시 보냈습니다. 이전 링크는 만료되었으니 가장 최근에 받은 메일만 열어주세요."
        ),
        variant: "white",
      });
    } catch (resendError) {
      showToast({
        message: getErrorMessage(
          resendError,
          t(
            "career.settings.email_change.resend_failed",
            "인증 메일을 다시 보내지 못했습니다."
          )
        ),
        variant: "error",
      });
    } finally {
      setResendPending(false);
    }
  };

  const handleCheck = async () => {
    if (!pendingEmail || checkPending) return;

    setCheckPending(true);
    setError("");
    setInfo("");
    try {
      await supabase.auth.refreshSession();
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      if (normalizeEmail(data.user?.email) !== pendingEmail) {
        setInfo(
          t(
            "career.settings.email_change.still_pending",
            "새 이메일로 받은 인증 링크를 확인해주세요."
          )
        );
        return;
      }

      const response = await fetchWithAuth("/api/talent/account/email/sync", {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.profile) {
        const syncErrorMessage =
          payload?.code === "EMAIL_IN_USE"
            ? t(
                "career.settings.email_change.in_use",
                TALENT_ACCOUNT_EMAIL_UNAVAILABLE_MESSAGE
              )
            : payload?.code === "EMAIL_NOT_CONFIRMED"
              ? t(
                  "career.settings.email_change.still_pending",
                  "새 이메일로 받은 인증 링크를 확인해주세요."
                )
              : payload?.error;
        throw new Error(
          syncErrorMessage ??
            t(
              "career.settings.email_change.save_failed",
              "인증된 이메일을 저장하지 못했습니다."
            )
        );
      }

      onChanged(payload.profile as SyncedProfile);
      handleClose();
    } catch (checkError) {
      setError(
        getErrorMessage(
          checkError,
          t(
            "career.settings.email_change.check_failed",
            "이메일 인증 상태를 확인하지 못했습니다."
          )
        )
      );
    } finally {
      setCheckPending(false);
    }
  };

  const hasPendingEmail = Boolean(pendingEmail);

  return (
    <TalentCareerModal
      open={open}
      onClose={handleClose}
      title={t("career.settings.email_change.title", "이메일 변경")}
      description={
        hasPendingEmail
          ? t(
              "career.settings.email_change.pending_description",
              "새 이메일로 전송된 인증 링크를 확인한 뒤 아래 확인 버튼을 눌러주세요."
            )
          : t(
              "career.settings.email_change.description",
              "새 이메일을 인증한 뒤에 이메일이 변경됩니다."
            )
      }
      mobileBottomSheet
      headerClassName="border-b-0"
      panelClassName="max-w-[440px] bg-bg-floating"
    >
      <div className="px-4 py-1 pb-5 sm:px-5">
        {hasPendingEmail ? (
          <>
            <div className="rounded-lg bg-bg-basement p-3 pb-5">
              <div className="flex flex-col items-center justify-center gap-2">
                <Face status="closing" size={96} />
                <p className="mt-1 text-sm text-center px-2 text-neutral-muted">
                  {t(
                    "career.settings.email_change.sent",
                    "새 이메일로 인증 메일을 보냈습니다. 재발송하면 이전 링크는 만료되므로, 가장 최근에 받은 메일만 열어주세요."
                  )}
                </p>
                <p className="truncate text-sm text-neutral-primary">
                  {pendingEmail}
                </p>
                {requestCode && (
                  <p className="text-xs font-medium text-neutral-secondary">
                    {t(
                      "career.settings.email_change.request_code",
                      "가장 최근 메일 요청 코드"
                    )}
                    : {requestCode}
                  </p>
                )}
              </div>
            </div>
            <div className="w-full flex items-end justify-end">
              <BareButton
                type="button"
                onClick={() => {
                  setPendingEmail("");
                  setPendingExpiresAtMs(null);
                  setDraftEmail("");
                  setResendCompleted(false);
                  setRequestCode("");
                  setError("");
                  setInfo("");
                }}
                className="mt-1 text-[13px] text-neutral-muted underline underline-offset-4"
              >
                {t(
                  "career.settings.email_change.use_another",
                  "다른 이메일 입력"
                )}
              </BareButton>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <MuteButton
                type="button"
                onClick={() => void handleResend()}
                disabled={resendPending || resendCompleted || checkPending}
              >
                {resendPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {resendCompleted
                  ? t(
                      "career.settings.email_change.resend_completed",
                      "인증 메일 재발송 완료"
                    )
                  : t(
                      "career.settings.email_change.resend",
                      "인증 메일 재발송"
                    )}
              </MuteButton>
              <MuteButton
                variant="dark"
                type="button"
                onClick={() => void handleCheck()}
                disabled={checkPending || resendPending}
              >
                {checkPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t(
                  "career.settings.email_change.check_complete",
                  "인증 완료 확인"
                )}
              </MuteButton>
            </div>
          </>
        ) : (
          <form className="space-y-4" onSubmit={handleSend}>
            <div>
              <label
                htmlFor="career-email-change-new-email"
                className="text-xs font-medium text-neutral-muted"
              >
                {t("career.settings.email_change.new_email", "새 이메일")}
              </label>
              <Input
                id="career-email-change-new-email"
                type="email"
                maxLength={320}
                autoComplete="email"
                autoFocus
                value={draftEmail}
                onChange={(event) => {
                  setDraftEmail(event.target.value);
                  setError("");
                  setInfo("");
                }}
                placeholder="email@example.com"
                className="mt-1 h-10"
              />
            </div>
            <BareButton
              type="submit"
              disabled={sendPending}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-black px-4 text-sm font-medium text-neutral-00 disabled:opacity-60"
            >
              {sendPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("career.settings.email_change.send", "인증 메일 보내기")}
              <ArrowRight className="h-4 w-4" />
            </BareButton>
          </form>
        )}

        {error && (
          <p className="rounded-lg bg-critical-faded px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-lg bg-bg-weak px-3 py-2 text-sm text-neutral-muted">
            {info}
          </p>
        )}
      </div>
    </TalentCareerModal>
  );
};

export default React.memo(CareerEmailChangeModal);
