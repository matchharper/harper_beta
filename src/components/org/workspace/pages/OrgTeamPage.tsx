import {
  OrgTable,
  OrgTableBody,
  OrgTableCell,
  OrgTableHead,
  OrgTableHeader,
  OrgTableRow,
} from "../OrgTable";
import { Tabs } from "@/components/ui/tabs";
import {
  OrgTeamsSection,
  OrgMemberTeamSelect,
  OrgTeamEditor,
} from "@/components/org/workspace/OrgTeamsSection";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import {
  useOrgLocale,
  useOrgSourceT,
  type OrgCopy,
} from "@/i18n/org/OrgLocaleProvider";
import { useOrgDocumentEditorCopy } from "@/i18n/org/useOrgDocumentEditorCopy";
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
import RichText from "@/components/ui/rich-text";
import { useRouter } from "next/router";
import { useId, FormEvent, type ReactNode, useState } from "react";
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

function formatDate(value: string, locale: "ko" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function MemberAvatar({ member }: { member: OrgMember }) {
  const { c } = useOrgLocale();
  const label = member.name || member.email || "User";
  if (member.profilePicture) {
    return (
      <Image
        alt={c("", "")}
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
  const { c } = useOrgLocale();
  if (logoUrl) {
    return (
      <Image
        alt={c("", "")}
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
  const { c } = useOrgLocale();
  const iconUrl = getFaviconUrl(href);

  return (
    <Badge
      className="group-hover:bg-neutral-1000-a10"
      endIcon={<ArrowUpRight className="size-3.5" />}
      icon={
        iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={c("", "")}
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
  const { c } = useOrgLocale();
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
            placeholder={c("https://", "https://")}
            type="url"
            value={href}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-neutral-soft">
              {c(
                "변경 후 저장 버튼을 눌러주세요.",
                "Click Save after making changes."
              )}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {href ? (
                <MuteButton asChild size="sm" variant="transparent">
                  <a href={href} rel="noreferrer" target="_blank">
                    {c("열기", "Open")}
                    <ArrowUpRight className="size-3.5" />
                  </a>
                </MuteButton>
              ) : null}
              <MuteButton
                onClick={() => setOpen(false)}
                size="sm"
                variant="neutral"
              >
                {c("닫기", "Close")}
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
  const { c } = useOrgLocale();
  const text = value?.trim();

  return text ? (
    <span className="whitespace-pre-wrap wrap-break-word">{text}</span>
  ) : (
    <span className="text-neutral-soft">
      {c("정보 없음", "No information")}
    </span>
  );
}

function formatEmployeeCount(
  start: number | null,
  end: number | null,
  locale: "ko" | "en",
  c: OrgCopy
) {
  const format = (value: number) =>
    new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US").format(value);
  if (start !== null && end !== null)
    return c("{p0}–{p1}명", "{p0}–{p1} employees", {
      p0: format(start),
      p1: format(end),
    });
  if (start !== null)
    return c("{p0}명 이상", "At least {p0} employees", {
      p0: format(start),
    });
  if (end !== null)
    return c("{p0}명 이하", "Up to {p0} employees", {
      p0: format(end),
    });
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
  const modalFormId1 = useId();
  const { c } = useOrgLocale();
  const sourceT = useOrgSourceT();
  const addToast = useToastStore((state) => state.add);
  const sendInvitations = useSendOrgInvitations();
  const [email, setEmail] = useState("");
  const {
    bootstrap: { teams = [] },
  } = useOrgWorkspace();
  const [teamId, setTeamId] = useState("organization");
  const [role, setRole] = useState<OrgMembershipRole>("admin");
  const [error, setError] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setEmail("");
      setRole("admin");
      setTeamId("organization");
      setError("");
    }
    onOpenChange(nextOpen);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError(c("올바른 이메일을 입력해 주세요.", "Enter a valid email."));
      return;
    }
    if (
      members.some(
        (member) => member.email?.trim().toLowerCase() === normalizedEmail
      )
    ) {
      setError(c("이미 참여 중인 팀원입니다.", "Member already in workspace."));
      return;
    }
    if (
      invitations.some(
        (invitation) =>
          invitation.email.trim().toLowerCase() === normalizedEmail
      )
    ) {
      setError(
        c(
          "이미 초대 대기 중입니다. 팀원 목록의 더보기에서 다시 보내기를 선택해 주세요.",
          "Invitation already pending. In the member list, choose Resend from More."
        )
      );
      return;
    }
    setError("");
    try {
      const payload = await sendInvitations.mutateAsync({
        emails: [normalizedEmail],
        teamId: role === "owner" || teamId === "organization" ? null : teamId,
        role,
        workspaceId: workspace.workspaceId,
      });
      const result = payload.results[0];
      if (!result || result.status !== "sent") {
        setError(
          result?.message ||
            c("초대 메일을 보내지 못했습니다.", "Failed to send invite email.")
        );
        return;
      }
      addToast({
        message: c(
          "{p0}로 초대 메일을 보냈습니다.",
          "Sent invite email to {p0}.",
          {
            p0: normalizedEmail,
          }
        ),
        variant: "success",
      });
      handleOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : c("초대 메일을 보내지 못했습니다.", "Failed to send invite email.")
      );
    }
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={() => handleOpenChange(false)}
      mobileBottomSheet
      title={<>{c("팀원 초대", "Invite member")}</>}
      description={
        <>
          {c(
            "이메일과 Organization에서 사용할 권한을 선택하세요.",
            "Enter an email and select a permission level."
          )}
        </>
      }
      panelClassName="max-w-[500px]"
      bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MuteButton
            disabled={sendInvitations.isPending}
            onClick={() => handleOpenChange(false)}
            size="md"
            type="button"
            form={modalFormId1}
          >
            {c("취소", "Cancel")}
          </MuteButton>
          <MuteButton
            disabled={sendInvitations.isPending}
            size="md"
            type="submit"
            variant="primary"
            form={modalFormId1}
          >
            {sendInvitations.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            {c("초대 보내기", "Send invite")}
          </MuteButton>
        </div>
      }
    >
      <form className="mt-1 space-y-4" onSubmit={submit} id={modalFormId1}>
        <TextField
          autoFocus
          id="org-invite-email"
          label={c("이메일", "Email")}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError("");
          }}
          placeholder={c("name@company.com", "name@company.com")}
          status={error ? "error" : "default"}
          type="email"
          value={email}
          errorText={error}
          size="medium"
        />
        <fieldset>
          <legend className="text-[13px] font-medium text-neutral-primary">
            {c("권한", "Permission")}
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
                      {sourceT(option.label)}
                    </span>
                    <span className="mt-0.5 block text-[12px] font-light leading-5 text-neutral-muted">
                      {sourceT(option.description)}
                    </span>
                  </span>
                }
                name="org-invite-role"
                onChange={() => {
                  setRole(option.value);
                  if (option.value === "owner") setTeamId("organization");
                }}
                size="medium"
                value={option.value}
              />
            ))}
          </div>
        </fieldset>
        {teams.length > 0 ? (
          <label className="grid gap-2 text-[13px] font-medium text-neutral-primary">
            <span>{c("Role 접근 범위", "Role access")}</span>
            <Select
              value={role === "owner" ? "organization" : teamId}
              items={[
                {
                  value: "organization",
                  label: c("전체 Role", "All Roles"),
                },
                ...teams.map((team) => ({
                  value: team.teamId,
                  label: team.name,
                })),
              ]}
              onValueChange={(value) => {
                if (value) setTeamId(value);
              }}
              disabled={role === "owner" || sendInvitations.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">
                  {c("전체 Role", "All Roles")}
                </SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.teamId} value={team.teamId}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
      </form>
    </TalentCareerModal>
  );
}

