import {
  ArrowUpRight,
  Calendar,
  CircleDollarSign,
  Ellipsis,
  FileText,
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
import * as Popover from "@radix-ui/react-popover";
import { OrgPageHeader } from "@/components/org/workspace/OrgPageHeader";
import {
  OrgSection,
  OrgSectionHeader,
} from "@/components/org/workspace/OrgSection";
import { OrgUnsavedChangesBar } from "@/components/org/workspace/OrgUnsavedChangesBar";
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
import { DocumentEditor } from "@/components/ui/document-editor";
import { Input, TextField } from "@/components/ui/input";
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
import { useUnsavedChangesWarning } from "@/hooks/org/useUnsavedChangesWarning";
import {
  getOrgRoleLabel,
  ORG_MEMBERSHIP_ROLE_OPTIONS,
  type OrgMembershipRole,
} from "@/lib/org/permissions";
import { createOrgEditingDismissHandlers } from "@/lib/org/editingInteraction";
import type {
  OrgMember,
  OrgWorkspace,
  OrgWorkspaceInvitation,
} from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CompanyDraft = {
  companyName: string;
  employeeCountEnd: number | null;
  employeeCountStart: number | null;
  foundedYear: number | null;
  homepageUrl: string;
  lastFundingRoundDescription: string;
  lastFundingStage: string;
  linkedinUrl: string;
  locationText: string;
  logoUrl: string;
  pitch: string;
  shortDescription: string;
  totalFundingRaised: string;
};

type CompanyEditingField =
  | "homepageUrl"
  | "linkedinUrl"
  | "pitch"
  | "shortDescription"
  | "totalFundingRaised";

const EMPTY_EMPLOYEE_COUNT_RANGE = "empty";
const EMPLOYEE_COUNT_RANGE_OPTIONS = [
  { end: 10, label: "1–10명", start: 1, value: "1-10" },
  { end: 50, label: "11–50명", start: 11, value: "11-50" },
  { end: 200, label: "51–200명", start: 51, value: "51-200" },
  { end: 500, label: "201–500명", start: 201, value: "201-500" },
  { end: 1_000, label: "501–1,000명", start: 501, value: "501-1000" },
  {
    end: 5_000,
    label: "1,001–5,000명",
    start: 1_001,
    value: "1001-5000",
  },
  {
    end: 10_000,
    label: "5,001–10,000명",
    start: 5_001,
    value: "5001-10000",
  },
  { end: null, label: "10,001명 이상", start: 10_001, value: "10001+" },
] as const;

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
  return (
    <a
      className="group rounded-md outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      <CompanyLinkBadge href={href} label={label} />
    </a>
  );
}

function CompanyLinkBadge({ href, label }: { href: string; label: string }) {
  const iconUrl = getFaviconUrl(href);

  return (
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
  );
}

function CompanyEditableLink({
  disabled,
  editable,
  fieldId,
  href,
  label,
  onEdit,
  onValueChange,
}: {
  disabled: boolean;
  editable: boolean;
  fieldId: string;
  href: string;
  label: string;
  onEdit: () => void;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!editable) {
    return href ? (
      <CompanyLinkPill href={href} label={label} />
    ) : (
      <span className="text-[13px] text-neutral-soft">{label} -</span>
    );
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled && nextOpen) return;
        if (nextOpen) onEdit();
        setOpen(nextOpen);
      }}
    >
      <Popover.Trigger asChild>
        <button
          className="group rounded-md outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:pointer-events-none disabled:opacity-50"
          data-inline-editable-interaction=""
          disabled={disabled}
          type="button"
        >
          {href ? (
            <CompanyLinkBadge href={href} label={label} />
          ) : (
            <Badge
              className="group-hover:bg-neutral-1000-a10"
              endIcon={<Pencil className="size-3.5" />}
              size="lg"
              variant="faded"
            >
              {label} -
            </Badge>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-[140] w-[min(360px,calc(100vw-32px))] rounded-lg border border-neutral-1000-a10 bg-bg-floating p-3 shadow-[0_18px_48px_color-mix(in_srgb,var(--color-neutral-1000)_16%,transparent)] outline-none"
          data-inline-editable-interaction=""
          sideOffset={6}
        >
          <Input
            autoFocus
            className="h-9 text-[13px]"
            disabled={disabled}
            id={fieldId}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="https://"
            type="url"
            value={href}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-neutral-soft">
              변경 후 저장 버튼을 눌러주세요.
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {href ? (
                <MuteButton asChild size="sm" variant="transparent">
                  <a href={href} rel="noreferrer" target="_blank">
                    열기
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </MuteButton>
              ) : null}
              <MuteButton
                onClick={() => setOpen(false)}
                size="sm"
                variant="neutral"
              >
                닫기
              </MuteButton>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CompanyInfoRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <tr>
      <th
        className="w-[180px] py-1 pr-4 text-left align-center font-normal"
        scope="row"
      >
        <span className="flex items-center gap-2 text-[13px] leading-5 text-black">
          <span className="shrink-0">{icon}</span>
          {label}
        </span>
      </th>
      <td className="min-w-0 py-2 pl-4 align-top text-[13px] leading-5 text-black">
        {value}
      </td>
    </tr>
  );
}

