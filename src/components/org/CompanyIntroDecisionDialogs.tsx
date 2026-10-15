"use client";

import TalentCareerModal from "@/components/common/TalentCareerModal";

import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";

import { FormEvent, useId, useState } from "react";
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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
        c(
          "후보자에게 전할 회사의 관심 이유를 적어 주세요.",
          "Tell Harper why you're interested. It will share this with the candidate."
        )
      );
      return;
    }
    if (recipientEmails.length === 0) {
      setError(
        c(
          "후보자가 수락했을 때 CC할 회사 이메일을 입력해 주세요.",
          "Company contact to CC on the intro email"
        )
      );
      return;
    }
    setError("");
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
            "Failed to process the offer. Try again later."
          )
        )
      );
    }
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={() => !pending && onClose()}
      mobileBottomSheet
      title={
        <>
          {c(
            "Request Intro: {candidateName}",
            "Request intro: {candidateName}",
            { candidateName }
          )}
        </>
      }
      description={
        <>
          {c(
            "후보자가 수락하면 소개 이메일로 연결하고 연결됨으로 옮겨요.",
            "If the candidate accepts, send the intro email and move them to Connected."
          )}
        </>
      }
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
            {c("Request Intro", "Request intro")}
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
              {c("후보자에게 전할 회사의 관심 이유", "Why you're interested")}
            </label>
            <Textarea
              className="min-h-28"
              disabled={pending}
              id={`${fieldId}-appeal`}
              onChange={(event) => setCompanyAppeal(event.target.value)}
              placeholder={c(
                "예: 지금까지 만든 제품과 초기 팀에서의 오너십이 저희가 찾는 역할과 잘 맞습니다. 특히 … 이야기를 나눠보고 싶습니다.",
                "e.g. Your product work and ownership in early teams stood out. We'd like to discuss this role with you."
              )}
              value={companyAppeal}
            />
          </div>
        </div>

        <label className="mt-4 block text-[13px]">
          {c(
            "수락 시 소개 이메일을 받을 회사 이메일",
            "Company contact for the intro email"
          )}
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

export function CompanyIntroPassDialog({
  candidateName,
  onClose,
  onConfirm,
  open,
  pending,
}: {
  candidateName: string;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
  open: boolean;
  pending: boolean;
}) {
  const { c } = useOrgLocale();
  const [error, setError] = useState("");

  const confirm = async () => {
    setError("");
    try {
      await onConfirm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : c(
              "제안하지 않기를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
              "Couldn't remove candidate. Try again."
            )
      );
    }
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={() => !pending && onClose()}
      mobileBottomSheet
      title={
        <>
          {c("{name}님에게 제안하지 않겠습니까?", "Pass on {name}?", {
            name: candidateName,
          })}
        </>
      }
      description={
        <>
          {c(
            "이 후보자에게 역할을 제안하지 않고 목록에서 제외합니다. 후보자에게 연락하거나 알림을 보내지 않습니다.",
            "Remove this candidate from Suggested candidates? Harper won't contact or notify them."
          )}
        </>
      }
      panelClassName="max-w-[460px]"
      bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MuteButton disabled={pending} onClick={onClose} type="button">
            {c("취소", "Cancel")}
          </MuteButton>
          <MuteButton
            disabled={pending}
            onClick={() => void confirm()}
            type="button"
            variant="dark"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {c("제안하지 않기", "Pass")}
          </MuteButton>
        </div>
      }
    >
      {error ? (
        <p
          aria-live="polite"
          className="mt-4 text-[13px] text-critical"
          role="status"
        >
          {error}
        </p>
      ) : null}
    </TalentCareerModal>
  );
}
