import { Ellipsis, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input, TextField } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Radio } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import {
  useCancelOrgInvitation,
  useSendOrgInvitations,
  useUpdateOrgMembershipRole,
  useUpdateOrgWorkspace,
} from "@/hooks/org/useOrg";
import {
  getOrgRoleLabel,
  ORG_MEMBERSHIP_ROLE_OPTIONS,
  type OrgMembershipRole,
  type OrgPermissions,
} from "@/lib/org/permissions";
import type {
  OrgMember,
  OrgWorkspace,
  OrgWorkspaceInvitation,
} from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function MemberAvatar({ member }: { member: OrgMember }) {
  const label = member.name || member.email || "User";
  if (member.profilePicture) {
    return (
      <Image
        alt=""
        className="size-8 shrink-0 rounded-full object-cover"
        height={32}
        src={member.profilePicture}
        unoptimized
        width={32}
      />
    );
  }
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function InviteMemberDialog({
  invitations,
  members,
  onOpenChange,
  open,
  workspace,
}: {
  invitations: OrgWorkspaceInvitation[];
  members: OrgMember[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  workspace: OrgWorkspace;
}) {
  const addToast = useToastStore((state) => state.add);
  const sendInvitations = useSendOrgInvitations();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgMembershipRole>("admin");
  const [error, setError] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setEmail("");
      setRole("admin");
      setError("");
    }
    onOpenChange(nextOpen);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    if (
      members.some(
        (member) => member.email?.trim().toLowerCase() === normalizedEmail
      )
    ) {
      setError("이미 참여 중인 멤버입니다.");
      return;
    }
    if (
      invitations.some(
        (invitation) =>
          invitation.email.trim().toLowerCase() === normalizedEmail
      )
    ) {
      setError(
        "이미 초대 대기 중입니다. 멤버 목록의 더보기에서 다시 보내기를 선택해 주세요."
      );
      return;
    }
    setError("");
    try {
      const payload = await sendInvitations.mutateAsync({
        emails: [normalizedEmail],
        role,
        workspaceId: workspace.workspaceId,
      });
      const result = payload.results[0];
      if (!result || result.status !== "sent") {
        setError(result?.message || "초대 메일을 보내지 못했습니다.");
        return;
      }
      addToast({
        message: `${normalizedEmail}로 초대 메일을 보냈습니다.`,
        variant: "success",
      });
      handleOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "초대 메일을 보내지 못했습니다."
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[500px] gap-4 rounded-lg p-6">
        <DialogHeader>
          <DialogTitle className="text-[18px]">멤버 초대</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            이메일과 Organization에서 사용할 권한을 선택하세요.
          </DialogDescription>
        </DialogHeader>
        <form className="mt-1 space-y-4" onSubmit={submit}>
          <TextField
            autoFocus
            id="org-invite-email"
            label="이메일"
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError("");
            }}
            placeholder="name@company.com"
            status={error ? "error" : "default"}
            type="email"
            value={email}
            errorText={error}
            size="medium"
          />
          <fieldset>
            <legend className="text-[13px] font-medium text-neutral-primary">
              권한
            </legend>
            <div className="mt-2 divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
              {ORG_MEMBERSHIP_ROLE_OPTIONS.map((option) => (
                <Radio
                  key={option.value}
                  checked={role === option.value}
                  className="flex w-full gap-3 py-3.5"
                  disabled={sendInvitations.isPending}
                  id={`org-invite-role-${option.value}`}
                  label={
                    <span className="block min-w-0">
                      <span className="block text-[14px] font-medium leading-5 text-neutral-primary">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[12px] font-light leading-5 text-neutral-muted">
                        {option.description}
                      </span>
                    </span>
                  }
                  name="org-invite-role"
                  onChange={() => setRole(option.value)}
                  size="medium"
                  value={option.value}
                />
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <MuteButton
              disabled={sendInvitations.isPending}
              onClick={() => handleOpenChange(false)}
              size="md"
              type="button"
            >
              취소
            </MuteButton>
            <MuteButton
              disabled={sendInvitations.isPending}
              size="md"
              type="submit"
              variant="primary"
            >
              {sendInvitations.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              초대 보내기
            </MuteButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrgTeamPage({
  currentUser,
  invitations,
  members,
  permissions,
  workspace,
}: {
  currentUser: OrgMember | null;
  invitations: OrgWorkspaceInvitation[];
  members: OrgMember[];
  permissions: OrgPermissions;
  workspace: OrgWorkspace;
}) {
  const addToast = useToastStore((state) => state.add);
  const updateWorkspace = useUpdateOrgWorkspace();
  const sendInvitations = useSendOrgInvitations();
  const cancelInvitation = useCancelOrgInvitation();
  const updateMembershipRole = useUpdateOrgMembershipRole();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitationToCancel, setInvitationToCancel] =
    useState<OrgWorkspaceInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [companyDescription, setCompanyDescription] = useState(
    workspace.companyDescription ?? ""
  );
  const [pitch, setPitch] = useState(workspace.pitch ?? "");
  const [companyError, setCompanyError] = useState("");
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `/org?orgId=${workspace.workspaceId}`;
    }
    return `${window.location.origin}/org?orgId=${workspace.workspaceId}`;
  }, [workspace.workspaceId]);
  const hasCompanyChanges =
    companyDescription !== (workspace.companyDescription ?? "") ||
    pitch !== (workspace.pitch ?? "");

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      addToast({
        message: "초대 링크를 복사하지 못했습니다.",
        variant: "error",
      });
    }
  };

  const saveCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCompanyError("");
    try {
      await updateWorkspace.mutateAsync({
        companyDescription: companyDescription.trim() || null,
        pitch: pitch.trim() || null,
        request: workspace.request,
        workspaceId: workspace.workspaceId,
      });
      addToast({ message: "회사 정보를 저장했습니다.", variant: "success" });
    } catch (saveError) {
      setCompanyError(
        saveError instanceof Error
          ? saveError.message
          : "회사 정보를 저장하지 못했습니다."
      );
    }
  };

  const resendInvitation = async (invitation: OrgWorkspaceInvitation) => {
    try {
      const payload = await sendInvitations.mutateAsync({
        emails: [invitation.email],
        role: invitation.role,
        workspaceId: workspace.workspaceId,
      });
      const result = payload.results[0];
      if (!result || result.status !== "sent") {
        throw new Error(result?.message || "초대 메일을 보내지 못했습니다.");
      }
      addToast({ message: "초대 메일을 다시 보냈습니다.", variant: "success" });
    } catch (resendError) {
      addToast({
        message:
          resendError instanceof Error
            ? resendError.message
            : "초대 메일을 보내지 못했습니다.",
        variant: "error",
      });
    }
  };

  const cancelPendingInvitation = async (
    invitation: OrgWorkspaceInvitation
  ) => {
    try {
      await cancelInvitation.mutateAsync({
        invitationId: invitation.invitationId,
        workspaceId: workspace.workspaceId,
      });
      addToast({ message: "초대를 취소했습니다." });
      setInvitationToCancel(null);
    } catch (cancelError) {
      addToast({
        message:
          cancelError instanceof Error
            ? cancelError.message
            : "초대를 취소하지 못했습니다.",
        variant: "error",
      });
    }
  };

  const changeMemberRole = async (
    member: OrgMember,
    role: OrgMembershipRole
  ) => {
    if (member.role === role) return;
    try {
      await updateMembershipRole.mutateAsync({
        role,
        userId: member.userId,
        workspaceId: workspace.workspaceId,
      });
      addToast({
        message: `${member.name || member.email || "멤버"}의 권한을 ${getOrgRoleLabel(role)}로 변경했습니다.`,
        variant: "success",
      });
    } catch (roleError) {
      addToast({
        message:
          roleError instanceof Error
            ? roleError.message
            : "권한을 변경하지 못했습니다.",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-8">
      <OrgPageHeader
        description="회사 정보와 Organization 멤버, 권한을 관리하세요."
        title="Team"
      />

      <OrgSection>
        <OrgSectionHeader
          description="Harper가 후보자에게 회사를 설명하고 적절한 인재를 연결할 때 사용합니다."
          title="회사 정보"
        />
        <form className="max-w-3xl space-y-5" onSubmit={saveCompany}>
          <label className="block">
            <span className="text-[14px] font-medium text-neutral-primary">
              회사 Pitch
            </span>
            <span className="mt-1 block text-[12px] font-light leading-5 text-neutral-muted">
              투자, 매출, 팀과 제품처럼 후보자에게 어필할 회사의 장점을 적어
              주세요.
            </span>
            <Textarea
              className="mt-2 min-h-28 px-3 py-2.5 text-[13px] leading-5"
              disabled={!permissions.canManageWorkspace}
              onChange={(event) => setPitch(event.target.value)}
              value={pitch}
            />
          </label>
          <label className="block">
            <span className="text-[14px] font-medium text-neutral-primary">
              회사 설명
            </span>
            <span className="mt-1 block text-[12px] font-light leading-5 text-neutral-muted">
              회사에 대한 객관적인 설명을 3~5문장으로 적어 주세요.
            </span>
            <Textarea
              className="mt-2 min-h-32 px-3 py-2.5 text-[13px] leading-5"
              disabled={!permissions.canManageWorkspace}
              onChange={(event) => setCompanyDescription(event.target.value)}
              value={companyDescription}
            />
          </label>
          {companyError ? (
            <p className="text-[12px] text-critical">{companyError}</p>
          ) : null}
          {permissions.canManageWorkspace ? (
            <div className="flex justify-end">
              <MuteButton
                disabled={!hasCompanyChanges || updateWorkspace.isPending}
                size="md"
                type="submit"
                variant="dark"
              >
                {updateWorkspace.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                변경사항 저장
              </MuteButton>
            </div>
          ) : (
            <p className="text-[12px] font-light text-neutral-soft">
              회사 정보는 Owner 또는 Admin이 수정할 수 있습니다.
            </p>
          )}
        </form>
      </OrgSection>

      <OrgSection>
        <OrgSectionHeader
          actions={
            permissions.canManageMembers ? (
              <MuteButton
                onClick={() => setInviteOpen(true)}
                size="md"
                variant="primary"
              >
                초대하기
              </MuteButton>
            ) : null
          }
          description="함께 후보자를 검토할 팀원을 초대하고 역할에 맞는 권한을 부여하세요."
          title="Organization"
        />

        <div className="space-y-6">
          <div className="max-w-3xl">
            <label className="text-[14px] font-medium text-neutral-primary">
              초대 링크
            </label>
            <p className="mt-1 text-[12px] font-light text-neutral-muted">
              링크로 가입한 멤버는 Viewer 권한으로 시작합니다.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Input
                className="h-10 min-w-0 bg-bg-default px-3 py-2 text-[13px]"
                readOnly
                value={inviteUrl}
              />
              <MuteButton
                className="shrink-0"
                onClick={() => void copyInvite()}
                size="md"
              >
                {copied ? "복사됨" : "링크 복사"}
              </MuteButton>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[14px] font-medium text-neutral-primary">
                멤버
              </h3>
              <span className="text-[12px] font-light text-neutral-soft">
                {members.length}명
                {invitations.length > 0
                  ? ` · 초대 대기 ${invitations.length}명`
                  : ""}
              </span>
            </div>
            <div className="divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05">
              {invitations.map((invitation) => (
                <div
                  className="flex items-center gap-3 px-3 py-3.5"
                  key={invitation.invitationId}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
                    {invitation.email.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-normal text-neutral-primary">
                      {invitation.email}
                    </span>
                    <span className="mt-1 block text-[12px] font-light text-neutral-soft">
                      {formatDate(invitation.lastSentAt)} 초대 ·{" "}
                      {getOrgRoleLabel(invitation.role)}
                    </span>
                  </span>
                  <Badge radius="full" size="sm" variant="faded">
                    수락 대기
                  </Badge>
                  {permissions.canManageMembers ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <MuteButton
                          aria-label={`${invitation.email} 초대 작업`}
                          size="md"
                          variant="transparent"
                        >
                          <Ellipsis className="size-4" />
                        </MuteButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          disabled={sendInvitations.isPending}
                          onSelect={() => void resendInvitation(invitation)}
                        >
                          다시 보내기
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={cancelInvitation.isPending}
                          onSelect={() => setInvitationToCancel(invitation)}
                          tone="danger"
                        >
                          초대 취소
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              ))}

              {members.map((member) => (
                <div
                  className="flex items-center gap-3 px-3 py-3.5"
                  key={member.userId}
                >
                  <MemberAvatar member={member} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-normal text-neutral-primary">
                        {member.name || member.email || "이름 없음"}
                      </span>
                      {member.userId === currentUser?.userId ? (
                        <Badge radius="full" size="sm" variant="faded">
                          나
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-[12px] font-light text-neutral-muted">
                      {member.email || "-"} · {formatDate(member.joinedAt)} 합류
                    </span>
                  </span>
                  {permissions.canManageMembers ? (
                    <Select
                      disabled={
                        updateMembershipRole.isPending &&
                        updateMembershipRole.variables?.userId === member.userId
                      }
                      onValueChange={(value) =>
                        void changeMemberRole(
                          member,
                          value as OrgMembershipRole
                        )
                      }
                      value={member.role}
                    >
                      <SelectTrigger
                        aria-label={`${member.name || member.email || "멤버"} 권한`}
                        className="h-9 w-[112px] text-[12px]"
                        size="sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {ORG_MEMBERSHIP_ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-[12px] font-normal text-neutral-muted">
                      {getOrgRoleLabel(member.role)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </OrgSection>

      <InviteMemberDialog
        invitations={invitations}
        members={members}
        onOpenChange={setInviteOpen}
        open={inviteOpen}
        workspace={workspace}
      />

      <Dialog
        open={Boolean(invitationToCancel)}
        onOpenChange={(open) => !open && setInvitationToCancel(null)}
      >
        <DialogContent className="max-w-sm gap-4 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px]">초대 취소</DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              {invitationToCancel?.email}의 초대 링크를 더 이상 사용할 수 없게
              합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <MuteButton
              disabled={cancelInvitation.isPending}
              onClick={() => setInvitationToCancel(null)}
              size="md"
              type="button"
            >
              돌아가기
            </MuteButton>
            <MuteButton
              disabled={cancelInvitation.isPending}
              onClick={() =>
                invitationToCancel
                  ? void cancelPendingInvitation(invitationToCancel)
                  : undefined
              }
              size="md"
              type="button"
              variant="warn"
            >
              {cancelInvitation.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              초대 취소
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
