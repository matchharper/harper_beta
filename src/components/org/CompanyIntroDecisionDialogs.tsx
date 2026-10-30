"use client";

import TalentCareerModal from "@/components/common/TalentCareerModal";

import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";

import { FormEvent, useId, useRef, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { MuteButton } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Ticket } from "@/components/ui/ticket";
import { cn } from "@/lib/utils";
import type { OrgMember } from "@/lib/org/server";
import { useOrgEntitlements } from "@/hooks/org/useOrgBilling";
import { creditSlotForRole, formatIntroCount } from "@/lib/org/billing/types";

export function CompanyIntroRequestDialog({
  candidateName,
  candidateNames,
  defaultEmail,
  members,
  onClose,
  onSubmit,
  open,
  pending,
  roleId,
  workspaceId,
}: {
  candidateName?: string;
  /** Several candidates: each gets its own reason for interest. */
  candidateNames?: string[];
  defaultEmail?: string | null;
  /** Teammates to pick from; without them the emails are typed in. */
  members?: Pick<OrgMember, "email" | "name" | "userId">[];
  onClose: () => void;
  onSubmit: (value: {
    companyAppeal: string;
    /** One reason per candidate, in the order of `candidateNames`. */
    companyAppeals: string[];
    introRecipientEmails: string[];
  }) => Promise<unknown> | void;
  open: boolean;
  pending: boolean;
  /** With `workspaceId`, shows how many Intros this uses. */
  roleId?: string | null;
  /** With `roleId`, shows how many Intros this uses. */
  workspaceId?: string;
}) {
  const modalFormId1 = useId();
  const fieldId = useId();

  const { locale, c } = useOrgLocale();
  const names = candidateNames ?? [candidateName ?? ""];
  const count = Math.max(1, names.length);
  const [appeals, setAppeals] = useState<string[]>(() =>
    Array.from({ length: count }, () => "")
  );
  const [showMissing, setShowMissing] = useState(false);
  const myEmail = defaultEmail?.trim().toLowerCase() ?? "";
  const [emails, setEmails] = useState(defaultEmail?.trim() ?? "");
  const [recipients, setRecipients] = useState<string[]>(() =>
    myEmail ? [myEmail] : []
  );
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const teammates = (members ?? []).flatMap((member) => {
    const email = member.email?.trim().toLowerCase();
    return email
      ? [{ email, name: member.name?.trim() || email.split("@")[0] }]
      : [];
  });
  const pickTeammates = teammates.length > 0;
  const memberLabel = (email: string) => {
    const name =
      teammates.find((member) => member.email === email)?.name ||
      email.split("@")[0];
    return email === myEmail ? c("{p0}(나)", "{p0} (you)", { p0: name }) : name;
  };
  const [error, setError] = useState("");
  const submitting = useRef(false);

  const setAppeal = (index: number, value: string) => {
    setAppeals((rows) => rows.map((row, at) => (at === index ? value : row)));
    if (error) setError("");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || submitting.current) return;
    const recipientEmails = pickTeammates
      ? recipients
      : Array.from(
          new Set(
            emails
              .split(/[\s,;]+/)
              .map((email) => email.trim().toLowerCase())
              .filter(Boolean)
          )
        );
    const trimmed = appeals.map((appeal) => appeal.trim());
    if (trimmed.some((appeal) => !appeal)) {
      setShowMissing(true);
      setError(
        count > 1
          ? c(
              "관심 이유를 쓰지 않은 후보가 있어요.",
              "Add a reason for every candidate."
            )
          : c("관심 이유를 입력해 주세요.", "Add a reason for your interest.")
      );
      return;
    }
    if (recipientEmails.length === 0) {
      setError(
        c(
          pickTeammates
            ? "수락하면 연결할 팀원을 1명 이상 골라 주세요."
            : "연결할 팀원 이메일을 입력해 주세요.",
          "Add a team member's email for the introduction."
        )
      );
      return;
    }
    setError("");
    submitting.current = true;
    try {
      await onSubmit({
        companyAppeal: trimmed[0],
        companyAppeals: trimmed,
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

  const appealField = (index: number) => (
    <Textarea
      aria-label={
        count > 1
          ? c("{p0}님에게 전할 관심 이유", "Why you're interested in {p0}", {
              p0: names[index],
            })
          : undefined
      }
      className={cn(
        "text-[13px] leading-5",
        count > 1 ? "min-h-16" : "min-h-28",
        showMissing && !appeals[index]?.trim() && "border-critical"
      )}
      disabled={pending}
      id={count > 1 ? undefined : `${fieldId}-appeal`}
      maxLength={2000}
      onChange={(event) => setAppeal(index, event.target.value)}
      placeholder={c(
        "관심 있는 경험, 함께할 역할",
        "Relevant experience and the role"
      )}
      rows={count > 1 ? 2 : 4}
      value={appeals[index] ?? ""}
    />
  );

  return (
    <TalentCareerModal
      bodyClassName="max-h-[calc(100dvh-176px)] overflow-y-auto px-5 pb-5 sm:px-6"
      closeOnBackdrop={!pending}
      description={
        count > 1
          ? names.length > 3
            ? c("{p0} 외 {p1}명", "{p0} and {p1} more", {
                p0: names.slice(0, 3).join(", "),
                p1: names.length - 3,
              })
            : names.join(", ")
          : undefined
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <MuteButton disabled={pending} onClick={onClose} type="button">
            {c("취소", "Cancel")}
          </MuteButton>
          <MuteButton
            disabled={pending}
            form={modalFormId1}
            type="submit"
            variant="dark"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {count > 1
              ? c("{p0}명에게 보내기", "Send to {p0}", { p0: count })
              : c("Send Intro", "Send Intro")}
            {/* <Ticket /> */}
          </MuteButton>
        </div>
      }
      footerClassName="border-t border-neutral-1000-a05 bg-bg-floating px-5 py-4 sm:px-6"
      headerClassName="bg-bg-floating px-5 pb-4 pt-6 sm:px-6"
      mobileBottomSheet
      onClose={() => !pending && onClose()}
      open={open}
      panelClassName="max-w-lg border-neutral-1000-a05 bg-bg-floating"
      showCloseButton={!pending}
      title={
        count > 1
          ? c("Send Intro · {p0}명", "Send Intro · {p0} candidates", {
              p0: count,
            })
          : c("Send Intro · {p0}", "Send Intro · {p0}", {
              p0: names[0] || c("후보자", "candidate"),
            })
      }
    >
      <form className="space-y-4" id={modalFormId1} onSubmit={submit}>
        <div>
          <label
            className="text-[12px] text-neutral-muted"
            htmlFor={count > 1 ? undefined : `${fieldId}-appeal`}
          >
            {c("후보자에게 전할 관심 이유", "Why you're interested")}
          </label>
          {count > 1 ? (
            <ul className="mt-1.5 space-y-3">
              {names.map((name, index) => (
                <li key={`${name}:${index}`}>
                  <div className="mb-1 text-[13px] text-neutral-primary">
                    {name}
                  </div>
                  {appealField(index)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1.5">{appealField(0)}</div>
          )}
          {count > 1 ? (
            <p className="mt-1.5 text-[12px] text-neutral-soft">
              {c(
                "각 후보자에게 따로 가요. 서로의 정보는 보이지 않아요.",
                "Each candidate gets their own message and can't see the others."
              )}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 text-[12px] leading-5">
          {pickTeammates ? (
            <div className="flex flex-wrap items-baseline gap-x-2 text-neutral-muted">
              <span>
                {c("수락하면 연결할 팀원", "Teammates to introduce")}{" "}
                <span className="text-neutral-primary">
                  {recipients.map(memberLabel).join(", ") || "—"}
                </span>
              </span>
              <button
                aria-expanded={recipientsOpen}
                className="text-blue-500 underline-offset-2 hover:text-blue-700 hover:underline"
                onClick={() => setRecipientsOpen((value) => !value)}
                type="button"
              >
                {c("바꾸기", "Change")}
              </button>
            </div>
          ) : (
            <label className="block text-neutral-muted">
              {c("수락 시 연결할 팀원 이메일", "Team members to introduce")}
              <Input
                className="mt-1.5 text-[13px]"
                disabled={pending}
                onChange={(event) => {
                  setEmails(event.target.value);
                  if (error) setError("");
                }}
                placeholder="name@company.com"
                value={emails}
              />
            </label>
          )}
          {pickTeammates && recipientsOpen ? (
            <div className="flex flex-wrap gap-1.5 rounded-md bg-bg-weak p-3">
              {teammates.map((member) => {
                const selected = recipients.includes(member.email);
                return (
                  <MuteButton
                    aria-pressed={selected}
                    disabled={pending}
                    key={member.email}
                    onClick={() => {
                      setRecipients((current) =>
                        current.includes(member.email)
                          ? current.filter((email) => email !== member.email)
                          : [...current, member.email]
                      );
                      if (error) setError("");
                    }}
                    size="sm"
                    title={member.email}
                    type="button"
                    variant={selected ? "neutral" : "default"}
                  >
                    {selected ? (
                      <X className="size-3" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                    {memberLabel(member.email)}
                  </MuteButton>
                );
              })}
            </div>
          ) : null}
          {workspaceId && roleId ? (
            <IntroUsage
              count={count}
              roleId={roleId}
              workspaceId={workspaceId}
            />
          ) : null}
        </div>
        {error ? (
          <p
            className="rounded-md bg-critical-faded px-3 py-2.5 text-[12px] leading-5 text-critical"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </form>
    </TalentCareerModal>
  );
}

/** Intros the request uses, as the connect form shows them. */
function IntroUsage({
  count,
  roleId,
  workspaceId,
}: {
  count: number;
  roleId: string;
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const entitlements = useOrgEntitlements(workspaceId);
  const slot = creditSlotForRole(entitlements.data?.creditSlots, roleId);
  return (
    <p className="tabular-nums text-neutral-muted">
      {c("Intro {p0}개 사용", "Uses {p0}", {
        p0: locale === "en" ? formatIntroCount(count, locale) : count,
      })}
      {slot ? (
        <>
          {" · "}
          {c("이번 달 {p0} 남음", "{p0} left this month", {
            p0: formatIntroCount(slot.remaining, locale),
          })}
        </>
      ) : null}
    </p>
  );
}
