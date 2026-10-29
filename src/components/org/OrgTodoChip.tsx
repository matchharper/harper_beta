import * as Popover from "@radix-ui/react-popover";
import {
  Bell,
  Check,
  Circle,
  CircleDashed,
  Clock,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  useDecideOrgTodoSuggestion,
  useMarkOrgTodoRead,
  useOrgRoleTodo,
} from "@/hooks/org/useOrgRoleTodo";
import {
  orgHomeActivityTitle,
  type OrgHomeActivityKind,
} from "@/lib/org/homeActivity";
import { buildOrgHref } from "@/lib/org/routes";
import {
  orgTodoBadge,
  type OrgTodoColumn,
  type OrgTodoItem,
} from "@/lib/org/todo";
import { cn } from "@/lib/utils";
import styles from "./OrgTodoChip.module.css";

type Copy = (
  ko: string,
  en: string,
  values?: Record<string, string | number>
) => string;

function itemText(item: OrgTodoItem, c: Copy, locale: "ko" | "en") {
  const name = item.talent?.name || c("후보자", "Candidate");
  const n = item.count ?? 0;
  if (item.id.startsWith("activity:") && item.detail) {
    return orgHomeActivityTitle(
      { kind: item.detail as OrgHomeActivityKind, talentName: name },
      locale
    );
  }
  const request =
    item.detail === "resume"
      ? c("이력서 요청", "resume request")
      : item.detail === "question"
        ? c("질문", "question")
        : c("연락", "message");
  switch (item.kind) {
    case "pending_connection":
      return c("연결 수락할 후보 {n}명", "{n} ready to connect", { n });
    case "company_intro":
      return c("연결 제안할 후보 {n}명", "{n} suggested candidates", { n });
    case "contact_draft":
      return c(
        "{name}님에게 보낼 {request} 확인",
        "Review the {request} to {name}",
        { name, request }
      );
    case "contact_failed":
      return c(
        "{name}님에게 {request}을 보내지 못했어요",
        "Couldn't send the {request} to {name}",
        { name, request }
      );
    case "role_start":
      return item.detail === "review"
        ? c("Brief 확정하기", "Confirm the Brief")
        : item.detail === "evaluating"
          ? c("첫 3명 평가하기", "Rate the first three")
          : c("역할 시작 질문에 답하기", "Answer the role questions");
    case "memory_proposal":
      return c("하퍼가 바꿀 내용 확인", "Confirm Harper's change");
    case "interview_missing":
      return c(
        "{name}님 면접 일정이 아직 없어요",
        "No interview scheduled with {name} yet",
        { name }
      );
    case "intro_waiting":
      return item.detail === "preparing"
        ? c(
            "{name}님에게 보낼 제안 준비 중",
            "Preparing the intro request to {name}",
            { name }
          )
        : c("{name}님 답 기다리는 중", "Waiting for {name}'s reply", {
            name,
          });
    case "request_sending":
      return c(
        "{name}님에게 {request} 보내는 중",
        "Sending the {request} to {name}",
        { name, request }
      );
    case "request_waiting":
      return c(
        "{name}님 {request} 답 기다리는 중",
        "Waiting for {name}'s reply to your {request}",
        { name, request }
      );
    case "request_answered":
      return c(
        "{name}님 {request} 답 전달 준비 중",
        "Preparing {name}'s reply to your {request}",
        { name, request }
      );
    case "intro_declined":
      return c("{name}님이 Intro를 거절했어요", "{name} declined your intro", {
        name,
      });
    case "meeting_waiting":
      return c(
        "{name}님 인터뷰 시간 선택 기다리는 중",
        "Waiting for {name} to pick an interview time",
        { name }
      );
    case "search_running":
      return c("후보 찾는 중", "Searching for candidates");
    case "scheduled_search":
      return c("다음 정기 후보 검색", "Next scheduled candidate search");
    case "role_start_working":
      return item.detail === "searching" || item.detail === "batch"
        ? c("첫 후보 찾는 중", "Finding the first candidates")
        : c("역할 시작 준비 중", "Preparing the role");
    case "meeting_soon":
      return c("{name}님 인터뷰", "Interview with {name}", { name });
    case "followup_sent":
      return c("{name}님에게 팔로업을 보냈어요", "Followed up with {name}", {
        name,
      });
    case "brief_changed":
      return item.detail
        ? c("Brief 변경: {p0}", "Brief changed: {p0}", { p0: item.detail })
        : c("Brief를 바꿨어요", "Brief changed");
    case "suggestion":
    case "suggestion_running":
    case "suggestion_done":
      return item.detail ?? "";
    // The count is people added to 연결 제안할 후보 for this Role. Intros
    // Harper sends to candidates directly are counted per run, not per Role,
    // so they are not in it and "none" is never claimed.
    case "search_done":
      return n
        ? c(
            "후보 검색 · 연결 제안할 후보 {n}명 추가",
            "Candidate search · {n} added to Suggested candidates",
            { n }
          )
        : c("후보 검색을 마쳤어요", "Candidate search finished");
    default:
      return name;
  }
}

