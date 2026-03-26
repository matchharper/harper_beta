"use client";

import { LoaderCircle, X } from "lucide-react";
import React, { useEffect, useState } from "react";

export type RequestAccessValues = {
  name: string;
  company: string;
  role: string;
  hiringNeed: string;
};

type RequestAccessCopy = {
  title: string;
  description: string;
  submit: string;
  nameLabel: string;
  namePlaceholder: string;
  companyLabel: string;
  companyPlaceholder: string;
  roleLabel: string;
  rolePlaceholder: string;
  hiringNeedLabel: string;
  hiringNeedPlaceholder: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: RequestAccessValues) => Promise<void>;
  copy: RequestAccessCopy;
  initialValues?: Partial<RequestAccessValues>;
};

export default function RequestAccessModal({
  open,
  onClose,
  onSubmit,
  copy,
  initialValues,
}: Props) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [company, setCompany] = useState(initialValues?.company ?? "");
  const [role, setRole] = useState(initialValues?.role ?? "");
  const [hiringNeed, setHiringNeed] = useState(initialValues?.hiringNeed ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? "");
    setCompany(initialValues?.company ?? "");
    setRole(initialValues?.role ?? "");
    setHiringNeed(initialValues?.hiringNeed ?? "");
  }, [
    initialValues?.company,
    initialValues?.hiringNeed,
    initialValues?.name,
    initialValues?.role,
    open,
  ]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        company,
        role,
        hiringNeed,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />
      <div className="relative z-10 w-full max-w-xl rounded-[28px] border border-white/10 bg-[#111111] p-6 text-white shadow-2xl md:p-8">
        <button
          type="button"
          onClick={() => {
            if (!isSubmitting) onClose();
          }}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="pr-8">
          <h2 className="text-xl font-medium md:text-2xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-6 text-white/65">
            {copy.description}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <LabeledInput
            label={copy.nameLabel}
            placeholder={copy.namePlaceholder}
            value={name}
            onChange={setName}
          />
          <LabeledInput
            label={copy.companyLabel}
            placeholder={copy.companyPlaceholder}
            value={company}
            onChange={setCompany}
          />
          <LabeledInput
            label={copy.roleLabel}
            placeholder={copy.rolePlaceholder}
            value={role}
            onChange={setRole}
          />
          <LabeledTextarea
            label={copy.hiringNeedLabel}
            placeholder={copy.hiringNeedPlaceholder}
            value={hiringNeed}
            onChange={setHiringNeed}
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              copy.submit
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-white">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
      />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-white">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none"
      />
    </label>
  );
}
