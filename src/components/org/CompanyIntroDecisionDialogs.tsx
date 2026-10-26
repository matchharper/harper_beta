"use client";

import TalentCareerModal from "@/components/common/TalentCareerModal";

import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";

import { FormEvent, useId, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { MuteButton } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function CompanyIntroRequestDialog({
  candidateName,
  defaultEmail,
  onClose,
  onSubmit,
  open,
  pending,
}: {
  candidateName: string;
  defaultEmail?: string | null;
  onClose: () => void;
  onSubmit: (value: {
    companyAppeal: string;
    introRecipientEmails: string[];
  }) => Promise<unknown>;
  open: boolean;
  pending: boolean;
}) {
  const modalFormId1 = useId();

  const { locale, c } = useOrgLocale();
  const fieldId = useId();
  const [companyAppeal, setCompanyAppeal] = useState("");
  const [emails, setEmails] = useState(defaultEmail?.trim() ?? "");
  const [error, setError] = useState("");
  const submitting = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || submitting.current) return;
    const recipientEmails = Array.from(
      new Set(
        emails
          .split(/[\s,;]+/)
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      )
    );
    const appeal = companyAppeal.trim();
    if (!appeal) {
      setError(
        c("관심 이유를 입력해 주세요.", "Add a reason for your interest.")
      );
      return;
    }
    if (recipientEmails.length === 0) {
      setError(
        c(
          "연결할 팀원 이메일을 입력해 주세요.",
          "Add a team member's email for the introduction."
        )
      );
      return;
    }
    setError("");
    submitting.current = true;
    try {
      await onSubmit({
        companyAppeal: appeal,
        introRecipientEmails: recipientEmails,
      });
    } catch (submitError) {
      setError(
        localizedOrgErrorMessage(
          submitError,
          locale,
          c(
            "제안을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
            "We couldn't complete the Intro request. Try again later."
          )
        )
      );
    } finally {
      submitting.current = false;
    }
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={() => !pending && onClose()}
      mobileBottomSheet
      title={c("Intro 보내기", "Send intro")}
      description={candidateName}
      panelClassName="max-w-[620px]"
      bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MuteButton
            disabled={pending}
            onClick={onClose}
            type="button"
            form={modalFormId1}
          >
            {c("취소", "Cancel")}
          </MuteButton>
          <MuteButton
            disabled={pending}
            type="submit"
            variant="dark"
            form={modalFormId1}
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {c("Intro 보내기", "Send intro")}
          </MuteButton>
        </div>
      }
    >
      <form onSubmit={submit} id={modalFormId1}>
        <div className="mt-5 space-y-5 text-[13px]">
          <div className="block">
            <label
              className="mb-2 block font-medium text-neutral-primary"
              htmlFor={`${fieldId}-appeal`}
            >
              {c("후보자에게 전할 관심 이유", "Why you're interested")}
            </label>
            <Textarea
              className="min-h-28"
              disabled={pending}
              id={`${fieldId}-appeal`}
              onChange={(event) => setCompanyAppeal(event.target.value)}
              placeholder={c(
                "관심 있는 경험, 함께할 역할",
                "Relevant experience and the role"
              )}
              value={companyAppeal}
            />
          </div>
        </div>

        <label className="mt-4 block text-[13px]">
          {c("수락 시 연결할 팀원 이메일", "Team members to introduce")}
          <Input
            className="mt-2"
            value={emails}
            disabled={pending}
            onChange={(event) => setEmails(event.target.value)}
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-critical">
            {error}
          </p>
        ) : null}
      </form>
    </TalentCareerModal>
  );
}