function itemHref(item: OrgTodoItem, roleId: string, workspaceId: string) {
  if (item.kind === "pending_connection" || item.kind === "company_intro") {
    return buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "inbox",
      inboxStage: item.kind,
    });
  }
  if (item.kind === "role_start" || item.kind === "role_start_working") {
    return buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "start",
    });
  }
  if (item.kind === "brief_changed") {
    return buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "matching",
    });
  }
  if (item.talent && item.kind !== "suggestion") {
    return buildOrgHref({
      orgId: workspaceId,
      page: "role",
      roleId,
      tab: "pipeline",
      detail: {
        recommendationId: item.talent.recommendationId,
        roleId,
        talentId: item.talent.id,
        workspaceId,
      },
    });
  }
  return null;
}

/** The sections shown above the Role chat. */
export const ORG_TODO_CHIP_COLUMNS: OrgTodoColumn[] = [
  "my_turn",
  "notice",
  "suggestion",
  "in_progress",
];

const COLUMN_ICON: Record<OrgTodoColumn, LucideIcon> = {
  done: Check,
  in_progress: Clock,
  my_turn: Circle,
  notice: Bell,
  suggestion: CircleDashed,
};

/** A request the team can always ask Harper for, listed with its suggestions. */
export type OrgTodoShortcut = {
  actionLabel: string;
  busy?: boolean;
  busyLabel?: string;
  id: string;
  onRun: () => void;
  title: string;
};

/** Pipeline summary and Run Search, worded as things Harper offers to do. */
export function useOrgTodoShortcuts(args: {
  onRunSearch: () => void;
  onSend: (message: string) => void;
  searching: boolean;
}): OrgTodoShortcut[] {
  const { c } = useOrgLocale();
  return [
    {
      actionLabel: c("요약 받기", "Summarize"),
      id: "pipeline_summary",
      onRun: () =>
        args.onSend(
          c(
            "현재 연결된 후보자 파이프라인을 요약해서 설명해줘",
            "Summarize the current candidate pipeline for this role."
          )
        ),
      title: c("파이프라인을 요약해 드릴까요?", "Summarize the pipeline?"),
    },
    {
      actionLabel: c("찾아 주세요", "Search"),
      busy: args.searching,
      busyLabel: c("찾는 중", "Searching"),
      id: "run_search",
      onRun: args.onRunSearch,
      title: c(
        "지금 목록에 없는 후보를 더 찾아볼까요?",
        "Find candidates not on the list yet?"
      ),
    },
  ];
}

function TodoRow({
  action,
  detail,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  detail?: ReactNode;
  icon: LucideIcon;
  title: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-neutral-1000-a05 px-4 py-3 last:border-b-0">
      <Icon
        aria-hidden
        className="size-5 shrink-0 text-neutral-soft"
        strokeWidth={1.4}
      />
      <div className="min-w-0 flex-1">
        <div className="break-keep text-[14px] leading-5 text-neutral-primary">
          {title}
        </div>
        {detail ? (
          <div className="mt-0.5 break-keep text-[12px] leading-4 text-neutral-muted">
            {detail}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-1.5">{action}</div>
      ) : null}
    </li>
  );
}

/**
 * The To-do sections for one Role: one line per thing with the button that
 * does it, and no second line of detail.
 */
