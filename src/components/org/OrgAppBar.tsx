import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useOrgT } from "@/i18n/org/OrgLocaleProvider";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpenText,
  ChevronDown,
  FileText,
  LoaderCircle,
  LogOut,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/router";
import { type ClipboardEvent, useEffect, useRef, useState } from "react";
import { OrgSlackPanel } from "@/components/org/OrgSlackPanel";
import { OrgDocsModal } from "@/components/org/OrgDocsModal";
import { BareButton, Button } from "@/components/ui/button";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrgLanguageMenu } from "@/components/org/OrgLanguageMenu";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { localizedOrgErrorMessage } from "@/i18n/org/errorMessage";
import {
  useLeaveOrgWorkspace,
  useSendOrgInvitations,
} from "@/hooks/org/useOrg";
import { useOrgSlackStatus } from "@/hooks/org/useOrgSlack";
import type {
  OrgMember,
  OrgWorkspace,
  OrgWorkspaceInvitation,
} from "@/lib/org/server";
import { queryKeys } from "@/lib/queryKeys";
import { useToastStore } from "@/store/useToastStore";

const MAX_INVITE_EMAILS = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeInviteEmail(value: string) {
  return value.trim().toLowerCase();
}

function splitInviteEmails(value: string) {
  return value
    .split(/[\s,;]+/)
    .map(normalizeInviteEmail)
    .filter(Boolean);
}

