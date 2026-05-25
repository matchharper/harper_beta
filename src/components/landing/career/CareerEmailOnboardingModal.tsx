import { LoaderCircle, MailCheck, X } from "lucide-react";
import { useState, type FormEvent } from "react";

type CareerEmailOnboardingModalProps = {
  abtestType: string;
  countryLang: string;
  forceResend?: boolean;
  isMobile: boolean;
  localId: string;
  onClose: () => void;
  onSubmitted?: () => void;
  onWebStart: () => void;
  open: boolean;
  variant: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CareerEmailOnboardingModal({
  abtestType,
  countryLang,
  forceResend = false,
  isMobile,
  localId,
  onClose,
  onSubmitted,
  onWebStart,
  open,
  variant,
}: CareerEmailOnboardingModalProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const resetFormState = () => {
    setError("");
    setSubmitting(false);
    setSubmitted(false);
    setEmail("");
  };

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError("올바른 이메일 주소를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/talent/email-onboarding/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          abtestType,
          countryLang,
          email: normalizedEmail,
          forceResend,
          isMobile,
          localId,
          pagePath:
            typeof window !== "undefined"
              ? `${window.location.pathname}${window.location.search}`
              : "/",
          source: "career",
          variant,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "메일 발송에 실패했습니다.");
      }
      setSubmitted(true);
      onSubmitted?.();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    resetFormState();
    onClose();
  };

  const handleWebStart = () => {
    if (submitting) return;
    resetFormState();
    onWebStart();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="메일 온보딩 모달 닫기"
        onClick={handleClose}
        className="absolute inset-0 bg-beige900/20 backdrop-blur-[3px]"
      />
      <div className="relative z-10 w-full max-w-[440px] rounded-[18px] border border-beige900/10 bg-beige50 p-5 text-left shadow-[0_24px_80px_rgba(37,20,6,0.22)] sm:p-6">
        <button
          type="button"
          onClick={handleClose}
          disabled={submitting}
          aria-label="메일 온보딩 모달 닫기"
          className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-lg text-beige900/48 transition hover:bg-beige900/5 hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>

        {submitted ? (
          <div role="status" aria-live="polite" className="pr-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-beige900/10 bg-white/75 text-beige900">
              <MailCheck className="h-4 w-4" />
            </div>
            <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.04em] text-beige900">
              감사합니다. 제가 곧 메일드릴게요.
            </h2>
            <p className="mt-3 text-sm leading-6 text-beige900/62">
              몇 초 안에 Harper 메일을 확인하실 수 있습니다. 메일이 보이지
              않으면 스팸함도 한 번 확인해 주세요.
            </p>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <div className="pr-8">
              <h2 className="text-[22px] font-semibold tracking-[-0.04em] text-beige900">
                제가 먼저 메일드릴게요.
              </h2>
              <p className="mt-3 text-sm leading-6 text-beige900/62">
                웹에서 바로 가입하지 않아도 괜찮습니다. 이메일만 남겨주시면
                Harper가 먼저 연락드리고, 답장 몇 번으로 시작할 수 있게
                도와드릴게요.
              </p>
            </div>

            <div className="mt-5 space-y-3">
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                autoComplete="email"
                placeholder="이메일 주소"
                disabled={submitting}
                className="h-12 w-full rounded-[10px] border border-beige900/12 bg-white/75 px-4 text-[15px] font-medium text-beige900 outline-none transition placeholder:text-beige900/32 focus:border-beige900/28 focus:bg-white focus:ring-2 focus:ring-beige900/10 disabled:cursor-not-allowed disabled:opacity-60"
                required
              />

              {error ? (
                <p className="rounded-[8px] border border-[#d35400]/20 bg-white/75 px-3 py-2 text-[12px] font-medium leading-5 text-[#b94800]">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-beige900 px-4 text-[15px] font-semibold text-beige50 shadow-[0_12px_24px_rgba(37,20,6,0.13)] transition hover:bg-beige900/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                {submitting ? "보내는 중..." : "메일로 시작하기"}
              </button>
            </div>

            <button
              type="button"
              onClick={handleWebStart}
              disabled={submitting}
              className="mt-4 w-full text-center text-[12px] font-medium text-beige900/52 underline underline-offset-4 transition hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              웹에서 바로 시작하기
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
