import { LoaderCircle } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TextField } from "@/components/ui/input";
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
      setError("이름, 성, 직함을 모두 입력해 주세요.");
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
          : "프로필을 저장하지 못했습니다."
      );
    }
  };

  return (
    <Dialog open>
      <DialogContent
        hideCloseButton
        className="max-w-md gap-6 rounded-xl p-6 sm:p-7"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="gap-2">
          <DialogTitle className="text-[18px]">
            프로필을 완성해 주세요
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              autoComplete="given-name"
              autoFocus
              id="org-member-first-name"
              label="이름"
              maxLength={100}
              onChange={(event) => {
                setError(null);
                setFirstName(event.target.value);
              }}
              placeholder="이름"
              required
              value={firstName}
            />
            <TextField
              autoComplete="family-name"
              id="org-member-last-name"
              label="성"
              maxLength={100}
              onChange={(event) => {
                setError(null);
                setLastName(event.target.value);
              }}
              placeholder="성"
              required
              value={lastName}
            />
          </div>
          <TextField
            autoComplete="organization-title"
            id="org-member-role"
            label="직함"
            maxLength={160}
            onChange={(event) => {
              setError(null);
              setRole(event.target.value);
            }}
            placeholder="예: 채용 매니저, CTO"
            required
            value={role}
          />

          {error ? (
            <p className="text-[12px] leading-5 text-critical" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <MuteButton
              className="w-full py-2"
              disabled={updateProfile.isPending}
              size="lg"
              type="submit"
              variant="primary"
            >
              {updateProfile.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              시작하기
            </MuteButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
