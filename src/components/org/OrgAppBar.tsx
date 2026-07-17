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
import { useMemo, useState } from "react";
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
import type { OrgMember, OrgWorkspace } from "@/lib/org/server";

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
  const [open, setOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const switchableWorkspaces = canSwitchWorkspace ? workspaces : [];
  const showWorkspaceSwitcher =
    canSwitchWorkspace &&
    switchableWorkspaces.length > 1 &&
    Boolean(onWorkspaceSelect);
  const currentUserName = currentUser?.name || currentUser?.email || "User";
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
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setDocsOpen(true)}
              className="hidden sm:inline-flex"
            >
              <BookOpenText className="h-4 w-4" />
              Docs
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
                <DropdownMenuLabel className="px-3 py-2">
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setOpen(true)}
                  className="sm:hidden"
                >
                  <Users className="h-4 w-4" />
                  Organization
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setDocsOpen(true)}
                  className="sm:hidden"
                >
                  <BookOpenText className="h-4 w-4" />
                  Docs
                </DropdownMenuItem>
                <DropdownMenuSeparator className="sm:hidden" />
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

      <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
        <DialogContent className="max-w-2xl rounded-lg">
          <DialogHeader>
            <DialogTitle>Harper Docs</DialogTitle>
          </DialogHeader>
          <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1 text-sm leading-6 text-neutral-muted">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-primary">
                Harper가 연결을 추천하는 방식
              </h3>
              <p>
                Harper는 회사가 남긴 피드백을 기준으로 다음 연결 제안의 방향을
                조정합니다. 연결 제안된 후보자에 대해 수락, 거절, 메모 등으로
                판단을 남겨주시면 그 이후에 더 맞는 분들을 우선 추천합니다.
              </p>
              <p>
                어떤 경험, 역량, 도메인, 커뮤니케이션 방식, 연봉 범위, 위치,
                합류 가능 시점 때문에 좋거나 아쉬웠는지를 구체적으로 적을수록
                Harper가 그 기준을 다음 추천에 반영하기 쉽습니다.
              </p>
            </section>

            <section className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-primary">
                피드백을 잘 주는 방법
              </h3>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  수락 또는 거절만 누르기보다, 메모에 판단 근거를 함께
                  남겨주세요.
                </li>
                <li>
                  “좋음”, “애매함”보다 “B2B SaaS enterprise sales 경험은 좋지만,
                  초기 스타트업 0-1 경험이 부족함”처럼 기준을 분리해서
                  적어주세요.
                </li>
                <li>
                  현재 가장 중요한 hiring priority가 바뀌면 Role 설정의
                  Request나 Description에 반영해주세요.
                </li>
                <li>
                  후보자에게 회사를 어필하기 좋은 자료, 최근 성과, 팀 문화, 제품
                  방향, 채용 배경도 가능한 한 알려주세요.
                </li>
              </ul>
            </section>

            <section className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-primary">
                수락하면 어떻게 되나요?
              </h3>
              <p>
                후보자를 수락하면 Harper가 연결 의사를 확인하고, 회사가 남긴
                맥락을 바탕으로 후보자에게 역할과 회사를 설명합니다. 후보자가
                관심을 보이면 이후 인터뷰나 커피챗으로 이어질 수 있도록 다음
                액션을 조율합니다.
              </p>
              <p>
                수락 사유나 어필 포인트를 자세히 남겨주면 후보자에게 전달되는
                설명이 더 정확해지고, 이후 추천에서도 비슷한 긍정 기준이
                강화됩니다.
              </p>
            </section>

            <section className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-primary">
                거절하면 어떻게 되나요?
              </h3>
              <p>
                후보자를 거절하면 해당 연결은 종료되며, Harper는 거절 사유를
                다음 추천 기준에 반영합니다. 단순히 “핏 아님”보다 어떤 기준에서
                맞지 않았는지 남겨주시면 같은 이유의 후보가 반복 추천되는 것을
                줄일 수 있습니다.
              </p>
              <p>
                거절 피드백은 후보자에게 그대로 공개되는 메시지가 아니라,
                Harper가 추천 품질을 개선하기 위한 내부 맥락으로 사용됩니다.
              </p>
            </section>

            <section className="mt-6 space-y-3">
              <h3 className="text-sm font-semibold text-neutral-primary">
                회사와 Role 정보를 최신으로 유지해주세요
              </h3>
              <p>
                회사 설명, Role request, JD 링크, 근무 형태, 위치, 고용 형태가
                최신일수록 후보자에게 더 정확하게 어필하고 더 적절한 사람을
                추천할 수 있습니다. 채용 기준이나 우선순위가 바뀌면 바로
                업데이트해주세요.
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
