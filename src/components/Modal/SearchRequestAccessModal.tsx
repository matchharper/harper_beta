import Image from "next/image";
import React, { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type {
  RequestAccessCopy,
  RequestAccessValues,
} from "@/components/Modal/RequestAccessModal";

type SearchRequestAccessModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: RequestAccessValues) => Promise<void>;
  title: string;
  description: string;
  requestCopy: RequestAccessCopy;
  submitted: boolean;
  submittedMessage: string;
  initialValues?: Partial<RequestAccessValues>;
};

export default function SearchRequestAccessModal({
  open,
  onClose,
  onSubmit,
  title,
  description,
  requestCopy,
  submitted,
  submittedMessage,
  initialValues,
}: SearchRequestAccessModalProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [company, setCompany] = useState(initialValues?.company ?? "");
  const [role, setRole] = useState(initialValues?.role ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? "");
    setCompany(initialValues?.company ?? "");
    setRole(initialValues?.role ?? "");
  }, [initialValues?.company, initialValues?.name, initialValues?.role, open]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        company,
        role,
        hiringNeed: initialValues?.hiringNeed ?? "",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Close request access modal"
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-50 w-full max-w-[960px] overflow-hidden rounded-2xl border border-beige900/8 bg-beige50 shadow-2xl">
        <div className="grid w-full gap-0 lg:grid-cols-[0.96fr_1.04fr]">
          <div className="border-b border-beige900/8 p-6 pb-8 lg:border-b-0 lg:border-r lg:p-8">
            <div className="flex flex-col items-start justify-start">
              <Image
                src="/svgs/logo.svg"
                alt="logo"
                width={32}
                height={32}
                className="mb-6 h-8 w-8"
              />
              <div className="text-2xl font-bold tracking-tight text-beige900">
                Finish Setup
              </div>
              <div className="mt-4 text-sm leading-7 text-beige900/55 md:text-[15px]">
                아래 정보를 입력하시면
                <br />
                10분 안에 접근 권한이 활성화됩니다.
              </div>
            </div>

            {submitted ? (
              <div className="mt-8 rounded-2xl border border-beige900/8 bg-beige100 px-4 py-4 text-sm leading-6 text-beige900">
                <div className="font-medium text-beige900/80">
                  {requestCopy.title}
                </div>
                <div className="mt-2 text-beige900/55">{submittedMessage}</div>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-beige900">
                      {requestCopy.nameLabel}
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder={requestCopy.namePlaceholder}
                      disabled={isSubmitting}
                      className="w-full rounded-md bg-beige50 border border-beige900/8 px-3 py-2.5 text-sm font-light text-beige900 placeholder:text-beige900/35 outline-none focus:border-beige900/15 focus:ring-2 focus:ring-beige900/8"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-beige900">
                      {requestCopy.companyLabel}
                    </div>
                    <input
                      type="text"
                      value={company}
                      onChange={(event) => setCompany(event.target.value)}
                      placeholder={requestCopy.companyPlaceholder}
                      disabled={isSubmitting}
                      className="w-full rounded-md bg-beige50 border border-beige900/8 px-3 py-2.5 text-sm font-light text-beige900 placeholder:text-beige900/35 outline-none focus:border-beige900/15 focus:ring-2 focus:ring-beige900/8"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-beige900">
                      {requestCopy.roleLabel}
                    </div>
                    <input
                      type="text"
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                      placeholder={requestCopy.rolePlaceholder}
                      disabled={isSubmitting}
                      className="w-full rounded-md bg-beige50 border border-beige900/8 px-3 py-2.5 text-sm font-light text-beige900 placeholder:text-beige900/35 outline-none focus:border-beige900/15 focus:ring-2 focus:ring-beige900/8"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-md bg-beige900 py-2.5 text-sm font-medium text-beige100 transition duration-300 hover:bg-beige900/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <LoaderCircle className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      requestCopy.submit
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="bg-black">
            <div className="flex h-full min-h-[280px] w-full flex-col overflow-hidden bg-gradpastel2">
              <div className="flex flex-1 items-center justify-center px-1 py-4">
                <video
                  src="/videos/newclipharper.mov"
                  poster="/images/usemain.png"
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-full w-full object-cover shadow-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
