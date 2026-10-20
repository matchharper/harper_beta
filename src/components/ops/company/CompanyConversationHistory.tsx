import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, LoaderCircle, MessageSquare } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOpsCompanyConversations } from "@/hooks/ops/useOpsCompany";
import { formatOpsCompanyDate } from "@/components/ops/dateUtils";
import {
  chronologicalMessages,
  conversationTimeline,
  conversationMessageTime,
  conversationScope,
  continuesConversationMessage,
} from "@/lib/ops/companyConversationPresentation";
import type { OpsCompanyThreadSummary } from "@/lib/ops/company";
import { cn } from "@/lib/utils";
import {
  CompanyConversationMessage as Message,
  ConversationDateDivider as DateDivider,
  conversationDay as messageDay,
} from "./CompanyConversationMessage";

export function CompanyConversationHistory({
  enabled,
  workspaceId,
  thread,
  onOpenThread,
  selectedThreadId,
}: {
  enabled: boolean;
  workspaceId: string | null;
  thread?: OpsCompanyThreadSummary;
  onOpenThread?: (thread: OpsCompanyThreadSummary) => void;
  selectedThreadId?: string;
}) {
  const query = useOpsCompanyConversations({
    enabled,
    workspaceId,
    threadId: thread?.thread.id,
  });
  const scroll = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const anchor = useRef<{
    key?: string;
    offset: number;
    height: number;
    top: number;
  } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const items = useMemo(
    () =>
      chronologicalMessages(query.data?.pages.flatMap((p) => p.items) ?? []),
    [query.data]
  );
  const summaries = useMemo(() => {
    const result = new Map<string, OpsCompanyThreadSummary>();
    for (const page of query.data?.pages ?? [])
      for (const summary of page.threads ?? [])
        if (!result.has(summary.thread.id))
          result.set(summary.thread.id, summary);
    return [...result.values()];
  }, [query.data]);
  const currentThread = thread
    ? (summaries.find((item) => item.thread.id === thread.thread.id) ?? thread)
    : null;
  const names = useMemo(() => {
    const result = new Map<string, string>();
    for (const item of [
      ...items,
      ...summaries.flatMap((summary) => (summary.root ? [summary.root] : [])),
    ])
      if (item.user.slackUserId && (item.user.name || item.user.email))
        result.set(item.user.slackUserId, item.user.name || item.user.email!);
    return result;
  }, [items, summaries]);
  const timeline = useMemo(
    () => conversationTimeline(items, summaries, "message"),
    [items, summaries]
  );
  const allowResizeRestore = useRef(true);
  const selectionAnchor = useRef<{ key: string; offset: number } | null>(null);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    anchor.current = null;
    allowResizeRestore.current = true;
    const restore = selectionAnchor.current;
    let width = -1;
    // Opening the thread changes both the drawer and column widths. Restore
    // against the actual column size, including the final layout after animation.
    const observer = new ResizeObserver(() => {
      if (width === el.clientWidth) return;
      width = el.clientWidth;
      if (!allowResizeRestore.current) return;
      const key = selectedThreadId
        ? `thread:${selectedThreadId}`
        : restore?.key;
      const row = Array.from(
        el.querySelectorAll<HTMLElement>("[data-message-key]")
      ).find((row) => row.dataset.messageKey === key);
      if (row) {
        const offset = selectedThreadId ? 0 : (restore?.offset ?? 0);
        el.scrollTop +=
          row.getBoundingClientRect().top -
          el.getBoundingClientRect().top -
          offset;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedThreadId]);
  const replies = currentThread
    ? items.filter((item) => item.slackThread?.isRoot !== true)
    : [];

  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el || !items.length) return;
    if (!initialized.current) {
      el.scrollTop = el.scrollHeight;
      initialized.current = true;
    } else if (anchor.current) {
      const saved = anchor.current;
      const row = Array.from(
        el.querySelectorAll<HTMLElement>("[data-message-key]")
      ).find((row) => row.dataset.messageKey === saved.key);
      el.scrollTop = row
        ? el.scrollTop +
          row.getBoundingClientRect().top -
          el.getBoundingClientRect().top -
          saved.offset
        : saved.top + el.scrollHeight - saved.height;
      anchor.current = null;
    }
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, [items]);

  const loadOlder = () => {
    const el = scroll.current;
    if (
      !el ||
      !query.hasNextPage ||
      query.isFetchingNextPage ||
      query.isFetchNextPageError
    )
      return;
    const top = el.getBoundingClientRect().top;
    const row = Array.from(
      el.querySelectorAll<HTMLElement>("[data-message-key]")
    ).find((row) => row.getBoundingClientRect().bottom > top);
    anchor.current = {
      key: row?.dataset.messageKey,
      offset: (row?.getBoundingClientRect().top ?? top) - top,
      height: el.scrollHeight,
      top: el.scrollTop,
    };
    void query.fetchNextPage();
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroll}
        role="region"
        aria-label={thread ? "스레드 메시지" : "전체 대화 메시지"}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 pt-2 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-1000-a10 [overflow-anchor:none]"
        onWheel={() => {
          allowResizeRestore.current = false;
        }}
        onKeyDown={() => {
          allowResizeRestore.current = false;
        }}
        onScroll={(event) => {
          const el = event.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          if (el.scrollTop < 100) loadOlder();
        }}
      >
        {query.isLoading && (
          <p role="status" className="px-4 py-4 text-sm text-neutral-muted">
            대화를 불러오는 중입니다.
          </p>
        )}
        {query.isError && (
          <div role="alert" className="px-4 py-3 text-sm">
            대화를 불러오지 못했습니다.{" "}
            <MuteButton
              onClick={() =>
                void (query.isFetchNextPageError
                  ? query.fetchNextPage()
                  : query.refetch())
              }
            >
              다시 시도
            </MuteButton>
          </div>
        )}
        {currentThread && (
          <>
            {currentThread.root ? (
              <div data-message-key={`root:${currentThread.thread.id}`}>
                <DateDivider day={messageDay(currentThread.root)} />
                <Message item={currentThread.root} names={names} />
              </div>
            ) : (
              <p className="px-4 py-3 text-sm text-neutral-muted">
                이 스레드의 시작 메시지는 저장되어 있지 않습니다.
              </p>
            )}
            <div className="mx-4 mb-2 mt-5 flex items-center gap-3 text-xs text-neutral-muted">
              <span className="shrink-0">
                답글 {currentThread.replyCount}개
              </span>
              <span className="h-px flex-1 bg-neutral-1000-a10" />
            </div>
          </>
        )}
        {query.hasNextPage && (
          <div className="flex justify-center py-2">
            <MuteButton
              size="sm"
              variant="transparent"
              disabled={query.isFetchingNextPage}
              onClick={loadOlder}
            >
              {query.isFetchingNextPage ? (
                <>
                  <LoaderCircle className="h-3 w-3 animate-spin" /> 불러오는 중
                </>
              ) : thread ? (
                "이전 답글 보기"
              ) : (
                "이전 대화 보기"
              )}
            </MuteButton>
          </div>
        )}
        {!query.isLoading &&
          !query.isError &&
          !items.length &&
          !currentThread?.root && (
            <p className="px-4 py-8 text-center text-sm text-neutral-muted">
              기록된 대화가 없습니다.
            </p>
          )}
        {currentThread
          ? replies.map((item, index) => {
              const previous = replies[index - 1];
              const day = messageDay(item);
              return (
                <div
                  key={item.messageId}
                  data-message-key={`message:${item.messageId}`}
                >
                  {((previous && day !== messageDay(previous)) ||
                    (!previous &&
                      currentThread.root &&
                      day !== messageDay(currentThread.root))) && (
                    <DateDivider day={day} />
                  )}
                  <Message
                    item={item}
                    compact={continuesConversationMessage(previous, item)}
                    names={names}
                  />
                </div>
              );
            })
          : timeline.map(({ key, message, summary }, index) => {
              const root = summary?.root ?? message;
              const previousEntry = timeline[index - 1];
              const previous =
                previousEntry &&
                (previousEntry.summary?.root ?? previousEntry.message);
              const newDay =
                !previous || messageDay(root) !== messageDay(previous);
              const newScope =
                !previous ||
                conversationScope(root) !== conversationScope(previous);
              const selected = Boolean(
                summary && summary.thread.id === selectedThreadId
              );
              return (
                <Fragment key={key}>
                  {newDay && <DateDivider day={messageDay(root)} />}
                  {newScope && (
                    <p className="px-4 pb-1 pt-2 text-xs font-medium text-neutral-muted">
                      {root.slackThread
                        ? `# ${root.slackThread.channelName || root.slackThread.channelId}`
                        : root.source === "slack"
                          ? "Slack"
                          : "웹 대화"}
                    </p>
                  )}
                  <div
                    data-message-key={key}
                    className={cn(
                      "border-l-2 border-transparent pb-1",
                      selected && "border-neutral-800 bg-bg-weak"
                    )}
                  >
                    {summary && !summary.root ? (
                      <p className="px-4 py-2 text-sm text-neutral-muted">
                        시작 메시지가 저장되지 않은 스레드
                      </p>
                    ) : (
                      <Message
                        item={root}
                        names={names}
                        compact={
                          !selected &&
                          !newDay &&
                          !newScope &&
                          !previousEntry?.summary?.replyCount &&
                          continuesConversationMessage(previous, root)
                        }
                      />
                    )}
                    {summary && summary.replyCount > 0 && (
                      <div className="ml-12 mr-4 flex flex-wrap items-center gap-x-2 pb-1">
                        <MuteButton
                          size="sm"
                          variant="transparent"
                          aria-pressed={selected}
                          aria-label={`답글 ${summary.replyCount}개 · 스레드 보기`}
                          onClick={() => {
                            const el = scroll.current;
                            const row =
                              el &&
                              Array.from(
                                el.querySelectorAll<HTMLElement>(
                                  "[data-message-key]"
                                )
                              ).find((row) => row.dataset.messageKey === key);
                            if (el && row)
                              selectionAnchor.current = {
                                key,
                                offset:
                                  row.getBoundingClientRect().top -
                                  el.getBoundingClientRect().top,
                              };
                            onOpenThread?.(summary);
                          }}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span className="font-medium text-link">
                            답글 {summary.replyCount}개
                          </span>
                          <span className="text-neutral-muted">
                            {selected ? "보는 중" : "스레드 보기"}
                          </span>
                        </MuteButton>
                        <span className="text-xs text-neutral-muted">
                          마지막 답글{" "}
                          {formatOpsCompanyDate(
                            new Date(
                              conversationMessageTime(message)
                            ).toISOString()
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
      </div>
      {!atBottom && (
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center">
          <MuteButton
            size="sm"
            className="pointer-events-auto shadow-sm"
            onClick={() => {
              const el = scroll.current;
              if (el) {
                allowResizeRestore.current = false;
                el.scrollTop = el.scrollHeight;
                setAtBottom(true);
              }
            }}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            최신 메시지로
          </MuteButton>
        </div>
      )}
    </div>
  );
}
