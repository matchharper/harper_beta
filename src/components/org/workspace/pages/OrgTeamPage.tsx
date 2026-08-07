import {
  ArrowUpRight,
  Calendar,
  CircleDollarSign,
  Ellipsis,
  FileText,
  Handshake,
  LoaderCircle,
  MapPin,
  Pencil,
  TrendingUp,
  Trash2,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import { FormEvent, type ReactNode, useState } from "react";
import {
  OrgEditDialog,
  type OrgEditDialogValue,
} from "@/components/org/OrgEditDialog";
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
import { TextField } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Radio } from "@/components/ui/radio";
import {
  useCancelOrgInvitation,
  useRemoveOrgMember,
  useSendOrgInvitations,
  useUpdateOrgMemberProfile,
  useUpdateOrgMembershipAuthority,
  useUpdateOrgWorkspace,
} from "@/hooks/org/useOrg";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import {
  getOrgRoleLabel,
  ORG_MEMBERSHIP_ROLE_OPTIONS,
  type OrgMembershipRole,
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
        className="size-6 shrink-0 rounded-full object-cover"
        height={24}
        src={member.profilePicture}
        unoptimized
        width={24}
      />
    );
  }
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function CompanyBrandMark({
  logoUrl,
  name,
}: {
  logoUrl: string | null;
  name: string;
}) {
  if (logoUrl) {
    return (
      <Image
        alt=""
        className="size-8 shrink-0 rounded-md object-contain"
        height={32}
        src={logoUrl}
        unoptimized
        width={32}
      />
    );
  }

  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-bg-weak text-[12px] font-medium text-neutral-muted">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function getFaviconUrl(href: string) {
  try {
    const url = new URL(href);
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
      url.origin
    )}&sz=64`;
  } catch {
    return "";
  }
}

function CompanyLinkPill({ href, label }: { href: string; label: string }) {
  const iconUrl = getFaviconUrl(href);

  return (
    <a
      className="group rounded-md outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <Badge
        className="group-hover:bg-neutral-1000-a10"
        endIcon={<ArrowUpRight className="size-3.5" />}
        icon={
          iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              aria-hidden="true"
              className="size-3.5 rounded-[3px] object-contain"
              src={iconUrl}
            />
          ) : null
        }
        size="lg"
        variant="faded"
      >
        {label}
      </Badge>
    </a>
  );
}

function CompanyInlineFact({
  icon,
  value,
}: {
  icon: ReactNode;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-neutral-primary">
      <span className="shrink-0 text-neutral-muted">{icon}</span>
      <span className="wrap-break-word">{value}</span>
    </div>
  );
}

function CompanyMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-neutral-muted">{icon}</span>
      <div className="min-w-0">
        <div className="text-[12px] font-light leading-5 text-neutral-soft">
          {label}
        </div>
        <div className="mt-0.5 whitespace-pre-wrap wrap-break-word text-[13px] leading-5 text-neutral-primary">
          {value?.trim() || "-"}
        </div>
      </div>
    </div>
  );
}

function formatEmployeeCount(start: number | null, end: number | null) {
  const format = (value: number) =>
    new Intl.NumberFormat("ko-KR").format(value);
  if (start !== null && end !== null)
    return `${format(start)}–${format(end)}명`;
  if (start !== null) return `${format(start)}명 이상`;
  if (end !== null) return `${format(end)}명 이하`;
  return null;
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

export function OrgTeamPage() {
  const {
    bootstrap: { invitations, members },
    currentUser,
    permissions,
    workspace,
  } = useOrgWorkspace();
  const router = useRouter();
  const addToast = useToastStore((state) => state.add);
  const updateWorkspace = useUpdateOrgWorkspace();
  const sendInvitations = useSendOrgInvitations();
  const cancelInvitation = useCancelOrgInvitation();
  const removeMember = useRemoveOrgMember();
  const updateMemberProfile = useUpdateOrgMemberProfile();
  const updateMembershipAuthority = useUpdateOrgMembershipAuthority();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [companyEditOpen, setCompanyEditOpen] = useState(false);
  const [invitationToCancel, setInvitationToCancel] =
    useState<OrgWorkspaceInvitation | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);
  const [memberRoleToEdit, setMemberRoleToEdit] = useState<OrgMember | null>(
    null
  );
  const [memberRoleDraft, setMemberRoleDraft] = useState("");
  const [memberRoleError, setMemberRoleError] = useState<string | null>(null);
  const companyProfile = workspace.companyProfile;
  const resolvedCompanyDescription =
    workspace.companyDescription ??
    companyProfile?.companyDbDescription ??
    null;
  const employeeCountText = formatEmployeeCount(
    companyProfile?.employeeCountStart ?? null,
    companyProfile?.employeeCountEnd ?? null
  );
  const companyEditValue: OrgEditDialogValue = {
    companyDescription: resolvedCompanyDescription,
    companyName: workspace.companyName,
    employeeCountEnd: companyProfile?.employeeCountEnd ?? null,
    employeeCountStart: companyProfile?.employeeCountStart ?? null,
    foundedYear: companyProfile?.foundedYear ?? null,
    homepageUrl: companyProfile?.homepageUrl ?? null,
    lastFundingRoundDescription:
      companyProfile?.lastFundingRoundDescription ?? null,
    lastFundingStage: companyProfile?.lastFundingStage ?? null,
    linkedinUrl: companyProfile?.linkedinUrl ?? null,
    locationText: companyProfile?.location ?? null,
    logoUrl: workspace.logoUrl,
    mainInvestors: companyProfile?.mainInvestors ?? null,
    pitch: workspace.pitch,
    shortDescription: companyProfile?.shortDescription ?? null,
    totalFundingRaised: companyProfile?.totalFundingRaised ?? null,
  };

  const saveCompany = async (value: OrgEditDialogValue) => {
    try {
      await updateWorkspace.mutateAsync({
        companyDescription: value.companyDescription?.trim() || null,
        companyName: value.companyName?.trim() || null,
        employeeCountEnd: value.employeeCountEnd ?? null,
        employeeCountStart: value.employeeCountStart ?? null,
        foundedYear: value.foundedYear ?? null,
        homepageUrl: value.homepageUrl?.trim() || null,
        lastFundingRoundDescription:
          value.lastFundingRoundDescription?.trim() || null,
        lastFundingStage: value.lastFundingStage?.trim() || null,
        linkedinUrl: value.linkedinUrl?.trim() || null,
        location: value.locationText?.trim() || null,
        logoUrl: value.logoUrl?.trim() || null,
        mainInvestors: value.mainInvestors?.trim() || null,
        pitch: value.pitch?.trim() || null,
        shortDescription: value.shortDescription?.trim() || null,
        totalFundingRaised: value.totalFundingRaised?.trim() || null,
        workspaceId: workspace.workspaceId,
      });
      addToast({ message: "회사 정보를 저장했습니다.", variant: "success" });
      setCompanyEditOpen(false);
    } catch (saveError) {
      addToast({
        message:
          saveError instanceof Error
            ? saveError.message
            : "회사 정보를 저장하지 못했습니다.",
        variant: "error",
      });
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

  const changeMemberAuthority = async (
    member: OrgMember,
    authority: OrgMembershipRole
  ) => {
    if (member.authority === authority) return;
    try {
      await updateMembershipAuthority.mutateAsync({
        authority,
        userId: member.userId,
        workspaceId: workspace.workspaceId,
      });
      addToast({
        message: `${member.name || member.email || "멤버"}의 권한을 ${getOrgRoleLabel(authority)}로 변경했습니다.`,
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

  const openMemberRoleEdit = (member: OrgMember) => {
    setMemberRoleToEdit(member);
    setMemberRoleDraft(member.role ?? "");
    setMemberRoleError(null);
  };

  const saveMemberRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!memberRoleToEdit || updateMemberProfile.isPending) return;
    const role = memberRoleDraft.trim();
    if (!role) {
      setMemberRoleError("직함을 입력해 주세요.");
      return;
    }

    try {
      await updateMemberProfile.mutateAsync({
        role,
        userId: memberRoleToEdit.userId,
        workspaceId: workspace.workspaceId,
      });
      addToast({ message: "멤버 직함을 저장했습니다.", variant: "success" });
      setMemberRoleToEdit(null);
    } catch (roleError) {
      setMemberRoleError(
        roleError instanceof Error
          ? roleError.message
          : "직함을 저장하지 못했습니다."
      );
    }
  };

  const removeSelectedMember = async () => {
    if (!memberToRemove) return;
    const member = memberToRemove;
    try {
      const payload = await removeMember.mutateAsync({
        userId: member.userId,
        workspaceId: workspace.workspaceId,
      });
      setMemberToRemove(null);
      addToast({
        message: `${member.name || member.email || "멤버"}를 Organization에서 제거했습니다.`,
        variant: "success",
      });

      if (member.userId === currentUser?.userId) {
        const nextHref = payload.nextWorkspaceId
          ? `/org?orgId=${encodeURIComponent(payload.nextWorkspaceId)}`
          : "/org";
        try {
          await router.replace(nextHref);
        } catch {
          window.location.assign(nextHref);
        }
      }
    } catch (removeError) {
      addToast({
        message:
          removeError instanceof Error
            ? removeError.message
            : "멤버를 제거하지 못했습니다.",
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-8">
      <OrgPageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <CompanyBrandMark
              logoUrl={workspace.logoUrl}
              name={workspace.companyName}
            />
            <span className="truncate">{workspace.companyName}</span>
          </span>
        }
      />

      <OrgSection>
        <OrgSectionHeader
          actions={
            permissions.canManageWorkspace ? (
              <MuteButton
                onClick={() => setCompanyEditOpen(true)}
                size="md"
                variant="default"
              >
                <Pencil className="size-4" />
                수정
              </MuteButton>
            ) : null
          }
          description="Harper가 인재에게 회사를 설명하고 설득하기위해 사용합니다."
          title="회사 정보"
        />

        <div className="space-y-8">
          <div className="space-y-4">
            {companyProfile?.shortDescription?.trim() ? (
              <p className="max-w-4xl text-[14px] leading-6 text-neutral-muted">
                {companyProfile.shortDescription}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-x-5 gap-y-2.5">
              {companyProfile?.location ? (
                <CompanyInlineFact
                  icon={<MapPin className="size-3.5" strokeWidth={2} />}
                  value={companyProfile.location}
                />
              ) : null}
              {companyProfile?.foundedYear ? (
                <CompanyInlineFact
                  icon={<Calendar className="size-3.5" strokeWidth={2} />}
                  value={`${companyProfile.foundedYear}년 설립`}
                />
              ) : null}
              {employeeCountText ? (
                <CompanyInlineFact
                  icon={<Users className="size-3.5" strokeWidth={2} />}
                  value={employeeCountText}
                />
              ) : null}
            </div>

            {companyProfile?.homepageUrl || companyProfile?.linkedinUrl ? (
              <div className="flex flex-wrap gap-2">
                {companyProfile.homepageUrl ? (
                  <CompanyLinkPill
                    href={companyProfile.homepageUrl}
                    label="웹사이트"
                  />
                ) : null}
                {companyProfile.linkedinUrl ? (
                  <CompanyLinkPill
                    href={companyProfile.linkedinUrl}
                    label="LinkedIn"
                  />
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-7">
            <section>
              <h3 className="text-[14px] font-medium text-neutral-primary">
                회사 설명
              </h3>
              <p className="mt-2 max-w-4xl whitespace-pre-wrap text-[13px] leading-6 text-neutral-muted">
                {resolvedCompanyDescription?.trim() || "-"}
              </p>
            </section>
            <section>
              <h3 className="text-[14px] font-medium text-neutral-primary">
                회사 Pitch
              </h3>
              <p className="mt-2 max-w-4xl whitespace-pre-wrap text-[13px] leading-6 text-neutral-muted">
                {workspace.pitch?.trim() || "-"}
              </p>
            </section>
          </div>

          <section>
            <h3 className="text-[14px] font-medium text-neutral-primary">
              투자 정보
            </h3>
            <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-2">
              <CompanyMetric
                icon={<TrendingUp className="size-4" strokeWidth={2} />}
                label="최근 투자 단계"
                value={companyProfile?.lastFundingStage}
              />
              <CompanyMetric
                icon={<CircleDollarSign className="size-4" strokeWidth={2} />}
                label="총 투자"
                value={companyProfile?.totalFundingRaised}
              />
              <CompanyMetric
                icon={<Handshake className="size-4" strokeWidth={2} />}
                label="주요 투자자"
                value={companyProfile?.mainInvestors}
              />
              <CompanyMetric
                icon={<FileText className="size-4" strokeWidth={2} />}
                label="최근 투자 라운드"
                value={companyProfile?.lastFundingRoundDescription}
              />
            </div>
          </section>
        </div>
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
          title="멤버"
        />

        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[14px] font-medium text-neutral-primary">
                가입 멤버
              </h3>
              <span className="text-[12px] font-light text-neutral-soft">
                {members.length}명
                {invitations.length > 0
                  ? ` · 수락 대기 ${invitations.length}명`
                  : ""}
              </span>
            </div>
            <div className="overflow-x-auto rounded-sm border border-neutral-1000-a05 bg-bg-floating">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead className="bg-neutral-200/35">
                  <tr className="border-b border-neutral-1000-a05 text-[12px] font-light text-neutral-soft">
                    <th className="px-4 py-2.5 font-normal">이메일</th>
                    <th className="px-3 py-2.5 font-normal">이름</th>
                    <th className="w-44 px-3 py-2.5 font-normal">직함</th>
                    <th className="w-36 px-3 py-2.5 font-normal">권한</th>
                    <th className="w-40 px-3 py-2.5 font-normal">가입 날짜</th>
                    {permissions.canManageMembers ? (
                      <th className="w-12 px-2 py-2.5 font-normal">
                        <span className="sr-only">멤버 작업</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr
                      className="border-b border-neutral-1000-a05 last:border-b-0"
                      key={`member-${member.userId}`}
                    >
                      <td className="max-w-60 truncate px-4 py-3 text-[13px] text-neutral-primary">
                        {member.email || "-"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <MemberAvatar member={member} />
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[13px] text-neutral-primary">
                              {member.name || "이름 없음"}
                            </span>
                            {member.userId === currentUser?.userId ? (
                              <Badge radius="full" size="sm" variant="faded">
                                나
                              </Badge>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block max-w-40 truncate text-[12px] font-normal text-neutral-muted">
                          {member.role || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {permissions.canManageMembers ? (
                          <Select
                            disabled={
                              updateMembershipAuthority.isPending &&
                              updateMembershipAuthority.variables?.userId ===
                                member.userId
                            }
                            onValueChange={(value) =>
                              void changeMemberAuthority(
                                member,
                                value as OrgMembershipRole
                              )
                            }
                            value={member.authority}
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
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-[12px] font-normal text-neutral-muted">
                            {getOrgRoleLabel(member.authority)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[12px] font-light text-neutral-muted">
                        {formatDate(member.joinedAt)}
                      </td>
                      {permissions.canManageMembers ? (
                        <td className="px-2 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <MuteButton
                                aria-label={`${member.name || member.email || "멤버"} 작업`}
                                size="sm"
                                variant="transparent"
                              >
                                <Ellipsis className="size-4" />
                              </MuteButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                disabled={updateMemberProfile.isPending}
                                onSelect={() => openMemberRoleEdit(member)}
                              >
                                <Pencil />
                                직함 수정
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={removeMember.isPending}
                                onSelect={() => setMemberToRemove(member)}
                                tone="danger"
                              >
                                <Trash2 />
                                멤버 제거
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {invitations.map((invitation) => (
                    <tr
                      className="border-b border-neutral-1000-a05 bg-bg-weak/30 last:border-b-0"
                      key={`invitation-${invitation.invitationId}`}
                    >
                      <td className="max-w-60 truncate px-4 py-3 text-[13px] text-neutral-primary">
                        {invitation.email}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
                            {invitation.email.slice(0, 1).toUpperCase()}
                          </span>
                          <Badge radius="full" size="sm" variant="faded">
                            수락 대기
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[12px] font-normal text-neutral-muted">
                        -
                      </td>
                      <td className="px-3 py-3 text-[12px] font-normal text-neutral-muted">
                        {getOrgRoleLabel(invitation.role)}
                      </td>
                      <td className="px-3 py-3 text-[12px] font-light text-neutral-muted">
                        -
                      </td>
                      {permissions.canManageMembers ? (
                        <td className="px-2 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <MuteButton
                                aria-label={`${invitation.email} 초대 작업`}
                                size="sm"
                                variant="transparent"
                              >
                                <Ellipsis className="size-4" />
                              </MuteButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem
                                disabled={sendInvitations.isPending}
                                onSelect={() =>
                                  void resendInvitation(invitation)
                                }
                              >
                                다시 보내기
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={cancelInvitation.isPending}
                                onSelect={() =>
                                  setInvitationToCancel(invitation)
                                }
                                tone="danger"
                              >
                                초대 취소
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </OrgSection>

      {companyEditOpen ? (
        <OrgEditDialog
          mode="workspace"
          onClose={() => setCompanyEditOpen(false)}
          onSubmit={(value) => void saveCompany(value)}
          open
          pending={updateWorkspace.isPending}
          value={companyEditValue}
        />
      ) : null}

      <InviteMemberDialog
        invitations={invitations}
        members={members}
        onOpenChange={setInviteOpen}
        open={inviteOpen}
        workspace={workspace}
      />

      <Dialog
        open={Boolean(memberRoleToEdit)}
        onOpenChange={(open) => {
          if (!open && !updateMemberProfile.isPending) {
            setMemberRoleToEdit(null);
            setMemberRoleError(null);
          }
        }}
      >
        <DialogContent className="max-w-sm gap-5 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px]">직함 수정</DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              {memberRoleToEdit?.name ||
                memberRoleToEdit?.email ||
                "선택한 멤버"}
              의 팀 내 직함을 입력해 주세요.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => void saveMemberRole(event)}
          >
            <TextField
              autoFocus
              id="org-member-role-edit"
              label="직함"
              maxLength={160}
              onChange={(event) => {
                setMemberRoleDraft(event.target.value);
                setMemberRoleError(null);
              }}
              placeholder="예: 채용 매니저, VP of Engineering"
              required
              value={memberRoleDraft}
            />
            {memberRoleError ? (
              <p className="text-[12px] leading-5 text-critical" role="alert">
                {memberRoleError}
              </p>
            ) : null}
            <DialogFooter>
              <MuteButton
                disabled={updateMemberProfile.isPending}
                onClick={() => setMemberRoleToEdit(null)}
                size="md"
                type="button"
              >
                취소
              </MuteButton>
              <MuteButton
                disabled={updateMemberProfile.isPending}
                size="md"
                type="submit"
                variant="primary"
              >
                {updateMemberProfile.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                저장
              </MuteButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(invitationToCancel)}
        onOpenChange={(open) => !open && setInvitationToCancel(null)}
      >
        <DialogContent className="max-w-sm gap-4 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px]">초대 취소</DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              {invitationToCancel?.email}에 부여한 Organization 초대 권한을
              취소합니다.
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

      <Dialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <DialogContent className="max-w-sm gap-4 rounded-lg p-6">
          <DialogHeader>
            <DialogTitle className="text-[17px]">멤버 제거</DialogTitle>
            <DialogDescription className="text-[13px] leading-5">
              {memberToRemove?.name || memberToRemove?.email || "선택한 멤버"}를
              Organization에서 제거합니다. 제거한 멤버는 더 이상 이
              Organization에 접근할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <MuteButton
              disabled={removeMember.isPending}
              onClick={() => setMemberToRemove(null)}
              size="md"
              type="button"
            >
              돌아가기
            </MuteButton>
            <MuteButton
              disabled={removeMember.isPending}
              onClick={() => void removeSelectedMember()}
              size="md"
              type="button"
              variant="warn"
            >
              {removeMember.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              멤버 제거
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
