import { LoaderCircle, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/useMessage";
import { cn } from "@/lib/cn";

type CareerLandingEmailCaptureFormProps = {
  abtestType: string;
  addLandingLog?: (type: string) => Promise<boolean>;
  className?: string;
  countryLang: string;
  fieldClassName?: string;
  isMobile: boolean;
  localId: string;
  locale: Locale;
  pagePath?: string;
  source: string;
  variant: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COPY: Record<
  Locale,
  {
    button: string;
    invalidEmail: string;
    helper: string;
    pending: string;
    placeholder: string;
    sendFailed: string;
    successBody: string;
    successTitle: string;
  }
> = {
  ko: {
    button: "Harper와 함께하기",
    helper: "Harper가 먼저 연락드릴게요.",
    invalidEmail: "올바른 이메일 주소를 입력해 주세요.",
    pending: "보내는 중...",
    placeholder: "이메일 주소",
    sendFailed: "메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    successBody:
      "스팸함 혹은 다른 메일함으로 들어갈 수 있으니 확인 부탁드려요.",
    successTitle: "감사합니다. 이메일로 계속 이어나가요!",
  },
  en: {
    button: "Talk to Harper",
    helper: "Harper will reach out first.",
    invalidEmail: "Please enter a valid email address.",
    pending: "Sending...",
    placeholder: "Email address",
    sendFailed: "Failed to send the email. Please try again shortly.",
    successBody:
      "If you do not see Harper's email, please check spam or other inbox folders.",
    successTitle: "Thanks. We will continue over email.",
  },
};

export default function CareerLandingEmailCaptureForm({
  abtestType,
  addLandingLog,
  className,
  countryLang,
  fieldClassName,
  isMobile,
  localId,
  locale,
  pagePath,
  source,
  variant,
}: CareerLandingEmailCaptureFormProps) {
  const copy = COPY[locale];
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError(copy.invalidEmail);
      return;
    }

    setSubmitting(true);
    setError("");
    await addLandingLog?.("email_capture_submit");
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
          isMobile,
          localId,
          locale,
          pagePath:
            pagePath ??
            (typeof window !== "undefined"
              ? `${window.location.pathname}${window.location.search}`
              : "/"),
          source,
          variant,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || copy.sendFailed);
      }
      await addLandingLog?.("email_capture_sent");
      setSubmitted(true);
    } catch (submitError) {
      await addLandingLog?.("email_capture_error");
      setError(
        submitError instanceof Error ? submitError.message : copy.sendFailed
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "mx-auto flex w-full max-w-[520px] flex-col items-center text-center",
          className
        )}
      >
        <p className="mt-3 text-[17px] font-medium leading-6 text-neutral-950 md:text-[18px]">
          {copy.successTitle}
        </p>
        <p className="mt-1 max-w-[440px] text-[14px] leading-5 text-neutral-600 md:text-sm">
          {copy.successBody}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className={cn("mx-auto w-full max-w-[440px]", className)}
    >
      <div
        className={cn(
          "flex flex-row gap-2 rounded-full bg-white/95 p-1.5 backdrop-blur-sm",
          fieldClassName
        )}
      >
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError("");
          }}
          autoComplete="email"
          placeholder={copy.placeholder}
          disabled={submitting}
          className="h-11 min-w-0 flex-1 rounded-full bg-transparent px-3 text-[14px] font-medium text-neutral-950 outline-none transition placeholder:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
          required
        />
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-black px-5 text-[14px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[146px]"
        >
          {submitting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : null}
          {submitting ? copy.pending : copy.button}
        </button>
      </div>
      {error ? (
        <p className="mt-2 rounded-[8px] border border-red-200 bg-white/90 px-3 py-2 text-left text-[12px] font-medium leading-5 text-red-700">
          {error}
        </p>
      ) : (
        <div className="mt-2 text-[12px] text-center w-full text-neutral-muted">
          {copy.helper}
        </div>
      )}
    </form>
  );
}