export function OrgTodoList({
  columns,
  onApprove,
  onNavigate,
  range,
  roleId,
  shortcuts = [],
  workspaceId,
}: {
  columns: OrgTodoColumn[];
  /** Sends the approved plan to the Role chat as the team's message. */
  onApprove: (message: string) => void;
  onNavigate?: () => void;
  range: "all" | "recent";
  roleId: string;
  shortcuts?: OrgTodoShortcut[];
  workspaceId: string;
}) {
  const { c, locale } = useOrgLocale();
  const todo = useOrgRoleTodo({ range, roleId, workspaceId });
  const decide = useDecideOrgTodoSuggestion({ roleId, workspaceId });
  const markRead = useMarkOrgTodoRead({ roleId, workspaceId });
  const items = todo.data?.items ?? [];
  const suggestions = todo.data?.suggestions ?? 0;
  const headings: Record<OrgTodoColumn, string> = {
    done: c("한 일", "Done"),
    in_progress: c("진행 중인 일", "In progress"),
    my_turn: c("할 일", "To do"),
    notice: c("알림", "Updates"),
    suggestion: c("하퍼의 제안", "Harper's suggestions"),
  };
  const answer = (
    item: OrgTodoItem,
    decision: "approve" | "dismiss" | "mute"
  ) => {
    if (!item.suggestionId || decide.isPending) return;
    decide.mutate(
      { decision, suggestionId: item.suggestionId },
      {
        onSuccess: (result) => {
          if (decision !== "approve") return;
          onNavigate?.();
          onApprove(
            c(
              "제안대로 진행해 주세요: {p0}\n{p1}",
              "Please go ahead with your suggestion: {p0}\n{p1}",
              { p0: result.title, p1: result.plan }
            )
          );
        },
      }
    );
  };
  // The one button a row needs, worded as what it does.
  const action = (item: OrgTodoItem) => {
    if (item.kind === "suggestion") {
      return (
        <>
          <MuteButton
            disabled={decide.isPending}
            onClick={() => answer(item, "dismiss")}
            size="sm"
            type="button"
            variant="dark"
          >
            {c("괜찮아요", "Not now")}
          </MuteButton>
          <MuteButton
            disabled={decide.isPending}
            onClick={() => answer(item, "approve")}
            size="sm"
            type="button"
            variant="dark"
          >
            {c("진행하기", "Go ahead")}
          </MuteButton>
        </>
      );
    }
    if (item.kind === "memory_proposal") {
      return (
        <MuteButton
          onClick={() => onNavigate?.()}
          size="sm"
          type="button"
          variant="dark"
        >
          {c("채팅에서 답하기", "Answer in chat")}
        </MuteButton>
      );
    }
    const href = itemHref(item, roleId, workspaceId);
    if (!href) {
      return item.column === "notice" ? (
        <MuteButton
          onClick={() => markRead.mutate(item.id)}
          size="sm"
          type="button"
          variant="dark"
        >
          {c("읽음", "Mark read")}
        </MuteButton>
      ) : null;
    }
    const labels: Partial<Record<OrgTodoItem["kind"], string>> = {
      company_intro: c("검토하기", "Review"),
      contact_draft: c("확인하기", "Review"),
      contact_failed: c("확인하기", "Review"),
      interview_missing: c("일정 잡기", "Schedule"),
      pending_connection: c("결정하기", "Decide"),
      role_start: c("이어 하기", "Continue"),
    };
    const label = labels[item.kind] ?? c("보기", "View");
    const view = (
      <MuteButton asChild size="sm" variant="dark">
        <Link href={href} onClick={() => onNavigate?.()} shallow>
          {label}
        </Link>
      </MuteButton>
    );
    if (item.column !== "notice") return view;
    return (
      <>
        {view}
        <MuteButton
          onClick={() => markRead.mutate(item.id)}
          size="sm"
          type="button"
          variant="dark"
        >
          {c("읽음", "Mark read")}
        </MuteButton>
      </>
    );
  };

  if (todo.isLoading) {
    return (
      <p className="px-4 py-4 text-[13px] text-neutral-muted">
        {c("불러오는 중", "Loading")}
      </p>
    );
  }
  if (todo.isError) {
    return (
      <p className="px-4 py-4 text-[13px] text-neutral-muted">
        {c("To-do를 불러오지 못했어요.", "Couldn't load the To-do.")}{" "}
        <button
          className="underline"
          onClick={() => void todo.refetch()}
          type="button"
        >
          {c("다시 시도", "Retry")}
        </button>
      </p>
    );
  }
  return (
    <>
      {decide.isError ? (
        <p className="px-4 pt-3 text-[12px] text-critical">
          {c(
            "제안에 답하지 못했어요. 다시 눌러 주세요.",
            "Couldn't answer the suggestion. Try again."
          )}
        </p>
      ) : null}
      {columns.map((column) => {
        const group = items.filter((item) => item.column === column);
        const extra = column === "suggestion" ? shortcuts : [];
        // Harper's suggestions plus the requests it always offers.
        const count =
          column === "suggestion" ? suggestions + extra.length : group.length;
        // 할 일 and 알림 make up the To-do number: blue like it when above 0.
        const counted =
          (column === "my_turn" || column === "notice") && count > 0;
        return (
          <section key={column}>
            <h3 className="sticky top-0 z-10 flex items-center gap-1 bg-bg-floating px-4 pb-1 pt-3 text-[12px] text-neutral-muted">
              {headings[column]}
              {counted ? (
                <Badge
                  className="h-4 bg-action px-[5px] py-0 text-white tabular-nums font-normal text-[11px] leading-none"
                  size="sm"
                >
                  {String(count)}
                </Badge>
              ) : (
                <span>{count}</span>
              )}
            </h3>
            <ul>
              {group.map((item) => (
                <TodoRow
                  action={action(item)}
                  detail={
                    // The one control a suggestion keeps under its title.
                    item.kind === "suggestion" ? (
                      <button
                        className="underline-offset-2 hover:underline"
                        disabled={decide.isPending}
                        onClick={() => answer(item, "mute")}
                        type="button"
                      >
                        {c("이런 제안 그만", "Stop suggesting this")}
                      </button>
                    ) : undefined
                  }
                  icon={COLUMN_ICON[column]}
                  key={item.id}
                  title={itemText(item, c, locale)}
                />
              ))}
              {extra.map((shortcut) => (
                <TodoRow
                  action={
                    <MuteButton
                      aria-busy={shortcut.busy || undefined}
                      disabled={shortcut.busy}
                      onClick={() => {
                        onNavigate?.();
                        shortcut.onRun();
                      }}
                      size="sm"
                      type="button"
                      variant="dark"
                    >
                      {shortcut.busy
                        ? shortcut.busyLabel
                        : shortcut.actionLabel}
                    </MuteButton>
                  }
                  icon={COLUMN_ICON.suggestion}
                  key={shortcut.id}
                  title={shortcut.title}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/**
 * The To-do above the Role chat. The anchor wraps the chip row and the chat
 * input, so the list opens above them as wide as the chat.
 */
export function OrgTodoArea({
  children,
  onApprove,
  roleId,
  shortcuts,
  workspaceId,
}: {
  /** The chat input, below the chip. */
  children: ReactNode;
  onApprove: (message: string) => void;
  roleId: string;
  shortcuts: OrgTodoShortcut[];
  workspaceId: string;
}) {
  const { c } = useOrgLocale();
  const [open, setOpen] = useState(false);
  const todo = useOrgRoleTodo({ range: "recent", roleId, workspaceId });
  const badge = orgTodoBadge(todo.data?.items ?? []);
  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Anchor asChild>
        <div>
          <div className="mx-auto flex w-full max-w-[1120px] flex-wrap gap-2 px-4 pt-2 md:mb-1 md:px-5 md:pt-0">
            <Popover.Trigger asChild>
              <MuteButton
                aria-label={c(
                  "To-do, 할 일과 알림 {n}개",
                  "To-do, {n} to do or new",
                  { n: badge }
                )}
                className={cn(
                  "border-white bg-white text-black shadow-sm hover:border-white hover:bg-white/90 active:border-white active:bg-white/80",
                  // Something to do or an unread update: glow until opened.
                  badge > 0 && !open && styles.glow
                )}
                size="sm"
                type="button"
                variant="default"
              >
                <ListTodo aria-hidden className="h-3.5 w-3.5" />
                To-do
                {badge ? (
                  // Same badge as the 인박스 tab.
                  <Badge
                    className="h-4 bg-action px-[5px] py-0 text-white tabular-nums font-normal text-[11px] leading-none"
                    size="sm"
                  >
                    {String(badge)}
                  </Badge>
                ) : null}
              </MuteButton>
            </Popover.Trigger>
          </div>
          {children}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="center"
          aria-label="To-do"
          className="z-[100] w-[var(--radix-popover-trigger-width)] px-4 outline-none md:px-5"
          side="top"
          sideOffset={6}
        >
          <div className="mx-auto max-h-[min(60svh,560px)] max-w-[1120px] overflow-y-auto rounded-xl border border-neutral-1000-a10 bg-bg-floating pb-1 shadow-lg">
            <OrgTodoList
              columns={ORG_TODO_CHIP_COLUMNS}
              onApprove={onApprove}
              onNavigate={() => setOpen(false)}
              range="recent"
              roleId={roleId}
              shortcuts={shortcuts}
              workspaceId={workspaceId}
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
