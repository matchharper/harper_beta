import { CompanySidePanelContent } from "./CompanySidePanelContent";
import ReactMarkdown from "react-markdown";
import { convertSlackMrkdwnToWebMarkdown } from "@/lib/org/agent/navigationMarkdown";
import Image from "next/image";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  ChevronRight,
  X,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { CompanyConversationHistory } from "./CompanyConversationHistory";
import { cn } from "@/lib/utils";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { MuteButton } from "@/components/ui/button";
import { useOpsCompanyConversations } from "@/hooks/ops/useOpsCompany";
import { formatOpsCompanyDate } from "@/components/ops/dateUtils";
import {
  slackThreadUrl,
  displaySlackMentions,
  conversationTimeline,
} from "@/lib/ops/companyConversationPresentation";
import type { OpsCompanyThreadSummary } from "@/lib/ops/company";

export function CompanyConversationsTab({
  enabled,
  workspaceId,
}: {
  enabled: boolean;
  workspaceId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const previewQuery = useOpsCompanyConversations({ enabled, workspaceId });
  const previewPage = previewQuery.data?.pages[0];
  const previewNames = useMemo(
    () =>
      new Map(
        (previewPage?.items ?? []).flatMap((item) =>
          item.user.slackUserId && (item.user.name || item.user.email)
            ? [
                [
                  item.user.slackUserId,
                  (item.user.name || item.user.email)!,
                ] as const,
              ]
            : []
        )
      ),
    [previewPage]
  );
  const preview = useMemo(
    () =>
      conversationTimeline(previewPage?.items ?? [], previewPage?.threads ?? [])
        .slice(-3)
        .reverse(),
    [previewPage]
  );
  const [selectedThread, setSelectedThread] =
    useState<OpsCompanyThreadSummary | null>(null);
  const threadTrigger = useRef<HTMLElement | null>(null);
  const selectThread = (thread: OpsCompanyThreadSummary) => {
    threadTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelectedThread(thread);
  };
  useLayoutEffect(() => {
    if (!selectedThread) threadTrigger.current?.focus({ preventScroll: true });
  }, [selectedThread]);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setSelectedThread(null);
      }}
    >
      <section className="min-w-0 rounded-xl border border-neutral-1000-a05 bg-bg-floating p-4">
        <header className="mb-2 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4 text-neutral-muted" />
            최근 대화
          </h2>
          <DialogTrigger asChild>
            <MuteButton
              size="sm"
              variant="transparent"
              aria-label="최근 대화 더보기"
            >
              더보기
              <ChevronRight className="h-3.5 w-3.5" />
            </MuteButton>
          </DialogTrigger>
        </header>
        {previewQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-neutral-muted">
            대화를 불러오는 중입니다.
          </p>
        ) : previewQuery.isError ? (
          <div role="alert" className="py-4 text-sm text-neutral-muted">
            대화를 불러오지 못했습니다.{" "}
            <MuteButton size="sm" onClick={() => void previewQuery.refetch()}>
              다시 시도
            </MuteButton>
          </div>
        ) : !preview.length ? (
          <p className="py-8 text-center text-sm text-neutral-muted">
            기록된 대화가 없습니다.
          </p>
        ) : (
          preview.map(({ key, message, summary }) => {
            const root = summary?.root ?? message;
            const name =
              root.role === "assistant"
                ? "Harper"
                : root.user.name || root.user.email || "팀원";
            return (
              <DialogTrigger key={key} asChild>
                <MuteButton
                  type="button"
                  variant="transparent"
                  aria-label={`${name} ${summary ? "스레드" : "대화"} 보기 · ${formatOpsCompanyDate(message.occurredAt)}`}
                  onClick={() => setSelectedThread(summary)}
                  className="flex h-auto w-full items-start gap-3 whitespace-normal rounded-none px-0 py-3 text-left font-normal text-neutral-primary hover:bg-transparent active:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-800"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs text-neutral-muted">
                    {root.role === "assistant" ? (
                      <Image
                        src="/svgs/face.svg"
                        alt=""
                        width={18}
                        height={18}
                        className="h-[18px] w-[18px]"
                      />
                    ) : (
                      name.slice(0, 1)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium text-neutral-primary">
                        {name}
                      </span>
                      <time
                        dateTime={message.occurredAt}
                        className="shrink-0 text-xs text-neutral-muted"
                      >
                        {formatOpsCompanyDate(message.occurredAt)}
                      </time>
                    </span>
                    <span className="mt-1 line-clamp-2 break-words text-sm leading-5 text-neutral-primary">
                      <ReactMarkdown
                        allowedElements={["strong", "em", "code"]}
                        unwrapDisallowed
                      >
                        {(root.source === "slack"
                          ? convertSlackMrkdwnToWebMarkdown(
                              displaySlackMentions(root.content, previewNames)
                            )
                          : root.content) || "텍스트 내용 없음"}
                      </ReactMarkdown>
                    </span>
                    <span className="mt-1 block truncate text-xs text-neutral-muted">
                      {summary
                        ? `Slack · #${summary.thread.channelName || summary.thread.channelId} · 답글 ${summary.replyCount}개`
                        : message.source === "slack"
                          ? "Slack"
                          : "웹 대화"}
                    </span>
                  </span>
                </MuteButton>
              </DialogTrigger>
            );
          })
        )}
      </section>
      <CompanySidePanelContent
        title="최근 대화"
        onEscapeKeyDown={(event) => {
          if (selectedThread) {
            event.preventDefault();
            setSelectedThread(null);
          }
        }}
        description={
          <span className="sr-only">
            저장된 웹 대화와 Slack 스레드 · 읽기 전용
          </span>
        }
        className={
          selectedThread
            ? "lg:max-w-[min(1200px,calc(100vw-48px))]"
            : "max-w-3xl"
        }
      >
        {open && (
          <div className="flex min-h-0 flex-1">
            <div
              className={cn(
                "min-w-0 flex-1 flex-col",
                selectedThread ? "hidden lg:flex" : "flex"
              )}
            >
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-neutral-1000-a05 px-4 text-xs text-neutral-muted">
                <span className="font-medium text-neutral-primary">
                  전체 대화
                </span>
                <span>저장된 메시지 · 읽기 전용</span>
              </div>
              <CompanyConversationHistory
                key={workspaceId}
                enabled={enabled}
                workspaceId={workspaceId}
                onOpenThread={selectThread}
                selectedThreadId={selectedThread?.thread.id}
              />
            </div>
            {selectedThread && (
              <section
                aria-label="선택한 스레드"
                className="flex min-h-0 w-full flex-col border-neutral-1000-a10 lg:w-[48%] lg:border-l"
              >
                <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <h3
                      tabIndex={-1}
                      ref={(node) => node?.focus({ preventScroll: true })}
                      className="text-sm font-semibold outline-none"
                    >
                      스레드
                    </h3>
                    <span className="truncate text-xs text-neutral-muted">
                      #
                      {selectedThread.thread.channelName ||
                        selectedThread.thread.channelId}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={slackThreadUrl(selectedThread.thread)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Slack에서 스레드 열기"
                      title="Slack에서 열기"
                      className="p-1 text-neutral-muted hover:text-neutral-primary focus-visible:outline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <MuteButton
                      size="sm"
                      variant="transparent"
                      aria-label="스레드 닫기"
                      onClick={() => setSelectedThread(null)}
                    >
                      <X className="hidden h-4 w-4 lg:block" />
                      <ArrowLeft className="h-4 w-4 lg:hidden" />
                    </MuteButton>
                  </div>
                </header>
                <CompanyConversationHistory
                  key={selectedThread.thread.id}
                  enabled={enabled}
                  workspaceId={workspaceId}
                  thread={selectedThread}
                />
              </section>
            )}
          </div>
        )}
      </CompanySidePanelContent>
    </Dialog>
  );
}
