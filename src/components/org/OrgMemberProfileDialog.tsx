import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { LoaderCircle } from "lucide-react";
import { useId, type FormEvent, useMemo, useState } from "react";
import { MuteButton } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { useUpdateOrgMemberProfile } from "@/hooks/org/useOrg";
import type { OrgMember, OrgWorkspace } from "@/lib/org/server";

function getNameDefaults(member: OrgMember) {
  const name = member.name?.trim() ?? "";
  const email = member.email?.trim() ?? "";
  if (!name || name === email || name === "Anonymous") {
    return { firstName: "", lastName: "" };
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    return { firstName: parts[0] ?? "", lastName: "" };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

export function OrgMemberProfileDialog({
  member,
  workspace,
}: {
  member: OrgMember;
  workspace: OrgWorkspace;
}) {
  const modalFormId1 = useId();
  const { c } = useOrgLocale();
  const defaults = useMemo(() => getNameDefaults(member), [member]);
  const updateProfile = useUpdateOrgMemberProfile();
  const [firstName, setFirstName] = useState(defaults.firstName);
  const [lastName, setLastName] = useState(defaults.lastName);
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  if (completed) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (updateProfile.isPending) return;

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedRole = role.trim();
    if (!normalizedFirstName || !normalizedLastName || !normalizedRole) {
      setError(
        c(
          "이름, 성, 직함을 모두 입력해 주세요.",
          "Enter your first name, last name, and job title."
        )
      );
      return;
    }

    setError(null);
    try {
      await updateProfile.mutateAsync({
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        role: normalizedRole,
        workspaceId: workspace.workspaceId,
      });
      setCompleted(true);
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : c("프로필을 저장하지 못했습니다.", "Failed to save profile.")
      );
    }
  };

  return (
    <TalentCareerModal
      open
      onClose={() => {}}
      mobileBottomSheet
      title={<>{c("프로필을 완성해 주세요", "Complete your profile")}</>}
      panelClassName="max-w-md"
      bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
      showCloseButton={false}
      onEscapeKeyDown={(event) => event.preventDefault()}
      closeOnBackdrop={false}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MuteButton
            className="w-full py-2"
            disabled={updateProfile.isPending}
            size="lg"
            type="submit"
            variant="primary"
            form={modalFormId1}
          >
            {updateProfile.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            {c("시작하기", "Get started")}
          </MuteButton>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => void handleSubmit(event)}
        id={modalFormId1}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label
            className="grid gap-1.5 text-[13px] font-medium text-neutral-primary"
            htmlFor="org-member-first-name"
          >
            <span>{c("이름", "First name")}</span>
            <Input
              autoComplete="given-name"
              autoFocus
              id="org-member-first-name"
              maxLength={100}
              onChange={(event) => {
                setError(null);
                setFirstName(event.target.value);
              }}
              placeholder={c("이름", "First name")}
              required
              value={firstName}
            />
          </label>
          <label
            className="grid gap-1.5 text-[13px] font-medium text-neutral-primary"
            htmlFor="org-member-last-name"
          >
            <span>{c("성", "Last name")}</span>
            <Input
              autoComplete="family-name"
              id="org-member-last-name"
              maxLength={100}
              onChange={(event) => {
                setError(null);
                setLastName(event.target.value);
              }}
              placeholder={c("성", "Last name")}
              required
              value={lastName}
            />
          </label>
        </div>
        <label
          className="grid gap-1.5 text-[13px] font-medium text-neutral-primary"
          htmlFor="org-member-role"
        >
          <span>{c("직함", "Job title")}</span>
          <Input
            autoComplete="organization-title"
            id="org-member-role"
            maxLength={160}
            onChange={(event) => {
              setError(null);
              setRole(event.target.value);
            }}
            placeholder={c(
              "예: 채용 매니저, CTO",
              "e.g., Recruiting Manager, CTO"
            )}
            required
            value={role}
          />
        </label>

        {error ? (
          <p className="text-[12px] leading-5 text-critical" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </TalentCareerModal>
  );
}
