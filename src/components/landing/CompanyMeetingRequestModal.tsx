import { showToast } from "@/components/toast/toast";
import { BareButton, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/i18n/useMessage";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import type React from "react";

export type MeetingRequestFormState = {
  name: string;
  email: string;
  organization: string;
  purpose: string;
};

const INITIAL_MEETING_REQUEST_FORM: MeetingRequestFormState = {
  name: "",
  email: "",
  organization: "",
  purpose: "",
};

const isValidMeetingEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const meetingRequestCopy: Record<
  Locale,
  {
    title: string;
    description: string;
    nameLabel: string;
    namePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    companyLabel: string;
    companyPlaceholder: string;
    goalLabel: string;
    goalPlaceholder: string;
    cancel: string;
    submit: string;
    submitting: string;
    errors: {
      name: string;
      email: string;
      emailInvalid: string;
      company: string;
      goal: string;
      failed: string;
    };
    success: string;
  }
> = {
  ko: {
    title: "통화 요청하기",
    description:
      "팀의 상황, 찾고 있는 역할, 지금 채용에서 막히는 지점을 간단히 남겨주세요. 바로 연락드리겠습니다.",
    nameLabel: "이름",
    namePlaceholder: "",
    emailLabel: "이메일",
    emailPlaceholder: "example@company.com",
    companyLabel: "회사",
    companyPlaceholder: "회사 또는 팀명",
    goalLabel: "채용 목표",
    goalPlaceholder:
      "예: AI/ML 엔지니어 2명을 빠르게 찾고 싶고, GitHub/논문 기반으로 실제 역량을 보고 싶어요.",
    cancel: "취소",
    submit: "신청하기",
    submitting: "신청 중...",
    errors: {
      name: "이름을 입력해주세요.",
      email: "이메일을 입력해주세요.",
      emailInvalid: "유효한 이메일 주소를 입력해주세요.",
      company: "회사명을 입력해주세요.",
      goal: "채용 목표를 입력해주세요.",
      failed: "미팅 신청 제출에 실패했습니다.",
    },
    success: "미팅 신청이 접수되었습니다. 1일 내에 연락드리겠습니다.",
  },
  en: {
    title: "Request a call",
    description:
      "Share a few details about your team, the roles you need to fill, and what has made the search hard so far. Harper's team will review it and follow up within one business day with the candidate pool we can unlock and the fastest next step.",
    nameLabel: "Name",
    namePlaceholder: "Jane Kim",
    emailLabel: "Email",
    emailPlaceholder: "jane@company.com",
    companyLabel: "Company",
    companyPlaceholder: "Company or team",
    goalLabel: "Goal",
    goalPlaceholder:
      "For example: We need 2 AI/ML engineers and want to evaluate real ability through GitHub or research evidence.",
    cancel: "Cancel",
    submit: "Submit",
    submitting: "Submitting...",
    errors: {
      name: "Please enter your name.",
      email: "Please enter your email.",
      emailInvalid: "Please enter a valid email address.",
      company: "Please enter your company.",
      goal: "Please enter your goal.",
      failed: "Failed to submit meeting request.",
    },
    success:
      "Your request has been received. We'll follow up within one business day.",
  },
};

export function useCompanyMeetingRequestModal({
  locale,
  defaultPagePath = "/company",
}: {
  locale: Locale;
  defaultPagePath?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<MeetingRequestFormState>(
    INITIAL_MEETING_REQUEST_FORM
  );
  const copy = meetingRequestCopy[locale];

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (isSubmitting) return;
    setIsOpen(false);
  }, [isSubmitting]);

  const updateForm = useCallback(
    (field: keyof MeetingRequestFormState, value: string) => {
      setForm((current) => ({
        ...current,
        [field]: value,
      }));
    },
    []
  );

  const submitForm = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (isSubmitting) return;

      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        organization: form.organization.trim(),
        purpose: form.purpose.trim(),
        pagePath:
          typeof window !== "undefined"
            ? window.location.pathname
            : defaultPagePath,
      };

      if (!payload.name) {
        showToast({ message: copy.errors.name, variant: "white" });
        return;
      }

      if (!payload.email) {
        showToast({ message: copy.errors.email, variant: "white" });
        return;
      }

      if (!isValidMeetingEmail(payload.email)) {
        showToast({
          message: copy.errors.emailInvalid,
          variant: "white",
        });
        return;
      }

      if (!payload.organization) {
        showToast({ message: copy.errors.company, variant: "white" });
        return;
      }

      if (!payload.purpose) {
        showToast({ message: copy.errors.goal, variant: "white" });
        return;
      }

      setIsSubmitting(true);

      try {
        const response = await fetch("/api/feedback/company-demo-request", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || data?.error) {
          throw new Error(data?.error ?? copy.errors.failed);
        }

        setIsOpen(false);
        setForm(INITIAL_MEETING_REQUEST_FORM);
        showToast({
          message: copy.success,
          variant: "white",
          duration: 5000,
        });
      } catch (error) {
        console.error("company meeting request submit failed:", error);
        showToast({
          message: error instanceof Error ? error.message : copy.errors.failed,
          variant: "error",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [copy, defaultPagePath, form, isSubmitting]
  );

  return {
    closeModal,
    form,
    isOpen,
    isSubmitting,
    openModal,
    submitForm,
    updateForm,
  };
}

export function CompanyMeetingRequestModal({
  open,
  form,
  isSubmitting,
  locale,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  form: MeetingRequestFormState;
  isSubmitting: boolean;
  locale: Locale;
  onClose: () => void;
  onChange: (field: keyof MeetingRequestFormState, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const copy = meetingRequestCopy[locale];

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-100 flex items-center justify-center px-4 py-4 md:py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="company-meeting-request-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <BareButton
            type="button"
            aria-label="미팅 신청 폼 닫기"
            className="absolute inset-0 bg-black/25"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative max-h-[calc(100dvh-32px)] w-full max-w-[480px] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-5 text-neutral-1000 shadow-[0_12px_40px_rgba(0,0,0,0.12)] md:max-h-[calc(100dvh-64px)] md:p-6"
          >
            <BareButton
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-1000"
            >
              <X className="h-3.5 w-3.5" />
            </BareButton>
            <div className="pr-8">
              <h2
                id="company-meeting-request-title"
                className="text-base font-semibold leading-6 text-neutral-1000 md:text-lg"
              >
                {copy.title}
              </h2>
              <p className="mt-1 text-sm leading-5">{copy.description}</p>
            </div>
            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-neutral-900">
                  {copy.nameLabel}
                </span>
                <Input
                  value={form.name}
                  onChange={(event) => onChange("name", event.target.value)}
                  className="mt-1 h-10 bg-white text-neutral-1000 placeholder:text-black/60 focus:border-primary focus:ring-primary/10"
                  placeholder={copy.namePlaceholder}
                  autoComplete="name"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-900">
                  {copy.emailLabel}
                </span>
                <Input
                  value={form.email}
                  onChange={(event) => onChange("email", event.target.value)}
                  className="mt-1 h-10 bg-white text-neutral-1000 placeholder:text-black/60 focus:border-primary focus:ring-primary/10"
                  placeholder={copy.emailPlaceholder}
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-900">
                  {copy.companyLabel}
                </span>
                <Input
                  value={form.organization}
                  onChange={(event) =>
                    onChange("organization", event.target.value)
                  }
                  className="mt-1 h-10 bg-white text-neutral-1000 placeholder:text-black/60 focus:border-primary focus:ring-primary/10"
                  placeholder={copy.companyPlaceholder}
                  autoComplete="organization"
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-900">
                  {copy.goalLabel}
                </span>
                <Textarea
                  value={form.purpose}
                  onChange={(event) => onChange("purpose", event.target.value)}
                  className="mt-1 min-h-24 bg-white py-2.5 text-neutral-1000 placeholder:text-black/60 focus:border-primary focus:ring-primary/10"
                  placeholder={copy.goalPlaceholder}
                  required
                />
              </label>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="h-9 rounded-md border-neutral-300 bg-white px-3 text-sm text-neutral-700 hover:bg-neutral-100"
                >
                  {copy.cancel}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="h-9 rounded-md border-primary bg-primary px-4 text-sm text-white hover:bg-primary/90"
                >
                  {isSubmitting ? copy.submitting : copy.submit}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