function formatInvitationDate(value: string, locale: "ko" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function WorkspaceLogo({
  size = "md",
  workspace,
}: {
  size?: "md" | "sm";
  workspace: OrgWorkspace;
}) {
  const t = useOrgT();
  const className = size === "sm" ? "h-6 w-6 rounded-md" : "h-7 w-7 rounded-md";

  if (workspace.logoUrl) {
    const imageSize = size === "sm" ? 24 : 28;
    return (
      <Image
        src={workspace.logoUrl}
        alt={t("OrgAppBar.c636f3b2", "")}
        width={imageSize}
        height={imageSize}
        unoptimized
        className={`${className} shrink-0 border border-neutral-1000-a05 object-cover`}
      />
    );
  }

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center bg-bg-weak text-[11px] font-medium text-neutral-muted`}
    >
      {workspace.companyName.slice(0, 1).toUpperCase()}
    </span>
  );
}

function UserAvatar({
  member,
  size = "md",
}: {
  member?: OrgMember | null;
  size?: "md" | "sm";
}) {
  const displayName = member?.name || member?.email || "User";
  const className = size === "sm" ? "h-6 w-6 rounded-md" : "h-7 w-7 rounded-md";
  const imageSize = size === "sm" ? 24 : 28;
  const textClassName = size === "sm" ? "text-[11px]" : "text-xs";

  if (member?.profilePicture) {
    return (
      <Image
        src={member.profilePicture}
        alt={displayName}
        width={imageSize}
        height={imageSize}
        unoptimized
        className={`${className} shrink-0 object-cover`}
      />
    );
  }

  return (
    <span
      className={`${className} ${textClassName} flex shrink-0 items-center justify-center bg-neutral-1000 font-medium text-neutral-00`}
    >
      {displayName.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function OrgAppBar({
  canSwitchWorkspace = false,
  currentUser,
  invitations,
  members,
  onEditWorkspace,
  onSignOut,
  onWorkspaceSelect,
  signOutPending,
  workspace,
  workspaces = [],
}: {
  canSwitchWorkspace?: boolean;
  currentUser?: OrgMember | null;
  invitations: OrgWorkspaceInvitation[];
  members: OrgMember[];
  onEditWorkspace: () => void;
  onSignOut: () => void;
  onWorkspaceSelect?: (workspaceId: string) => void;
  signOutPending?: boolean;
  workspace: OrgWorkspace;
  workspaces?: OrgWorkspace[];
}) {
  const t = useOrgT();
  const { locale } = useOrgLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const addToast = useToastStore((state) => state.add);
  const [open, setOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [slackOpen, setSlackOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteInputError, setInviteInputError] = useState("");
  const [failedInviteEmails, setFailedInviteEmails] = useState<
    Record<string, string>
  >({});
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);
  const handledSlackResult = useRef("");
  const switchableWorkspaces = canSwitchWorkspace ? workspaces : [];
  const showWorkspaceSwitcher =
    canSwitchWorkspace &&
    switchableWorkspaces.length > 1 &&
    Boolean(onWorkspaceSelect);
  const slackStatusQuery = useOrgSlackStatus({
    workspaceId: workspace.workspaceId,
  });
  const sendInvitations = useSendOrgInvitations();
  const leaveWorkspace = useLeaveOrgWorkspace();
  const currentUserName = currentUser?.name || currentUser?.email || "User";
  const slackStatusText = slackStatusQuery.isLoading
    ? t("OrgAppBar.5815e707", "확인 중")
    : slackStatusQuery.error
      ? t("OrgAppBar.ebea6b3e", "확인 실패")
      : slackStatusQuery.data?.connected
        ? t("OrgAppBar.46d20264", "연결됨")
        : t("OrgAppBar.ce25e903", "미연결");
  const addInviteEmails = (values: string[]) => {
    const normalized = values.map(normalizeInviteEmail).filter(Boolean);
    if (normalized.length === 0) return false;

    const invalidEmails = normalized.filter(
      (email) => email.length > 320 || !EMAIL_PATTERN.test(email)
    );
    const validEmails = normalized.filter(
      (email) => email.length <= 320 && EMAIL_PATTERN.test(email)
    );

    const existingEmails = new Set(inviteEmails);
    const memberEmails = new Set(
      members
        .map((member) => normalizeInviteEmail(member.email ?? ""))
        .filter(Boolean)
    );
    const pendingEmails = new Set(
      invitations.map((invitation) => invitation.email)
    );
    let skippedDuplicate = false;
    let existingMemberEmail = "";
    let pendingInvitationEmail = "";
    const nextEmails = validEmails.filter((email, index) => {
      if (validEmails.indexOf(email) !== index || existingEmails.has(email)) {
        skippedDuplicate = true;
        return false;
      }
      if (memberEmails.has(email)) {
        existingMemberEmail ||= email;
        return false;
      }
      if (pendingEmails.has(email)) {
        pendingInvitationEmail ||= email;
        return false;
      }
      return true;
    });
    const available = MAX_INVITE_EMAILS - inviteEmails.length;
    const acceptedEmails = nextEmails.slice(0, available);

    if (nextEmails.length > available) {
      addToast({
        message: t(
          "OrgAppBar.57d1e70c",
          "한 번에 최대 {p0}명까지 초대할 수 있습니다.",
          { p0: MAX_INVITE_EMAILS }
        ),
        variant: "error",
      });
    }
    if (existingMemberEmail) {
      addToast({
        message: t("OrgAppBar.c7949354", "{p0}은 이미 참여 중입니다.", {
          p0: existingMemberEmail,
        }),
        variant: "error",
      });
    }
    if (pendingInvitationEmail) {
      addToast({
        message: t(
          "OrgAppBar.2f34cd08",
          "{p0}은 이미 초대 수락을 기다리고 있습니다.",
          { p0: pendingInvitationEmail }
        ),
        variant: "error",
      });
    }
    if (acceptedEmails.length > 0) {
      setInviteEmails((emails) => [...emails, ...acceptedEmails]);
      setFailedInviteEmails((failures) => {
        const next = { ...failures };
        acceptedEmails.forEach((email) => delete next[email]);
        return next;
      });
    }
    setInviteInputError(
      invalidEmails.length > 0
        ? t("OrgAppBar.db4bf67e", "{p0}의 형식을 확인해 주세요.", {
            p0: invalidEmails[0],
          })
        : skippedDuplicate
          ? t("OrgAppBar.99b810e6", "이미 추가한 이메일은 제외했습니다.")
          : ""
    );
    return acceptedEmails.length > 0;
  };

  const commitInviteInput = () => {
    if (!inviteInput.trim()) return;
    if (addInviteEmails(splitInviteEmails(inviteInput))) {
      setInviteInput("");
    }
  };

  const removeInviteEmail = (email: string) => {
    setInviteEmails((emails) => emails.filter((item) => item !== email));
    setFailedInviteEmails((failures) => {
      const next = { ...failures };
      delete next[email];
      return next;
    });
  };

  const pasteInviteEmails = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    const emails = splitInviteEmails(pasted);
    if (emails.length === 0) return;
    event.preventDefault();
    if (addInviteEmails(emails)) setInviteInput("");
  };

  const sendInviteEmails = async () => {
    let emails = inviteEmails;
    const tail = normalizeInviteEmail(inviteInput);
    if (tail) {
      if (tail.length > 320 || !EMAIL_PATTERN.test(tail)) {
        setInviteInputError(
          t("OrgAppBar.8b30f7c6", "이메일 형식을 확인해 주세요.")
        );
        return;
      }
      if (
        members.some(
          (member) => normalizeInviteEmail(member.email ?? "") === tail
        )
      ) {
        setInviteInputError(
          t("OrgAppBar.c7949354", "{p0}은 이미 참여 중입니다.", { p0: tail })
        );
        return;
      }
      if (invitations.some((invitation) => invitation.email === tail)) {
        setInviteInputError(
          t(
            "OrgAppBar.932217bb",
            "{p0}은 이미 수락 대기중입니다. 아래에서 다시 보내기를 이용해 주세요.",
            { p0: tail }
          )
        );
        return;
      }
      if (!emails.includes(tail)) emails = [...emails, tail];
    }
    if (emails.length === 0) {
      setInviteInputError(
        t("OrgAppBar.2acd6035", "초대할 이메일을 입력해 주세요.")
      );
      return;
    }
    if (emails.length > MAX_INVITE_EMAILS) {
      addToast({
        message: t(
          "OrgAppBar.57d1e70c",
          "한 번에 최대 {p0}명까지 초대할 수 있습니다.",
          { p0: MAX_INVITE_EMAILS }
        ),
        variant: "error",
      });
      return;
    }

    setInviteEmails(emails);
    setInviteInput("");
    setInviteInputError("");
    setFailedInviteEmails({});

    try {
      const payload = await sendInvitations.mutateAsync({
        emails,
        role: "admin",
        workspaceId: workspace.workspaceId,
      });
      const failures: Record<string, string> = {};
      for (const result of payload.results) {
        if (result.status === "failed" || result.status === "invalid") {
          failures[result.email] = localizedOrgErrorMessage(
            new Error(result.message),
            locale,
            t("OrgAppBar.5e25a1ac", "초대 메일을 보내지 못했습니다.")
          );
        }
      }
      const sentCount = payload.results.filter(
        (result) => result.status === "sent"
      ).length;
      const alreadyMemberCount = payload.results.filter(
        (result) => result.status === "already_member"
      ).length;
      const failedEmails = Object.keys(failures);
      setFailedInviteEmails(failures);
      setInviteEmails(failedEmails);

      if (sentCount > 0) {
        addToast({
          message: t(
            "OrgAppBar.dbf7a530",
            "{p0}명에게 초대 메일을 보냈습니다.",
            { p0: sentCount }
          ),
          variant: failedEmails.length > 0 ? "error" : "success",
        });
      } else if (alreadyMemberCount > 0 && failedEmails.length === 0) {
        addToast({
          message: t(
            "OrgAppBar.d2b07645",
            "입력한 이메일은 이미 참여 중입니다."
          ),
          variant: "error",
        });
      }
      if (failedEmails.length > 0 && sentCount === 0) {
        addToast({
          message: t(
            "OrgAppBar.33c5cf8b",
            "초대 메일을 보내지 못했습니다. 다시 시도해 주세요."
          ),
          variant: "error",
        });
      }
    } catch (error) {
      const message = localizedOrgErrorMessage(
        error,
        locale,
        t("OrgAppBar.5e25a1ac", "초대 메일을 보내지 못했습니다.")
      );
      setFailedInviteEmails(
        Object.fromEntries(emails.map((email) => [email, message]))
      );
      addToast({ message, variant: "error" });
    }
  };

  const resendInvitation = async (email: string) => {
    setResendingEmail(email);
    try {
      const payload = await sendInvitations.mutateAsync({
        emails: [email],
        role: "admin",
        workspaceId: workspace.workspaceId,
      });
      const result = payload.results[0];
      if (
        !result ||
        result.status === "failed" ||
        result.status === "invalid"
      ) {
        throw new Error(
          result?.message ||
            t("OrgAppBar.5e25a1ac", "초대 메일을 보내지 못했습니다.")
        );
      }
      addToast({
        message: t(
          "OrgAppBar.91c2f4c3",
          "{p0}로 초대 메일을 다시 보냈습니다.",
          { p0: email }
        ),
        variant: "success",
      });
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(
          error,
          locale,
          t("OrgAppBar.5e25a1ac", "초대 메일을 보내지 못했습니다.")
        ),
        variant: "error",
      });
    } finally {
      setResendingEmail(null);
    }
  };

  const handleLeaveWorkspace = async () => {
    let nextWorkspaceId: string | null = null;
    try {
      const payload = await leaveWorkspace.mutateAsync({
        workspaceId: workspace.workspaceId,
      });
      nextWorkspaceId = payload.nextWorkspaceId;
    } catch (error) {
      addToast({
        message: localizedOrgErrorMessage(
          error,
          locale,
          t("OrgAppBar.b291ae88", "Organization에서 탈퇴하지 못했습니다.")
        ),
        variant: "error",
      });
      return;
    }

    setLeaveDialogOpen(false);
    addToast({
      message: t("OrgAppBar.12a18675", "{p0} Organization에서 탈퇴했습니다.", {
        p0: workspace.companyName,
      }),
      variant: "success",
    });
    const nextHref = nextWorkspaceId
      ? `/org?orgId=${encodeURIComponent(nextWorkspaceId)}`
      : "/org";
    try {
      await router.replace(nextHref);
      await queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    } catch {
      window.location.assign(nextHref);
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    const result =
      typeof router.query.slack === "string" ? router.query.slack : "";
    const message =
      typeof router.query.slackMessage === "string"
        ? router.query.slackMessage
        : "";
    if (!result) return;

    const resultKey = `${result}:${message}`;
    if (handledSlackResult.current === resultKey) return;
    handledSlackResult.current = resultKey;
    setSlackOpen(true);
    addToast({
      message:
        result === "connected"
          ? t("OrgAppBar.bb3a2f09", "Slack 채널을 연결했습니다.")
          : message ||
            t("OrgAppBar.6118ed2a", "Slack 연결을 완료하지 못했습니다."),
      variant: result === "connected" ? "success" : "error",
    });
    const nextQuery = { ...router.query };
    delete nextQuery.slack;
    delete nextQuery.slackMessage;
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true }
    );
  }, [addToast, router, router.query.slack, router.query.slackMessage, t]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-neutral-1000-a05 bg-bg-default/92 backdrop-blur">
        <div className="mx-auto flex h-[52px] max-w-[1440px] items-center justify-between gap-3 px-3 sm:px-5">
          {showWorkspaceSwitcher ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BareButton
                  type="button"
                  className="flex min-w-0 max-w-[360px] items-center gap-2.5 rounded-md px-1.5 py-1 text-left outline-none transition hover:bg-bg-weak focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                >
                  <WorkspaceLogo workspace={workspace} />
                  <span className="min-w-0 truncate text-sm font-semibold text-neutral-primary">
                    {workspace.companyName}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-neutral-soft" />
                </BareButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                {switchableWorkspaces.map((item) => (
                  <DropdownMenuItem
                    key={item.workspaceId}
                    selected={item.workspaceId === workspace.workspaceId}
                    onSelect={() => {
                      if (item.workspaceId !== workspace.workspaceId) {
                        onWorkspaceSelect?.(item.workspaceId);
                      }
                    }}
                    className="gap-2.5"
                  >
                    <WorkspaceLogo workspace={item} size="sm" />
                    <span className="min-w-0 truncate">{item.companyName}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex min-w-0 items-center gap-2.5">
              <WorkspaceLogo workspace={workspace} />
              <div className="min-w-0 truncate text-sm font-semibold text-neutral-primary">
                {workspace.companyName}
              </div>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onEditWorkspace}
              className="hidden sm:inline-flex border-none bg-black/5"
            >
              <FileText className="h-4 w-4" />
              {t("OrgAppBar.447339bd", "회사 정보 수정")}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setOpen(true)}
              className="hidden sm:inline-flex border-none bg-black/5"
            >
              <Users className="h-4 w-4" />
              {t("OrgAppBar.23fe412b", "워크스페이스 관리")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BareButton
                  type="button"
                  aria-label={t("OrgAppBar.4171927e", "계정 메뉴")}
                  className="flex h-8 w-8 items-center justify-center rounded-md outline-none transition hover:ring-4 hover:ring-neutral-1000-a10 focus-visible:ring-4 focus-visible:ring-neutral-1000-a10"
                >
                  <UserAvatar member={currentUser} />
                </BareButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="px-3 py-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar member={currentUser} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-primary">
                        {currentUserName}
                      </div>
                      {currentUser?.email ? (
                        <div className="truncate text-xs font-normal text-neutral-muted">
                          {currentUser.email}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => setOpen(true)}
                  className="sm:hidden"
                >
                  <Users className="h-4 w-4" />
                  {t("OrgAppBar.db08b9a6", "워크스페이스")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDocsOpen(true)}>
                  <BookOpenText className="h-4 w-4" />
                  {t("OrgAppBar.9c22d5f4", "Docs")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setSlackOpen(true)}
                  className="justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Image
                      src="/images/logos/slack.svg"
                      alt={t("OrgAppBar.05cfb2ab", "Slack")}
                      width={16}
                      height={16}
                    />
                    <span className="truncate">
                      {t("OrgAppBar.91ce0989", "Slack 연결")}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-soft">
                    {slackStatusText}
                  </span>
                </DropdownMenuItem>
                <OrgLanguageMenu />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  tone="danger"
                  disabled={signOutPending || leaveWorkspace.isPending}
                  onSelect={() => onSignOut()}
                >
                  {signOutPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  {t("OrgAppBar.d2aa9bcd", "로그아웃")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  tone="danger"
                  disabled={signOutPending || leaveWorkspace.isPending}
                  onSelect={() => setLeaveDialogOpen(true)}
                >
                  <UserMinus className="h-4 w-4" />
                  {workspace.companyName} {t("OrgAppBar.a6f02166", "탈퇴")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <TalentCareerModal
        open={open}
        onClose={() => setOpen(false)}
        mobileBottomSheet
        title={<>{t("OrgAppBar.ba94fd43", "팀원 초대")}</>}
        description={
          <>{t("OrgAppBar.794fa223", "팀원을 워크스페이스에 초대하세요.")}</>
        }
        panelClassName="max-w-xl"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
      >
        <div className="mt-3 space-y-5">
          <form
            className="space-y-1"
            onSubmit={(event) => {
              event.preventDefault();
              void sendInviteEmails();
            }}
          >
            <div className="flex flex-row items-end justify-between">
              <label
                htmlFor="org-invite-email"
                className="text-[13px] font-medium text-neutral-primary mb-1"
              >
                {t("OrgAppBar.c5cc79d7", "이메일로 초대 링크 발송")}
              </label>
            </div>

            <div className="flex flex-1 flex-row gap-1 items-center w-full justify-between">
              <div
                className={`w-full flex relative cursor-text flex-wrap content-start items-start gap-1.5 rounded-md border bg-bg-floating p-1 transition focus-within:ring-2 ${
                  inviteInputError
                    ? "border-critical/40 focus-within:border-critical/50 focus-within:ring-critical/10"
                    : "border-neutral-1000-a10 focus-within:border-neutral-1000-a20 focus-within:ring-neutral-1000-a05"
                }`}
                onClick={() => inviteInputRef.current?.focus()}
              >
                {inviteEmails.map((email) => {
                  const failedMessage = failedInviteEmails[email];
                  return (
                    <span
                      key={email}
                      className={`inline-flex h-8 max-w-full items-center border pl-3 text-xs rounded-md font-medium ${
                        failedMessage
                          ? "border-critical/25 bg-critical-faded text-critical"
                          : "border-black/5 bg-black/5 text-neutral-primary"
                      }`}
                    >
                      <span className="max-w-[260px] truncate">{email}</span>
                      <button
                        type="button"
                        aria-label={t("OrgAppBar.1237091d", "{p0} 제거", {
                          p0: email,
                        })}
                        disabled={sendInvitations.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeInviteEmail(email);
                        }}
                        className="ml-1 flex h-full items-center rounded-r-md px-2 text-[15px] font-normal leading-none text-black/50 transition hover:bg-neutral-1000-a05 hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
                <input
                  ref={inviteInputRef}
                  id="org-invite-email"
                  aria-invalid={Boolean(inviteInputError)}
                  autoCapitalize="none"
                  autoComplete="off"
                  disabled={sendInvitations.isPending}
                  inputMode="email"
                  onBlur={commitInviteInput}
                  onChange={(event) => {
                    setInviteInput(event.target.value);
                    if (inviteInputError) setInviteInputError("");
                  }}
                  onKeyDown={(event) => {
                    if (
                      (event.key === "Enter" ||
                        event.key === "," ||
                        event.key === ";") &&
                      inviteInput.trim()
                    ) {
                      event.preventDefault();
                      commitInviteInput();
                    } else if (
                      event.key === "Backspace" &&
                      !inviteInput &&
                      inviteEmails.length > 0
                    ) {
                      removeInviteEmail(inviteEmails[inviteEmails.length - 1]);
                    }
                  }}
                  onPaste={pasteInviteEmails}
                  placeholder={
                    inviteEmails.length === 0
                      ? "name@company.com"
                      : t("OrgAppBar.e7cb82f3", "이메일 추가")
                  }
                  spellCheck={false}
                  type="text"
                  value={inviteInput}
                  className="h-7 min-w-[180px] flex-1 bg-transparent px-1 text-[13px] font-normal text-neutral-primary outline-none placeholder:text-neutral-placeholder disabled:cursor-not-allowed"
                />
              </div>

              <button
                type="submit"
                disabled={
                  sendInvitations.isPending ||
                  (inviteEmails.length === 0 && !inviteInput.trim())
                }
                className={`flex flex-1 justify-center items-center bg-neutral-primary ${sendInvitations.isPending ? "min-w-[92px]" : "min-w-[72px]"} text-white px-3 py-2.5 rounded-md text-[13px] font-normal`}
              >
                {sendInvitations.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                {sendInvitations.isPending
                  ? t("OrgAppBar.2d8f3055", "발송 중")
                  : t("OrgAppBar.f477a11b", "초대하기")}
              </button>
            </div>
            {inviteInputError ? (
              <p
                id="org-invite-email-error"
                className="mt-1.5 text-xs text-critical"
              >
                {inviteInputError}
              </p>
            ) : Object.keys(failedInviteEmails).length > 0 ? (
              <p className="mt-1.5 text-xs text-critical">
                {t(
                  "OrgAppBar.959dc6fb",
                  "발송하지 못한 주소가 남아 있습니다. 확인 후 다시 시도해 주세요."
                )}
              </p>
            ) : null}
          </form>

          <div className="pt-6">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-neutral-primary">
                {t("OrgAppBar.993bb22c", "멤버")}
              </div>
              <span className="text-xs text-neutral-soft">
                {invitations.length > 0
                  ? t(
                      members.length === 1
                        ? invitations.length === 1
                          ? "composed.memberAndInviteCountOneOne"
                          : "composed.memberAndInviteCountOneOther"
                        : invitations.length === 1
                          ? "composed.memberAndInviteCountOtherOne"
                          : "composed.memberAndInviteCountOtherOther",
                      "{members}명 · 초대 대기 {invites}명",
                      {
                        members: members.length,
                        invites: invitations.length,
                      }
                    )
                  : t(
                      members.length === 1
                        ? "composed.memberCountOne"
                        : "composed.memberCountOther",
                      "{members}명",
                      { members: members.length }
                    )}
              </span>
            </div>
            <div className="max-h-60 divide-y divide-neutral-1000-a05 overflow-y-auto bg-bg-floating">
              {invitations.map((invitation) => (
                <div
                  key={invitation.invitationId}
                  className="flex items-center gap-3 py-2"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-weak text-xs font-medium text-neutral-muted">
                    {invitation.email.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-neutral-primary">
                      {invitation.email}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-soft">
                      {formatInvitationDate(invitation.lastSentAt, locale)}{" "}
                      {t("OrgAppBar.ba27826d", "발송")}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="rounded-full bg-bg-weak px-2 py-1 text-[11px] font-normal text-neutral-muted">
                      {t("OrgAppBar.764702ec", "수락 대기중")}
                    </span>
                    <BareButton
                      type="button"
                      disabled={sendInvitations.isPending}
                      onClick={() => void resendInvitation(invitation.email)}
                      className="text-xs font-medium text-neutral-muted underline-offset-4 transition hover:text-neutral-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resendingEmail === invitation.email
                        ? t("OrgAppBar.ea4b0124", "보내는 중")
                        : t("OrgAppBar.c0d0890a", "다시 보내기")}
                    </BareButton>
                  </div>
                </div>
              ))}
              {members.map((member) => {
                const name =
                  member.name ||
                  member.email ||
                  t("OrgAppBar.1d1bdecc", "이름 없음");
                const roleLabel =
                  member.userId === currentUser?.userId
                    ? t("OrgAppBar.47e3a0eb", "나")
                    : member.authority === "admin" ||
                        member.authority === "owner"
                      ? t("OrgAppBar.1389dcf6", "관리자")
                      : t("OrgAppBar.993bb22c", "멤버");
                return (
                  <div
                    key={member.userId}
                    className="flex items-center gap-3 py-2"
                  >
                    {member.profilePicture ? (
                      <Image
                        src={member.profilePicture}
                        alt={t("OrgAppBar.c636f3b2", "")}
                        width={28}
                        height={28}
                        unoptimized
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-weak text-xs font-medium text-neutral-muted">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-normal text-neutral-primary">
                        {name}
                      </div>
                      <div className="truncate text-xs text-neutral-muted font-light">
                        {member.email ?? "-"}
                      </div>
                    </div>
                    <div className="text-xs font-normal text-neutral-soft">
                      {roleLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </TalentCareerModal>

      <TalentCareerModal
        open={leaveDialogOpen}
        onClose={() => {
          if (!leaveWorkspace.isPending) setLeaveDialogOpen(false);
        }}
        mobileBottomSheet
        title={<>{t("OrgAppBar.f6a5d0f6", "Organization에서 탈퇴할까요?")}</>}
        description={
          <>
            {workspace.companyName}{" "}
            {t(
              "OrgAppBar.82c00914",
              "Workspace에 더 이상 접근할 수 없습니다. Harper 계정과 다른 Workspace는 그대로 유지됩니다."
            )}
          </>
        }
        panelClassName="max-w-md"
        bodyClassName="space-y-4 px-4 pb-5 sm:px-5"
        showCloseButton={!leaveWorkspace.isPending}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={leaveWorkspace.isPending}
              onClick={() => setLeaveDialogOpen(false)}
              className="font-normal"
            >
              {t("OrgAppBar.ad054ad6", "취소")}
            </Button>
            <Button
              type="button"
              variant="critical"
              disabled={leaveWorkspace.isPending}
              onClick={() => void handleLeaveWorkspace()}
              className="font-normal"
            >
              {leaveWorkspace.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              {leaveWorkspace.isPending
                ? t("OrgAppBar.c52a0574", "탈퇴하는 중")
                : t("OrgAppBar.5eefbd11", "탈퇴하기")}
            </Button>
          </div>
        }
      >
        <></>
      </TalentCareerModal>

      <OrgDocsModal open={docsOpen} onOpenChange={setDocsOpen} />

      <OrgSlackPanel
        onOpenChange={setSlackOpen}
        open={slackOpen}
        returnTo={router.asPath}
        workspace={workspace}
      />
    </>
  );
}