export function OrgTeamPage({
  companyOnly = false,
  readOnlyCompany = false,
  hideEmptyDescription = false,
  inlineDescription = false,
  section = "company",
}: {
  companyOnly?: boolean;
  readOnlyCompany?: boolean;
  hideEmptyDescription?: boolean;
  inlineDescription?: boolean;
  section?: "company" | "members";
} = {}) {
  const modalFormId2 = useId();

  const sourceT = useOrgSourceT();
  const { locale, c } = useOrgLocale();
  const documentEditorCopy = useOrgDocumentEditorCopy();
  const {
    bootstrap: { invitations, members, teams = [] },
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
  const [memberTab, setMemberTab] = useState("members");
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
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
    currentCompanyDraft.employeeCountEnd,
    locale,
    c
  );
  const companyEditing = companyInfoEditing || companyEditingField !== null;
  const canEditCompany = permissions.canManageWorkspace && !readOnlyCompany;
  const showCompany = companyOnly || section === "company";
  const showMembers = !companyOnly && section === "members";
  const showTeamAccess =
    teams.length > 0 || members.some((member) => member.accessScope === "team");
  const companyHasChanges =
    companyDraft !== null &&
    JSON.stringify(companyDraft) !== JSON.stringify(initialCompanyDraft);
  useUnsavedChangesWarning(companyHasChanges);

  const startCompanyInfoEditing = () => {
    if (!canEditCompany || updateWorkspace.isPending) return;
    setCompanyInfoEditing(true);
    setCompanySaveError("");
    setCompanyDraft((current) => current ?? initialCompanyDraft);
  };

  const startCompanyEditing = (field: CompanyEditingField) => {
    if (!canEditCompany || updateWorkspace.isPending) return;
    setCompanyEditingField(field);
    setCompanySaveError("");
    setCompanyDraft((current) => current ?? initialCompanyDraft);
  };

  const changeCompanyDraft = (
    patch: Partial<CompanyDraft>,
    field?: CompanyEditingField
  ) => {
    if (!canEditCompany || updateWorkspace.isPending) return;
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
    if (
      !canEditCompany ||
      !companyDraft ||
      !companyHasChanges ||
      updateWorkspace.isPending
    )
      return;
    const companyName = companyDraft.companyName.trim();
    if (!companyName) {
      setCompanySaveError(c("회사명을 입력해 주세요.", "Enter company name."));
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
      addToast({
        message: c("회사 정보를 저장했습니다.", "Company information saved."),
        variant: "success",
      });
      setCompanyDraft(null);
      setCompanyInfoEditing(false);
      setCompanyEditingField(null);
      setCompanySaveError("");
    } catch (saveError) {
      setCompanySaveError(
        saveError instanceof Error
          ? saveError.message
          : c(
              "회사 정보를 저장하지 못했습니다.",
              "Could not save company information."
            )
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
        throw new Error(
          result?.message ||
            c("초대 메일을 보내지 못했습니다.", "Failed to send invite email.")
        );
      }
      addToast({
        message: c("초대 메일을 다시 보냈습니다.", "Invitation email resent."),
        variant: "success",
      });
    } catch (resendError) {
      addToast({
        message:
          resendError instanceof Error
            ? resendError.message
            : c(
                "초대 메일을 보내지 못했습니다.",
                "Failed to send invite email."
              ),
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
      addToast({
        message: c("초대를 취소했습니다.", "Invitation canceled."),
      });
      setInvitationToCancel(null);
    } catch (cancelError) {
      addToast({
        message:
          cancelError instanceof Error
            ? cancelError.message
            : c("초대를 취소하지 못했습니다.", "Could not cancel invitation."),
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
        message: c(
          "{p0}의 권한을 {p1}로 변경했습니다.",
          "Changed {p0}'s permission to {p1}.",
          {
            p0: member.name || member.email || c("팀원", "Member"),
            p1: sourceT(getOrgRoleLabel(authority)),
          }
        ),
        variant: "success",
      });
    } catch (roleError) {
      addToast({
        message:
          roleError instanceof Error
            ? roleError.message
            : c("권한을 변경하지 못했습니다.", "Couldn't change permission."),
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
      setMemberRoleError(c("직함을 입력해 주세요.", "Enter title."));
      return;
    }

    try {
      await updateMemberProfile.mutateAsync({
        role,
        userId: memberRoleToEdit.userId,
        workspaceId: workspace.workspaceId,
      });
      addToast({
        message: c("팀원 직함을 저장했습니다.", "Member title saved."),
        variant: "success",
      });
      setMemberRoleToEdit(null);
    } catch (roleError) {
      setMemberRoleError(
        roleError instanceof Error
          ? roleError.message
          : c("직함을 저장하지 못했습니다.", "Failed to save title.")
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
        message: c(
          "{p0}를 Organization에서 제거했습니다.",
          "Removed {p0} from the organization.",
          {
            p0: member.name || member.email || c("팀원", "Member"),
          }
        ),
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
            : c("팀원를 제거하지 못했습니다.", "Failed to remove member."),
        variant: "error",
      });
    }
  };

  return (
    <div {...companyEditingDismissHandlers}>
      <OrgPageHeader
        className={
          showMembers
            ? "max-sm:flex-row max-sm:items-center max-sm:justify-between"
            : undefined
        }
        actions={
          showMembers ? (
            memberTab === "teams" ? (
              permissions.canManageTeams ? (
                <MuteButton
                  variant="dark"
                  onClick={() => setCreateTeamOpen(true)}
                >
                  {c("팀 추가", "Add team")}
                </MuteButton>
              ) : null
            ) : permissions.canManageMembers ? (
              <MuteButton variant="dark" onClick={() => setInviteOpen(true)}>
                {c("팀원 초대", "Invite member")}
              </MuteButton>
            ) : null
          ) : showCompany &&
            (canEditCompany ||
              currentCompanyDraft.homepageUrl ||
              currentCompanyDraft.linkedinUrl) ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {(canEditCompany || currentCompanyDraft.homepageUrl) && (
                <CompanyEditableLink
                  disabled={updateWorkspace.isPending}
                  editable={canEditCompany}
                  fieldId="org-company-homepage-url"
                  href={currentCompanyDraft.homepageUrl}
                  label={c("웹사이트", "Website")}
                  onEdit={() => startCompanyEditing("homepageUrl")}
                  onValueChange={(homepageUrl) =>
                    changeCompanyDraft({ homepageUrl })
                  }
                />
              )}
              {(canEditCompany || currentCompanyDraft.linkedinUrl) && (
                <CompanyEditableLink
                  disabled={updateWorkspace.isPending}
                  editable={canEditCompany}
                  fieldId="org-company-linkedin-url"
                  href={currentCompanyDraft.linkedinUrl}
                  label={c("LinkedIn", "LinkedIn")}
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
            c("Members", "Members")
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
          {c(
            "Harper가 후보자에게 회사를 정확히 설명할 때 사용하는 정보예요. 모든 역할에 공통으로 적용되며, 후보자의 관심사와 질문에 맞춰 필요한 내용을 자연스럽게 활용해요.",
            "Harper uses this company information across roles to answer candidates' questions."
          )}
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
            title={c("Company", "Company")}
            actions={
              <>
                {canEditCompany && !companyInfoEditing ? (
                  <MuteButton
                    disabled={updateWorkspace.isPending}
                    onClick={startCompanyInfoEditing}
                    size="md"
                    type="button"
                  >
                    <Pencil className="size-4" />
                    {c("수정하기", "Edit")}
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
                  label={c("본사 위치", "Headquarters")}
                  value={
                    companyInfoEditing ? (
                      <Input
                        autoFocus
                        aria-label={c("본사 위치", "Headquarters")}
                        className="h-9 w-full text-[13px]"
                        disabled={updateWorkspace.isPending}
                        onChange={(event) =>
                          changeCompanyDraft({
                            locationText: event.target.value,
                          })
                        }
                        placeholder={c("본사 위치", "Headquarters")}
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
                  label={c("설립 연도", "Founded")}
                  value={
                    companyInfoEditing ? (
                      <Input
                        aria-label={c("설립 연도", "Founded")}
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
                        placeholder={c("설립 연도", "Founded")}
                        type="number"
                        value={currentCompanyDraft.foundedYear ?? ""}
                      />
                    ) : (
                      <CompanyInfoText
                        value={
                          currentCompanyDraft.foundedYear
                            ? c("{p0}년", "{p0}", {
                                p0: currentCompanyDraft.foundedYear,
                              })
                            : null
                        }
                      />
                    )
                  }
                />
                <CompanyInfoRow
                  icon={<Users className="size-4" strokeWidth={2} />}
                  label={c("팀원 수", "Team size")}
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
                          aria-label={c("팀원 수", "Team size")}
                          className="w-full text-[13px]"
                        >
                          <SelectValue
                            placeholder={c("팀원 수 범위", "Team size range")}
                          />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          data-inline-editable-interaction=""
                        >
                          <SelectItem value={EMPTY_EMPLOYEE_COUNT_RANGE}>
                            {c("정보 없음", "No information")}
                          </SelectItem>
                          {EMPLOYEE_COUNT_RANGE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {sourceT(option.label)}
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
                  label={c("최근 투자 단계", "Funding stage")}
                  value={
                    companyInfoEditing ? (
                      <Input
                        aria-label={c("최근 투자 단계", "Funding stage")}
                        className="h-9 w-full text-[13px]"
                        disabled={updateWorkspace.isPending}
                        onChange={(event) =>
                          changeCompanyDraft({
                            lastFundingStage: event.target.value,
                          })
                        }
                        placeholder={c("최근 투자 단계", "Funding stage")}
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
                  label={c("누적 투자 유치액", "Total funding")}
                  value={
                    companyInfoEditing ? (
                      <Input
                        aria-label={c("누적 투자 유치액", "Total funding")}
                        className="h-9 w-full text-[13px]"
                        disabled={updateWorkspace.isPending}
                        onChange={(event) =>
                          changeCompanyDraft({
                            totalFundingRaised: event.target.value,
                          })
                        }
                        placeholder={c("누적 투자 유치액", "Total funding")}
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
                  label={c("최근 투자 라운드", "Recent funding round")}
                  value={
                    companyInfoEditing ? (
                      <Input
                        aria-label={c(
                          "최근 투자 라운드",
                          "Recent funding round"
                        )}
                        className="h-9 w-full text-[13px]"
                        disabled={updateWorkspace.isPending}
                        onChange={(event) =>
                          changeCompanyDraft({
                            lastFundingRoundDescription: event.target.value,
                          })
                        }
                        placeholder={c(
                          "최근 투자 라운드",
                          "Recent funding round"
                        )}
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

          {!hideEmptyDescription || currentCompanyDraft.pitch.trim() ? (
            <section>
              <OrgSectionHeader
                title={c("Company Description", "Company description")}
              />
              {inlineDescription && readOnlyCompany ? (
                <RichText
                  content={currentCompanyDraft.pitch}
                  className="mt-3 text-[13px] leading-6"
                  referenceLinks
                />
              ) : (
                <DocumentEditor
                  {...documentEditorCopy}
                  aria-label={c(
                    "Company Description 수정",
                    "Edit company description"
                  )}
                  className="mt-2 max-w-4xl"
                  disabled={updateWorkspace.isPending}
                  documentTitle={c(
                    "Company Description",
                    "Company description"
                  )}
                  errorMessage={
                    companyEditingField === "pitch" ? companySaveError : ""
                  }
                  lastChangedAt={workspace.updatedAt}
                  onChange={(event) =>
                    changeCompanyDraft({ pitch: event.target.value }, "pitch")
                  }
                  placeholder={c(
                    "후보자에게 회사를 소개할 때 강조할 내용을 작성해 주세요.",
                    "Describe key points to emphasize when introducing the company to candidates."
                  )}
                  readOnly={!canEditCompany}
                  rows={4}
                  savedValue={workspace.pitch ?? ""}
                  value={currentCompanyDraft.pitch}
                />
              )}
            </section>
          ) : null}

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

      {showMembers && (teams.length > 0 || permissions.canManageTeams) ? (
        <Tabs
          className="mb-6 mt-6 gap-2 [&_[role=tab]]:min-w-28"
          activeValue={memberTab}
          onValueChange={setMemberTab}
          items={[
            {
              value: "members",
              label: (
                <span className="flex items-center gap-2">
                  {c("Members", "Members")}
                  <span className="text-[12px] tabular-nums text-neutral-soft">
                    {members.length}
                  </span>
                </span>
              ),
            },
            {
              value: "teams",
              label: (
                <span className="flex items-center gap-2">
                  {c("팀", "Teams")}
                  <span className="text-[12px] tabular-nums text-neutral-soft">
                    {teams.length}
                  </span>
                </span>
              ),
            },
          ]}
        />
      ) : null}
      {showMembers && memberTab === "teams" ? <OrgTeamsSection /> : null}
      {showMembers && createTeamOpen ? (
        <OrgTeamEditor team={null} onClose={() => setCreateTeamOpen(false)} />
      ) : null}
      {showMembers && memberTab === "members" ? (
        <OrgSection>
          <p className="mb-6 text-sm text-neutral-700">
            {c(
              "함께 후보자를 검토할 팀원을 초대하고 역할에 맞는 권한을 부여하세요.",
              "Invite teammates to review candidates and set workspace permissions."
            )}
            {/* {invitations.length > 0 ? <span className="ml-2">{c("수락 대기 {count}명", "{count} pending invites", { count: invitations.length })}</span> : null} */}
          </p>
          <div className="space-y-6">
            <div>
              <div className="divide-y divide-neutral-1000-a05 border-y border-neutral-1000-a05 md:hidden">
                {members.map((member) => (
                  <article
                    className="py-4"
                    key={`mobile-member-${member.userId}`}
                  >
                    <div className="flex min-w-0 font-normal items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <MemberAvatar member={member} />
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <h4 className="truncate text-[14px] text-neutral-primary">
                              {member.name || c("이름 없음", "No name")}
                            </h4>
                            {member.userId === currentUser?.userId ? (
                              <Badge radius="full" size="sm" variant="faded">
                                {c("나", "Me")}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="truncate text-[13px] text-neutral-muted">
                            {member.email || c("이메일 없음", "No email")}
                          </p>
                        </div>
                      </div>
                      {permissions.canManageMembers ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <MuteButton
                              aria-label={c("{p0} 작업", "{p0} actions", {
                                p0:
                                  member.name ||
                                  member.email ||
                                  c("팀원", "Member"),
                              })}
                              className="-mr-1 -mt-1 rounded-full"
                              size="md"
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
                              {c("직함 수정", "Edit title")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={removeMember.isPending}
                              onSelect={() => setMemberToRemove(member)}
                              tone="danger"
                            >
                              <Trash2 />
                              {c("팀원 제거", "Remove member")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                      <div className="min-w-0">
                        <dt className="text-[11px] text-neutral-soft">
                          {c("직함", "Title")}
                        </dt>
                        <dd className="mt-1 truncate text-[13px] text-neutral-primary">
                          {member.role || c("미입력", "Unspecified")}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[11px] text-neutral-soft">
                          {c("가입 날짜", "Join date")}
                        </dt>
                        <dd className="mt-1 truncate text-[13px] text-neutral-primary">
                          {formatDate(member.joinedAt, locale)}
                        </dd>
                      </div>
                      <div className="col-span-2 flex min-w-0 items-center justify-between gap-3 border-t border-neutral-1000-a05 pt-3">
                        <dt className="text-[11px] text-neutral-soft">
                          {c("권한", "Permission")}
                        </dt>
                        <dd className="shrink-0">
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
                                className="h-8 w-[116px] bg-bg-default text-[12px]"
                                size="sm"
                              >
                                <SelectValue>
                                  {sourceT(getOrgRoleLabel(member.authority))}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent align="end">
                                {ORG_MEMBERSHIP_ROLE_OPTIONS.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {sourceT(option.label)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[12px] text-neutral-muted">
                              {sourceT(getOrgRoleLabel(member.authority))}
                            </span>
                          )}
                        </dd>
                      </div>
                      {showTeamAccess ? (
                        <div className="col-span-2 flex items-center justify-between gap-3">
                          <dt className="text-[12px] text-neutral-muted">
                            {c("접근 범위", "Access")}
                          </dt>
                          <dd>
                            <OrgMemberTeamSelect member={member} />
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))}
                {invitations.map((invitation) => (
                  <article
                    className="bg-bg-weak/30 py-4"
                    key={`mobile-invitation-${invitation.invitationId}`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
                          {invitation.email.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <h4 className="truncate text-[14px] font-medium text-neutral-primary">
                              {invitation.email}
                            </h4>
                            <Badge radius="full" size="sm" variant="faded">
                              {c("수락 대기", "Pending acceptance")}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[12px] text-neutral-muted">
                            {sourceT(getOrgRoleLabel(invitation.role))}{" "}
                            {c("권한으로 초대됨", "Invited with permissions")}
                          </p>
                        </div>
                      </div>
                      {permissions.canManageMembers ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <MuteButton
                              aria-label={c(
                                "{p0} 초대 작업",
                                "{p0} invite actions",
                                { p0: invitation.email }
                              )}
                              className="-mr-1 -mt-1 rounded-full"
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
                              {c("다시 보내기", "Resend")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={cancelInvitation.isPending}
                              onSelect={() => setInvitationToCancel(invitation)}
                              tone="danger"
                            >
                              {c("초대 취소", "Cancel invite")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <OrgTable className="min-w-[720px] text-left">
                  <OrgTableHeader>
                    <OrgTableRow>
                      <OrgTableHead>{c("팀원", "Team members")}</OrgTableHead>
                      <OrgTableHead className="w-32">
                        {c("직함", "Title")}
                      </OrgTableHead>
                      <OrgTableHead className="w-36">
                        {c("권한", "Permission")}
                      </OrgTableHead>
                      {showTeamAccess ? (
                        <OrgTableHead className="w-32">
                          {c("접근 범위", "Access")}
                        </OrgTableHead>
                      ) : null}
                      <OrgTableHead className="w-40">
                        {c("가입 날짜", "Join date")}
                      </OrgTableHead>
                      {permissions.canManageMembers ? (
                        <OrgTableHead className="w-12">
                          <span className="sr-only">
                            {c("팀원 작업", "Member actions")}
                          </span>
                        </OrgTableHead>
                      ) : null}
                    </OrgTableRow>
                  </OrgTableHeader>
                  <OrgTableBody>
                    {members.map((member) => (
                      <OrgTableRow key={`member-${member.userId}`}>
                        <OrgTableCell className="py-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <MemberAvatar member={member} />
                            <div className="min-w-0">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-[14px] text-neutral-primary">
                                  {member.name || c("이름 없음", "No name")}
                                </span>
                                {member.userId === currentUser?.userId ? (
                                  <Badge
                                    radius="full"
                                    size="sm"
                                    variant="faded"
                                  >
                                    {c("나", "Me")}
                                  </Badge>
                                ) : null}
                              </span>
                              <p className="mt-0 max-w-64 truncate text-[13px] text-neutral-soft">
                                {member.email || "-"}
                              </p>
                            </div>
                          </div>
                        </OrgTableCell>
                        <OrgTableCell>
                          <span className="block max-w-40 truncate text-[12px] text-neutral-muted">
                            {member.role || "-"}
                          </span>
                        </OrgTableCell>
                        <OrgTableCell>
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
                                className="w-[104px] text-[12px]"
                                size="sm"
                              >
                                <SelectValue>
                                  {sourceT(getOrgRoleLabel(member.authority))}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent align="end">
                                {ORG_MEMBERSHIP_ROLE_OPTIONS.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {sourceT(option.label)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-[12px] text-neutral-muted">
                              {sourceT(getOrgRoleLabel(member.authority))}
                            </span>
                          )}
                        </OrgTableCell>
                        {showTeamAccess ? (
                          <OrgTableCell>
                            <OrgMemberTeamSelect member={member} />
                          </OrgTableCell>
                        ) : null}
                        <OrgTableCell className="text-[12px] font-light text-neutral-muted">
                          {formatDate(member.joinedAt, locale)}
                        </OrgTableCell>
                        {permissions.canManageMembers ? (
                          <OrgTableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <MuteButton
                                  size="sm"
                                  variant="transparent"
                                  aria-label={c("{p0} 작업", "{p0} actions", {
                                    p0:
                                      member.name ||
                                      member.email ||
                                      c("팀원", "Team members"),
                                  })}
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
                                  {c("직함 수정", "Edit title")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={removeMember.isPending}
                                  onSelect={() => setMemberToRemove(member)}
                                  tone="danger"
                                >
                                  <Trash2 />
                                  {c("팀원 제거", "Remove member")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </OrgTableCell>
                        ) : null}
                      </OrgTableRow>
                    ))}
                    {invitations.map((invitation) => (
                      <OrgTableRow
                        className="border-b border-neutral-1000-a05 bg-bg-weak/30 last:border-b-0"
                        key={`invitation-${invitation.invitationId}`}
                      >
                        <OrgTableCell className="py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[12px] font-medium text-neutral-muted">
                              {invitation.email.slice(0, 1).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-64 truncate text-[13px] text-neutral-primary">
                                {invitation.email}
                              </p>
                              <p className="mt-1 text-[12px] text-neutral-soft">
                                {c("수락 대기", "Pending acceptance")}
                              </p>
                            </div>
                          </div>
                        </OrgTableCell>
                        <OrgTableCell className="text-[12px] text-neutral-muted">
                          -
                        </OrgTableCell>
                        <OrgTableCell className="text-[12px] text-neutral-muted">
                          {sourceT(getOrgRoleLabel(invitation.role))}
                        </OrgTableCell>
                        {showTeamAccess ? (
                          <OrgTableCell className="text-[12px] text-neutral-muted">
                            {invitation.accessScope === "team"
                              ? teams.find(
                                  (team) => team.teamId === invitation.teamId
                                )?.name ||
                                c("팀 배정 필요", "Team assignment needed")
                              : c("전체 Role", "All Roles")}
                          </OrgTableCell>
                        ) : null}
                        <OrgTableCell className="text-[12px] font-light text-neutral-muted">
                          -
                        </OrgTableCell>
                        {permissions.canManageMembers ? (
                          <OrgTableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <MuteButton
                                  size="sm"
                                  variant="transparent"
                                  aria-label={c("{p0} 작업", "{p0} actions", {
                                    p0: invitation.email,
                                  })}
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
                                  {c("다시 보내기", "Resend")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={cancelInvitation.isPending}
                                  onSelect={() =>
                                    setInvitationToCancel(invitation)
                                  }
                                  tone="danger"
                                >
                                  {c("초대 취소", "Cancel invite")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </OrgTableCell>
                        ) : null}
                      </OrgTableRow>
                    ))}
                  </OrgTableBody>
                </OrgTable>
              </div>
            </div>
          </div>
        </OrgSection>
      ) : null}

      {showCompany &&
      canEditCompany &&
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

          <TalentCareerModal
            open={Boolean(memberRoleToEdit)}
            onClose={() => {
              if (!updateMemberProfile.isPending) {
                setMemberRoleToEdit(null);
                setMemberRoleError(null);
              }
            }}
            mobileBottomSheet
            title={<>{c("직함 수정", "Edit title")}</>}
            description={
              <>
                {c(
                  "{memberName}의 팀 내 직함을 입력해 주세요.",
                  "Enter {memberName}'s job title.",
                  {
                    memberName:
                      memberRoleToEdit?.name ||
                      memberRoleToEdit?.email ||
                      c("선택한 팀원", "Selected members"),
                  }
                )}
              </>
            }
            panelClassName="max-w-sm"
            bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
            footer={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <MuteButton
                  disabled={updateMemberProfile.isPending}
                  onClick={() => setMemberRoleToEdit(null)}
                  size="md"
                  type="button"
                  form={modalFormId2}
                >
                  {c("취소", "Cancel")}
                </MuteButton>
                <MuteButton
                  disabled={updateMemberProfile.isPending}
                  size="md"
                  type="submit"
                  variant="primary"
                  form={modalFormId2}
                >
                  {updateMemberProfile.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  {c("저장", "Save")}
                </MuteButton>
              </div>
            }
          >
            <form
              className="space-y-4"
              onSubmit={(event) => void saveMemberRole(event)}
              id={modalFormId2}
            >
              <TextField
                autoFocus
                id="org-member-role-edit"
                label={c("직함", "Title")}
                maxLength={160}
                onChange={(event) => {
                  setMemberRoleDraft(event.target.value);
                  setMemberRoleError(null);
                }}
                placeholder={c(
                  "예: 채용 매니저, VP of Engineering",
                  "e.g. Hiring manager, VP of Engineering"
                )}
                required
                value={memberRoleDraft}
              />
              {memberRoleError ? (
                <p className="text-[12px] leading-5 text-critical" role="alert">
                  {memberRoleError}
                </p>
              ) : null}
            </form>
          </TalentCareerModal>

          <TalentCareerModal
            open={Boolean(invitationToCancel)}
            onClose={() => setInvitationToCancel(null)}
            mobileBottomSheet
            title={<>{c("초대 취소", "Cancel invite")}</>}
            description={
              <>
                {c(
                  "{email}에 부여한 Organization 초대 권한을 취소합니다.",
                  "Cancel the organization invite for {email}.",
                  {
                    email: invitationToCancel?.email || "",
                  }
                )}
              </>
            }
            panelClassName="max-w-sm"
            bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
            footer={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <MuteButton
                  disabled={cancelInvitation.isPending}
                  onClick={() => setInvitationToCancel(null)}
                  size="md"
                  type="button"
                >
                  {c("돌아가기", "Back")}
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
                  {c("초대 취소", "Cancel invite")}
                </MuteButton>
              </div>
            }
          >
            <></>
          </TalentCareerModal>

          <TalentCareerModal
            open={Boolean(memberToRemove)}
            onClose={() => setMemberToRemove(null)}
            mobileBottomSheet
            title={<>{c("팀원 제거", "Remove member")}</>}
            description={
              <>
                {c(
                  "{memberName}를 Organization에서 제거합니다. 제거한 팀원는 더 이상 이 Organization에 접근할 수 없습니다.",
                  "Remove {memberName} from the organization? They will lose access.",
                  {
                    memberName:
                      memberToRemove?.name ||
                      memberToRemove?.email ||
                      c("선택한 팀원", "Selected members"),
                  }
                )}
              </>
            }
            panelClassName="max-w-sm"
            bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
            footer={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <MuteButton
                  disabled={removeMember.isPending}
                  onClick={() => setMemberToRemove(null)}
                  size="md"
                  type="button"
                >
                  {c("돌아가기", "Back")}
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
                  {c("팀원 제거", "Remove member")}
                </MuteButton>
              </div>
            }
          >
            <></>
          </TalentCareerModal>
        </>
      ) : null}
    </div>
  );
}
