"use client";

import { useOrgT } from "@/i18n/org/OrgLocaleProvider";

import { FormEvent, useId, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const t = useOrgT();
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
      setError(t("CompanyIntroDecisionDialogs.815bee3d", "후보자에게 전할 회사의 관심 이유를 적어 주세요."));
      return;
    }
    if (recipientEmails.length === 0) {
      setError(t("CompanyIntroDecisionDialogs.d6efe059", "후보자가 수락했을 때 CC할 회사 이메일을 입력해 주세요."));
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
        submitError instanceof Error
          ? submitError.message
          : t("CompanyIntroDecisionDialogs.ba9a9a7b", "제안을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="max-w-[620px]">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {t("CompanyIntroDecisionDialogs.5e461bbe", "Request Intro: {candidateName}", { candidateName })}
            </DialogTitle>
            <DialogDescription>
              {t("CompanyIntroDecisionDialogs.9bd298a1", "후보자가 수락하면 소개 이메일로 연결하고 연결됨으로 옮겨요.")}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-5 text-[13px]">
            <div className="block">
              <label
                className="mb-2 block font-medium text-neutral-primary"
                htmlFor={`${fieldId}-appeal`}
              >
                {t("CompanyIntroDecisionDialogs.efa9700e", "후보자에게 전할 회사의 관심 이유")}
              </label>
              <Textarea
                className="min-h-28"
                disabled={pending}
                id={`${fieldId}-appeal`}
                onChange={(event) => setCompanyAppeal(event.target.value)}
                placeholder={t("CompanyIntroDecisionDialogs.d286b257", "예: 지금까지 만든 제품과 초기 팀에서의 오너십이 저희가 찾는 역할과 잘 맞습니다. 특히 … 이야기를 나눠보고 싶습니다.")}
                value={companyAppeal}
              />
            </div>
          </div>

          <label className="mt-4 block text-[13px]">
            {t("CompanyIntroDecisionDialogs.f4c1c1d1", "수락 시 소개 이메일을 받을 회사 이메일")}
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
          <DialogFooter className="mt-6">
            <MuteButton disabled={pending} onClick={onClose} type="button">
              {t("CompanyIntroDecisionDialogs.2ab81060", "취소")}
            </MuteButton>
            <MuteButton disabled={pending} type="submit" variant="dark">
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {t("CompanyIntroDecisionDialogs.e0eb989a", "Request Intro")}
            </MuteButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const t = useOrgT();
  const [error, setError] = useState("");

  const confirm = async () => {
    setError("");
    try {
      await onConfirm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("CompanyIntroDecisionDialogs.f1c2dd5c", "제안하지 않기를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            {t("CompanyIntroDecisionDialogs.ba18dc73", "{name}님에게 제안하지 않겠습니까?", { name: candidateName })}
          </DialogTitle>
          <DialogDescription>
            {t("CompanyIntroDecisionDialogs.b6defc38", "이 후보자에게 역할을 제안하지 않고 목록에서 제외합니다. 후보자에게 연락하거나 알림을 보내지 않습니다.")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            aria-live="polite"
            className="mt-4 text-[13px] text-critical"
            role="status"
          >
            {error}
          </p>
        ) : null}
        <DialogFooter className="mt-5">
          <MuteButton disabled={pending} onClick={onClose} type="button">
            {t("CompanyIntroDecisionDialogs.2ab81060", "취소")}
          </MuteButton>
          <MuteButton
            disabled={pending}
            onClick={() => void confirm()}
            type="button"
            variant="dark"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {t("CompanyIntroDecisionDialogs.3afcab0e", "제안하지 않기")}
          </MuteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