function CompanyInfoText({ value }: { value: string | null | undefined }) {
  const text = value?.trim();

  return text ? (
    <span className="whitespace-pre-wrap wrap-break-word">{text}</span>
  ) : (
    <span className="text-neutral-soft">정보 없음</span>
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

function getEmployeeCountRangeValue(start: number | null, end: number | null) {
  if (start === null && end === null) return EMPTY_EMPLOYEE_COUNT_RANGE;
  return (
    EMPLOYEE_COUNT_RANGE_OPTIONS.find(
      (option) => option.start === start && option.end === end
    )?.value ?? undefined
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
  companyOnly = false,
  section = "company",
}: {
  companyOnly?: boolean;
  section?: "company" | "members";
} = {}) {
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
  const [companyInfoEditing, setCompanyInfoEditing] = useState(false);
  const [companyEditingField, setCompanyEditingField] =
    useState<CompanyEditingField | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft | null>(null);
  const [companySaveError, setCompanySaveError] = useState("");
  const [invitationToCancel, setInvitationToCancel] =
    useState<OrgWorkspaceInvitation | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);
  const [memberRoleToEdit, setMemberRoleToEdit] = useState<OrgMember | null>(
    null
  );
  const [memberRoleDraft, setMemberRoleDraft] = useState("");
  const [memberRoleError, setMemberRoleError] = useState<string | null>(null);
  const companyProfile = workspace.companyProfile;
  const initialCompanyDraft: CompanyDraft = {
    companyName: workspace.companyName,
    employeeCountEnd: companyProfile?.employeeCountEnd ?? null,
    employeeCountStart: companyProfile?.employeeCountStart ?? null,
    foundedYear: companyProfile?.foundedYear ?? null,
    homepageUrl: companyProfile?.homepageUrl ?? "",
    lastFundingRoundDescription:
      companyProfile?.lastFundingRoundDescription ?? "",
    lastFundingStage: companyProfile?.lastFundingStage ?? "",
    linkedinUrl: companyProfile?.linkedinUrl ?? "",
    locationText: companyProfile?.location ?? "",
    logoUrl: workspace.logoUrl ?? "",
    pitch: workspace.pitch ?? "",
    shortDescription: companyProfile?.shortDescription ?? "",
    totalFundingRaised: companyProfile?.totalFundingRaised ?? "",
  };
  const currentCompanyDraft = companyDraft ?? initialCompanyDraft;
  const employeeCountText = formatEmployeeCount(
    currentCompanyDraft.employeeCountStart,
    currentCompanyDraft.employeeCountEnd
  );
  const companyEditing = companyInfoEditing || companyEditingField !== null;
  const showCompany = companyOnly || section === "company";
  const showMembers = !companyOnly && section === "members";
  const companyHasChanges =
    companyDraft !== null &&
    JSON.stringify(companyDraft) !== JSON.stringify(initialCompanyDraft);
  useUnsavedChangesWarning(companyHasChanges);

  const startCompanyInfoEditing = () => {
    if (!permissions.canManageWorkspace || updateWorkspace.isPending) return;
    setCompanyInfoEditing(true);
    setCompanySaveError("");
    setCompanyDraft((current) => current ?? initialCompanyDraft);
  };

  const startCompanyEditing = (field: CompanyEditingField) => {
    if (!permissions.canManageWorkspace || updateWorkspace.isPending) return;
    setCompanyEditingField(field);
    setCompanySaveError("");
    setCompanyDraft((current) => current ?? initialCompanyDraft);
  };

  const changeCompanyDraft = (
    patch: Partial<CompanyDraft>,
    field?: CompanyEditingField
  ) => {
    if (!permissions.canManageWorkspace || updateWorkspace.isPending) return;
    if (field) setCompanyEditingField(field);
    setCompanySaveError("");
    setCompanyDraft((current) => ({
      ...(current ?? initialCompanyDraft),
      ...patch,
    }));
  };

  const cancelCompanyEditing = () => {
    if (updateWorkspace.isPending) return;
    setCompanyDraft(null);
    setCompanyInfoEditing(false);
    setCompanyEditingField(null);
    setCompanySaveError("");
  };
  const companyEditingDismissHandlers = createOrgEditingDismissHandlers({
    active: companyEditing,
    hasChanges: companyHasChanges,
    onDismiss: cancelCompanyEditing,
    pending: updateWorkspace.isPending,
  });

  const saveCompany = async () => {
    if (!companyDraft || !companyHasChanges || updateWorkspace.isPending)
      return;
    const companyName = companyDraft.companyName.trim();
    if (!companyName) {
      setCompanySaveError("회사명을 입력해 주세요.");
      return;
    }
    try {
      await updateWorkspace.mutateAsync({
        companyName,
        employeeCountEnd: companyDraft.employeeCountEnd,
        employeeCountStart: companyDraft.employeeCountStart,
        foundedYear: companyDraft.foundedYear,
        homepageUrl: companyDraft.homepageUrl.trim() || null,
        lastFundingRoundDescription:
          companyDraft.lastFundingRoundDescription.trim() || null,
        lastFundingStage: companyDraft.lastFundingStage.trim() || null,
        linkedinUrl: companyDraft.linkedinUrl.trim() || null,
        location: companyDraft.locationText.trim() || null,
        logoUrl: companyDraft.logoUrl.trim() || null,
        pitch: companyDraft.pitch.trim() || null,
        shortDescription: companyDraft.shortDescription.trim() || null,
        totalFundingRaised: companyDraft.totalFundingRaised.trim() || null,
        workspaceId: workspace.workspaceId,
      });
      addToast({ message: "회사 정보를 저장했습니다.", variant: "success" });
      setCompanyDraft(null);
      setCompanyInfoEditing(false);
      setCompanyEditingField(null);
      setCompanySaveError("");
    } catch (saveError) {
      setCompanySaveError(
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
    <div {...companyEditingDismissHandlers}>
      <OrgPageHeader
        actions={
          showCompany &&
          (permissions.canManageWorkspace ||
            currentCompanyDraft.homepageUrl ||
            currentCompanyDraft.linkedinUrl) ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {(permissions.canManageWorkspace ||
                currentCompanyDraft.homepageUrl) && (
                <CompanyEditableLink
                  disabled={updateWorkspace.isPending}
                  editable={permissions.canManageWorkspace}
                  fieldId="org-company-homepage-url"
                  href={currentCompanyDraft.homepageUrl}
                  label="웹사이트"
                  onEdit={() => startCompanyEditing("homepageUrl")}
                  onValueChange={(homepageUrl) =>
                    changeCompanyDraft({ homepageUrl })
                  }
                />
              )}
              {(permissions.canManageWorkspace ||
                currentCompanyDraft.linkedinUrl) && (
                <CompanyEditableLink
                  disabled={updateWorkspace.isPending}
                  editable={permissions.canManageWorkspace}
                  fieldId="org-company-linkedin-url"
                  href={currentCompanyDraft.linkedinUrl}
                  label="LinkedIn"
                  onEdit={() => startCompanyEditing("linkedinUrl")}
                  onValueChange={(linkedinUrl) =>
                    changeCompanyDraft({ linkedinUrl })
                  }
                />
              )}
            </div>
          ) : undefined
        }
        title={
          showMembers ? (
            "멤버"
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              <CompanyBrandMark
                logoUrl={currentCompanyDraft.logoUrl || null}
                name={currentCompanyDraft.companyName}
              />
              <span className="truncate">
                {currentCompanyDraft.companyName}
              </span>
            </span>
          )
        }
      />

      <OrgSection hidden={!showCompany}>
        <div className="text-[13px] text-neutral-900 bg-neutral-100 rounded-lg p-3 mb-4">
          아래의 정보들은 Harper가 인재에게 회사를 설명하고 설득하기위해
          사용합니다. 모든 역할에 공통적으로 반영됩니다. 내용을 그대로 전달하지
          않고, 인재의 관심사/니즈 등에 맞게 Harper가 말을 건넬 때 자연스럽게
          활용하게 됩니다.
        </div>
        <form
          className="space-y-8 mt-8"
          onSubmit={(event) => {
            event.preventDefault();
            void saveCompany();
          }}
        >
          <OrgSectionHeader
            className="max-w-2xl"
            title="회사 정보"
            actions={
              <>
                {permissions.canManageWorkspace && !companyInfoEditing ? (
                  <MuteButton
                    disabled={updateWorkspace.isPending}
                    onClick={startCompanyInfoEditing}
                    size="md"
                    type="button"
                  >
                    <Pencil className="size-4" />
                    수정하기
                  </MuteButton>
                ) : null}
              </>
            }
          />
          <div
            className="max-w-2xl overflow-x-auto rounded-lg bg-neutral-100 px-4 py-1"
            data-inline-editable-interaction={
              companyInfoEditing ? "" : undefined
            }
          >
            <table className="w-full border-collapse">
              <tbody className="divide-y divide-neutral-1000-a05">
                <CompanyInfoRow
                  icon={<MapPin className="size-4" strokeWidth={2} />}
                  label="본사 위치"
                  value={
                    companyInfoEditing ? (
                      <Input
                        autoFocus
                        aria-label="본사 위치"
                        className="h-9 w-full text-[13px]"
                        disabled={updateWorkspace.isPending}
                        onChange={(event) =>
                          changeCompanyDraft({
                            locationText: event.target.value,
                          })
                        }
                        placeholder="본사 위치"
                        value={currentCompanyDraft.locationText}
                      />
                    ) : (
                      <CompanyInfoText
                        value={currentCompanyDraft.locationText}
                      />
                    )
                  }
                />
                <CompanyInfoRow
                  icon={<Calendar className="size-4" strokeWidth={2} />}
                  label="설립 연도"
                  value={
                    companyInfoEditing ? (
                      <Input
                        aria-label="설립 연도"
                        className="h-9 w-full text-[13px]"
                        disabled={updateWorkspace.isPending}
                        inputMode="numeric"
                        max={new Date().getFullYear() + 1}
                        min={1000}
                        onChange={(event) =>
                          changeCompanyDraft({
                            foundedYear: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                        placeholder="설립 연도"
                        type="number"
                        value={currentCompanyDraft.foundedYear ?? ""}
                      />
                    ) : (
                      <CompanyInfoText
                        value={
                          currentCompanyDraft.foundedYear
                            ? `${currentCompanyDraft.foundedYear}년`
                            : null
                        }
                      />
                    )
                  }
                />
                <CompanyInfoRow
                  icon={<Users className="size-4" strokeWidth={2} />}
                  label="직원 수"
                  value={
                    companyInfoEditing ? (
                      <Select
                        disabled={updateWorkspace.isPending}
                        onValueChange={(value) => {
                          if (value === null) return;
                          if (value === EMPTY_EMPLOYEE_COUNT_RANGE) {
                            changeCompanyDraft({
                              employeeCountEnd: null,
                              employeeCountStart: null,
                            });
                            return;
                          }
                          const selected = EMPLOYEE_COUNT_RANGE_OPTIONS.find(
                            (option) => option.value === value
                          );
                          if (!selected) return;
                          changeCompanyDraft({
                            employeeCountEnd: selected.end,
                            employeeCountStart: selected.start,
                          });
                        }}
                        value={
                          getEmployeeCountRangeValue(
                            currentCompanyDraft.employeeCountStart,
                            currentCompanyDraft.employeeCountEnd
                          ) ?? EMPTY_EMPLOYEE_COUNT_RANGE
                        }
                      >
                        <SelectTrigger
                          aria-label="직원 수"
                          className="w-full text-[13px]"
                        >
                          <SelectValue placeholder="직원 수 범위" />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          data-inline-editable-interaction=""
                        >
                          <SelectItem value={EMPTY_EMPLOYEE_COUNT_RANGE}>
                            정보 없음
                          </SelectItem>
                          {EMPLOYEE_COUNT_RANGE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <CompanyInfoText value={employeeCountText} />
                    )
                  }
                />
                <CompanyInfoRow
                  icon={<TrendingUp className="size-4" strokeWidth={2} />}
                  label="최근 투자 단계"
                  value={
                    companyInfoEditing ? (
                      <Input
                        aria-label="최근 투자 단계"
                        className="h-9 w-full text-[13px]"
                        disabled={updateWorkspace.isPending}
                        onChange={(event) =>
                          changeCompanyDraft({
                            lastFundingStage: event.target.value,
                          })
                        }
                        placeholder="최근 투자 단계"
                        value={currentCompanyDraft.lastFundingStage}
                      />
                    ) : (
                      <CompanyInfoText
                        value={currentCompanyDraft.lastFundingStage}
                      />
                    )
                  }
                />
                <CompanyInfoRow
                  icon={<CircleDollarSign className="size-4" strokeWidth={2} />}
                  label="누적 투자 유치액"
                  value={
                    companyInfoEditing ? (
                      <Input
                        aria-label="누적 투자 유치액"
                        className="h-9 w-full text-[13px]"
                        disabled={updateWorkspace.isPending}
                        onChange={(event) =>
                          changeCompanyDraft({
                            totalFundingRaised: event.target.value,
                          })
                        }
                        placeholder="누적 투자 유치액"
                        value={currentCompanyDraft.totalFundingRaised}
                      />
                    ) : (
                      <CompanyInfoText
                        value={currentCompanyDraft.totalFundingRaised}
                      />
                    )
                  }
                />
                <CompanyInfoRow
                  icon={<FileText className="size-4" strokeWidth={2} />}
                  label="최근 투자 라운드"
                  value={
                    companyInfoEditing ? (
                      <Input
                        aria-label="최근 투자 라운드"
                        className="h-9 w-full text-[13px]"
                        disabled={updateWorkspace.isPending}
                        onChange={(event) =>
                          changeCompanyDraft({
                            lastFundingRoundDescription: event.target.value,
                          })
                        }
                        placeholder="최근 투자 라운드"
                        value={currentCompanyDraft.lastFundingRoundDescription}
                      />
                    ) : (
                      <CompanyInfoText
                        value={currentCompanyDraft.lastFundingRoundDescription}
                      />
                    )
                  }
                />
              </tbody>
            </table>
          </div>

          <section>
            <OrgSectionHeader title="회사 설명" />
            <DocumentEditor
              aria-label="회사 설명 수정"
              className="mt-2 max-w-4xl"
              disabled={updateWorkspace.isPending}
              documentTitle="Company Description"
              errorMessage={
                companyEditingField === "pitch" ? companySaveError : ""
              }
              lastChangedAt={workspace.updatedAt}
              onChange={(event) =>
                changeCompanyDraft({ pitch: event.target.value }, "pitch")
              }
              placeholder="인재에게 회사를 소개하고 설득할 때 강조할 내용을 작성해 주세요."
              readOnly={!permissions.canManageWorkspace}
              rows={4}
              savedValue={workspace.pitch ?? ""}
              value={currentCompanyDraft.pitch}
            />
          </section>

          {companySaveError ? (
            <div
              className="rounded-md border border-critical/20 bg-critical-faded px-3 py-3 text-[12px] text-critical"
              role="alert"
            >
              {companySaveError}
            </div>
          ) : null}
        </form>
      </OrgSection>

      {showMembers ? (
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
                      <th className="w-40 px-3 py-2.5 font-normal">
                        가입 날짜
                      </th>
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
                                <MuteButton size="sm" variant="transparent">
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
                                <MuteButton size="sm" variant="transparent">
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
      ) : null}

      {showCompany &&
      permissions.canManageWorkspace &&
      (companyInfoEditing || companyHasChanges) ? (
        <OrgUnsavedChangesBar
          canSave={companyHasChanges}
          hasChanges={companyHasChanges}
          onCancel={cancelCompanyEditing}
          onSave={() => void saveCompany()}
          pending={updateWorkspace.isPending}
        />
      ) : null}

      {showMembers ? (
        <>
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
                  <p
                    className="text-[12px] leading-5 text-critical"
                    role="alert"
                  >
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
                  {memberToRemove?.name ||
                    memberToRemove?.email ||
                    "선택한 멤버"}
                  를 Organization에서 제거합니다. 제거한 멤버는 더 이상 이
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
        </>
      ) : null}
    </div>
  );
}
