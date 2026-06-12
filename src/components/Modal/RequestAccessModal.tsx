"use client";

import { LoaderCircle, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

export type RequestAccessValues = {
  name: string;
  company: string;
  role: string;
  hiringNeed: string;
};

export type RequestAccessCopy = {
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

type RequestAccessFormProps = {
  onSubmit: (values: RequestAccessValues) => Promise<void>;
  copy: RequestAccessCopy;
  initialValues?: Partial<RequestAccessValues>;
  className?: string;
  submitButtonClassName?: string;
};

export function RequestAccessForm({
  onSubmit,
  copy,
  initialValues,
  className,
  submitButtonClassName,
}: RequestAccessFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [company, setCompany] = useState(initialValues?.company ?? "");
  const [role, setRole] = useState(initialValues?.role ?? "");
  const [hiringNeed, setHiringNeed] = useState(initialValues?.hiringNeed ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setName(initialValues?.name ?? "");
    setCompany(initialValues?.company ?? "");
    setRole(initialValues?.role ?? "");
    setHiringNeed(initialValues?.hiringNeed ?? "");
  }, [
    initialValues?.company,
    initialValues?.hiringNeed,
    initialValues?.name,
    initialValues?.role,
  ]);

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
    <form onSubmit={handleSubmit} className={className ?? ""}>
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
      <BareButton
        type="submit"
        disabled={isSubmitting}
        className={
          submitButtonClassName ??
          "mt-12 inline-flex w-full items-center justify-center rounded-full bg-black px-5 py-3.5 text-sm font-medium text-neutral-00 transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-70"
        }
      >
        {isSubmitting ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          copy.submit
        )}
      </BareButton>
    </form>
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
      <div className="mb-2 text-left text-sm font-medium text-neutral-primary">
        {label}
      </div>
      <UiInput
        unstyled
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-neutral-1000-a05 bg-bg-default px-4 py-3 text-sm text-neutral-primary placeholder:text-neutral-placeholder focus:border-neutral-1000-a10 focus:outline-none"
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
    <label className="block w-full">
      <div className="mb-2 text-sm text-left w-full font-medium text-neutral-primary">
        {label}
      </div>
      <UiTextarea
        unstyled
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full resize-none rounded-2xl border border-neutral-1000-a05 bg-bg-default px-4 py-3 text-sm text-neutral-primary placeholder:text-neutral-placeholder focus:border-neutral-1000-a10 focus:outline-none"
      />
    </label>
  );
}
