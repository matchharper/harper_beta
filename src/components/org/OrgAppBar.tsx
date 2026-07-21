import Image from "next/image";
import {
  BookOpenText,
  ChevronDown,
  Copy,
  LoaderCircle,
  LogOut,
  Pencil,
  Users,
} from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import { OrgSlackPanel } from "@/components/org/OrgSlackPanel";
import { OrgDocsModal } from "@/components/org/OrgDocsModal";
import { BareButton, Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useOrgSlackStatus } from "@/hooks/org/useOrgSlack";
import type { OrgMember, OrgWorkspace } from "@/lib/org/server";
import { useToastStore } from "@/store/useToastStore";

function WorkspaceLogo({
  size = "md",
  workspace,
}: {
  size?: "md" | "sm";
  workspace: OrgWorkspace;
}) {
  const className = size === "sm" ? "h-6 w-6 rounded-md" : "h-7 w-7 rounded-md";

  if (workspace.logoUrl) {
    const imageSize = size === "sm" ? 24 : 28;
    return (
      <Image
        src={workspace.logoUrl}
        alt=""
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
  members: OrgMember[];
  onEditWorkspace: () => void;
  onSignOut: () => void;
  onWorkspaceSelect?: (workspaceId: string) => void;
  signOutPending?: boolean;
  workspace: OrgWorkspace;
  workspaces?: OrgWorkspace[];
}) {
  const router = useRouter();
  const addToast = useToastStore((state) => state.add);
  const [open, setOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [slackOpen, setSlackOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const handledSlackResult = useRef("");
  const switchableWorkspaces = canSwitchWorkspace ? workspaces : [];
  const showWorkspaceSwitcher =
    canSwitchWorkspace &&
    switchableWorkspaces.length > 1 &&
    Boolean(onWorkspaceSelect);
  const slackStatusQuery = useOrgSlackStatus({
    workspaceId: workspace.workspaceId,
  });
  const currentUserName = currentUser?.name || currentUser?.email || "User";
  const slackStatusText = slackStatusQuery.isLoading
    ? "확인 중"
    : slackStatusQuery.error
      ? "확인 실패"
      : slackStatusQuery.data?.connected
        ? "연결됨"
        : "미연결";
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined")
      return `/org?orgId=${workspace.workspaceId}`;
    return `${window.location.origin}/org?orgId=${workspace.workspaceId}`;
  }, [workspace.workspaceId]);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
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
          ? "Slack 채널을 연결했습니다."
          : message || "Slack 연결을 완료하지 못했습니다.",
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
  }, [addToast, router, router.query.slack, router.query.slackMessage]);

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
            >
              <Pencil className="h-4 w-4" />
              회사
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setOpen(true)}
              className="hidden sm:inline-flex"
            >
              <Users className="h-4 w-4" />
              Organization
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BareButton
                  type="button"
                  aria-label="계정 메뉴"
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
                  Organization
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDocsOpen(true)}>
                  <BookOpenText className="h-4 w-4" />
                  Docs
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setSlackOpen(true)}
                  className="justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Image
                      src="/images/logos/slack.svg"
                      alt="Slack"
                      width={16}
                      height={16}
                    />
                    <span className="truncate">Slack 연결</span>
                  </span>
                  <span className="shrink-0 text-xs text-neutral-soft">
                    {slackStatusText}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  tone="danger"
                  disabled={signOutPending}
                  onSelect={() => onSignOut()}
                >
                  {signOutPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>Organization</DialogTitle>
            <p className="mt-1 text-sm leading-5 text-neutral-muted">
              초대 링크를 공유해 회사 워크스페이스에 함께 참여할 사람을 초대할
              수 있습니다. 인재 연결시 참여한 멤버들에게 안내 메일이 발송됩니다.
            </p>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteUrl} className="h-10" />
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => void copyInvite()}
              >
                <Copy className="h-4 w-4" />
                {copied ? "복사됨" : "초대"}
              </Button>
            </div>
            <div className="divide-y divide-neutral-1000-a05 rounded-md border border-neutral-1000-a05 bg-bg-floating">
              {members.map((member) => {
                const name = member.name || member.email || "이름 없음";
                return (
                  <div
                    key={member.userId}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    {member.profilePicture ? (
                      <Image
                        src={member.profilePicture}
                        alt=""
                        width={32}
                        height={32}
                        unoptimized
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-weak text-xs font-medium text-neutral-muted">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-neutral-primary">
                        {name}
                      </div>
                      <div className="truncate text-xs text-neutral-muted">
                        {member.email ?? "-"}
                      </div>
                    </div>
                    <div className="text-xs text-neutral-soft">
                      {member.role ?? "member"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
