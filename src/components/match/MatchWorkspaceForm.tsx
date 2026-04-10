"use client";

import { Input, inputSurfaceClassName } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type MatchWorkspaceFormValues = {
  companyDescription: string;
  companyName: string;
  homepageUrl: string;
  linkedinUrl: string;
};

type MatchWorkspaceFormProps = {
  initialValues?: Partial<MatchWorkspaceFormValues>;
  isSubmitting?: boolean;
  onCancel?: () => void;
  onSubmit: (values: MatchWorkspaceFormValues) => void | Promise<void>;
  submitLabel: string;
  title: string;
};

export default function MatchWorkspaceForm({
  initialValues,
  isSubmitting = false,
  onCancel,
  onSubmit,
  submitLabel,
  title,
}: MatchWorkspaceFormProps) {
  const [companyName, setCompanyName] = useState(
    initialValues?.companyName ?? ""
  );
  const [homepageUrl, setHomepageUrl] = useState(
    initialValues?.homepageUrl ?? ""
  );
  const [linkedinUrl, setLinkedinUrl] = useState(
    initialValues?.linkedinUrl ?? ""
  );
  const [companyDescription, setCompanyDescription] = useState(
    initialValues?.companyDescription ?? ""
  );

  useEffect(() => {
    setCompanyName(initialValues?.companyName ?? "");
    setHomepageUrl(initialValues?.homepageUrl ?? "");
    setLinkedinUrl(initialValues?.linkedinUrl ?? "");
    setCompanyDescription(initialValues?.companyDescription ?? "");
  }, [
    initialValues?.companyDescription,
    initialValues?.companyName,
    initialValues?.homepageUrl,
    initialValues?.linkedinUrl,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!onCancel || typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const canSubmit = useMemo(() => companyName.trim().length > 0, [companyName]);

  const labelStyle = "mb-3 text-xs text-white/75";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6 sm:px-6">
      <motion.button
        type="button"
        aria-label="워크스페이스 폼 닫기"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/20"
        onClick={() => onCancel?.()}
      />

      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-[1] w-full max-w-[560px] overflow-hidden rounded-[16px] bg-hgray200 shadow-[0_32px_90px_rgba(0,0,0,0.2)] ring-1 ring-white/10"
      >
        <div className="px-5 py-4">
          <div className="flex flex-row items-center justify-between gap-6">
            <div className="max-w-[500px]">
              <h2 className="text-lg font-medium leading-tight text-white">
                {title}
              </h2>
            </div>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white/55 transition hover:bg-white/5 hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit || isSubmitting) return;
            void onSubmit({
              companyDescription,
              companyName,
              homepageUrl,
              linkedinUrl,
            });
          }}
          className="px-5 pb-5"
        >
          <div className="grid gap-7">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="block">
                <div className={labelStyle}>회사명</div>
                <Input
                  placeholder="예: Harper Labs"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                />
              </label>

              <label className="block">
                <div className={labelStyle}>회사 홈페이지</div>
                <Input
                  type="url"
                  placeholder="https://company.com"
                  value={homepageUrl}
                  onChange={(event) => setHomepageUrl(event.target.value)}
                />
              </label>
            </div>

            <label className="block">
              <div className={labelStyle}>LinkedIn 페이지</div>
              <Input
                type="url"
                placeholder="https://www.linkedin.com/company/..."
                value={linkedinUrl}
                onChange={(event) => setLinkedinUrl(event.target.value)}
              />
            </label>

            <label className="block">
              <div className={labelStyle}>간단한 설명</div>
              <textarea
                rows={4}
                className={cn(
                  inputSurfaceClassName,
                  "min-h-[148px] resize-none py-3"
                )}
                placeholder="회사에 대해서 설명해주세요."
                value={companyDescription}
                onChange={(event) => setCompanyDescription(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-8 flex flex-col justify-between gap-4 border-t border-white/10 pt-5 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="hover:ring-2 hover:ring-accenta1/40 inline-flex w-full items-center justify-center rounded-lg bg-accenta1 px-4 py-2.5 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "저장 중..." : submitLabel}
            </button>
          </div>
        </form>
      </motion.section>
    </div>
  );
}
