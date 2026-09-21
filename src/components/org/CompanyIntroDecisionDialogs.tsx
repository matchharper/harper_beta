"use client";

import { FormEvent, useId, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { OrgMember, OrgStage } from "@/lib/org/server";

const NEW_STAGE_VALUE = "__new_stage__";

export function CompanyIntroRequestDialog({
  candidateName,
  defaultEmail,
  initialStageId,
  members,
  onClose,
  onSubmit,
  open,
  pending,
  roleId,
  roleName,
  stages,
}: {
  candidateName: string;
  defaultEmail?: string | null;
  initialStageId?: string | null;
  members: OrgMember[];
  onClose: () => void;
  onSubmit: (value: {
    companyAppeal: string;
    introRecipientEmails: string[];
    nextStageId: string | null;
    newStageLabel: string | null;
  }) => Promise<unknown>;
  open: boolean;
  pending: boolean;
  roleId: string;
  roleName: string;
  stages: OrgStage[];
}) {
  const fieldId = useId();
  const customStages = useMemo(
    () =>
      stages.filter(
        (stage) => stage.roleId === roleId && stage.id.startsWith("custom:")
      ),
    [roleId, stages]
  );
  const defaultStageValue = customStages.some(
    (stage) => stage.id === initialStageId
  )
    ? String(initialStageId)
    : (customStages[0]?.id ?? NEW_STAGE_VALUE);
  const [stageValue, setStageValue] = useState(defaultStageValue);
  const [newStageLabel, setNewStageLabel] = useState("");
  const [companyAppeal, setCompanyAppeal] = useState("");
  const [emails, setEmails] = useState(defaultEmail?.trim() ?? "");
  const [error, setError] = useState("");

  const memberEmails = members
    .map((member) => member.email?.trim())
    .filter((email): email is string => Boolean(email));

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
    const creatingStage = stageValue === NEW_STAGE_VALUE;
    if (!appeal) {
      setError("후보자에게 전할 회사의 관심 이유를 적어 주세요.");
      return;
    }
    if (recipientEmails.length === 0) {
      setError("후보자가 수락했을 때 CC할 회사 이메일을 입력해 주세요.");
      return;
    }
    if (creatingStage && !newStageLabel.trim()) {
      setError("후보자가 수락한 뒤 이동할 첫 단계를 입력해 주세요.");
      return;
    }
    setError("");
    try {
      await onSubmit({
        companyAppeal: appeal,
        introRecipientEmails: recipientEmails,
        newStageLabel: creatingStage ? newStageLabel.trim() : null,
        nextStageId: creatingStage ? null : stageValue.slice("custom:".length),
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "제안을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="max-w-[620px]">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{candidateName}님에게 먼저 제안하기</DialogTitle>
            <DialogDescription>
              아직 후보자에게 이 역할을 추천하지 않았고, 관심 여부도 확인되지
              않았습니다. 만나고 싶은 이유를 적으면 Harper가 회사를 대신해
              제안 메일을 보냅니다. 후보자가 수락하면 회사의 추가 승인 없이
              아래 담당자들과 소개 이메일로 연결하고 선택한 첫 단계로 이동합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-5 text-[13px]">
            <div className="block">
              <label
                className="mb-2 block font-medium text-neutral-primary"
                htmlFor={`${fieldId}-appeal`}
              >
                {roleName}에 이 후보자를 만나고 싶은 이유
              </label>
              <Textarea
                aria-describedby={`${fieldId}-appeal-help`}
                className="min-h-28"
                disabled={pending}
                id={`${fieldId}-appeal`}
                onChange={(event) => setCompanyAppeal(event.target.value)}
                placeholder="예: 지금까지 만든 제품과 초기 팀에서의 오너십이 저희가 찾는 역할과 잘 맞습니다. 특히 … 이야기를 나눠보고 싶습니다."
                value={companyAppeal}
              />
              <span
                className="mt-1 block text-[12px] text-neutral-muted"
                id={`${fieldId}-appeal-help`}
              >
                사실에 근거해 후보자에게 전달되며, Harper가 임의로 회사의 관심
                정도를 과장하지 않습니다.
              </span>
            </div>

            <div className="block">
              <label
                className="mb-2 block font-medium text-neutral-primary"
                id={`${fieldId}-stage-label`}
              >
                수락 후 첫 단계
              </label>
              <Select
                disabled={pending}
                onValueChange={(value) => value && setStageValue(value)}
                value={stageValue}
              >
                <SelectTrigger aria-labelledby={`${fieldId}-stage-label`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_STAGE_VALUE}>
                    새 첫 단계 만들기
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {stageValue === NEW_STAGE_VALUE ? (
              <div className="block">
                <label
                  className="mb-2 block font-medium text-neutral-primary"
                  htmlFor={`${fieldId}-new-stage`}
                >
                  새 단계 이름
                </label>
                <Input
                  disabled={pending}
                  id={`${fieldId}-new-stage`}
                  maxLength={40}
                  onChange={(event) => setNewStageLabel(event.target.value)}
                  placeholder="예: 1차 인터뷰, 커피챗"
                  value={newStageLabel}
                />
              </div>
            ) : null}

            <div className="block">
              <label
                className="mb-2 block font-medium text-neutral-primary"
                htmlFor={`${fieldId}-emails`}
              >
                수락 시 CC할 담당자 이메일
              </label>
              <Input
                disabled={pending}
                id={`${fieldId}-emails`}
                onChange={(event) => setEmails(event.target.value)}
                placeholder="name@company.com, teammate@company.com"
                value={emails}
              />
              {memberEmails.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {memberEmails.map((email) => (
                    <MuteButton
                      aria-label={`${email} 추가`}
                      key={email}
                      onClick={() =>
                        setEmails((current) =>
                          current.toLowerCase().includes(email.toLowerCase())
                            ? current
                            : [current.trim(), email].filter(Boolean).join(", ")
                        )
                      }
                      size="sm"
                      type="button"
                      variant="neutral"
                    >
                      + {email}
                    </MuteButton>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? (
              <p aria-live="polite" className="text-critical" role="status">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter className="mt-6">
            <MuteButton disabled={pending} onClick={onClose} type="button">
              취소
            </MuteButton>
            <MuteButton disabled={pending} type="submit" variant="dark">
              {pending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              먼저 제안하기
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
  const [error, setError] = useState("");

  const confirm = async () => {
    setError("");
    try {
      await onConfirm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "제안하지 않기를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{candidateName}님에게 제안하지 않겠습니까?</DialogTitle>
          <DialogDescription>
            이 후보자에게 역할을 제안하지 않고 목록에서 제외합니다.
            후보자에게 연락하거나 알림을 보내지 않습니다.
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
            취소
          </MuteButton>
          <MuteButton
            disabled={pending}
            onClick={() => void confirm()}
            type="button"
            variant="dark"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            제안하지 않기
          </MuteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
