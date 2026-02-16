// components/chat/ChatMessageList.tsx
import React, { useMemo } from "react";
import type {
  ChatMessage,
  CriteriaCardBlock,
  ToolStatusBlock,
  ToolResultBlock,
  FileContextBlock,
  SettingsCtaBlock,
} from "@/types/chat";
import { Loader2 } from "lucide-react";
import { logger } from "@/utils/logger";
import Image from "next/image";
import { LinkChip } from "../information/LinkChips";
import {
  CriteriaCard,
  CriteriaLoading,
  ToolStatusCard,
  ToolStatusToggle,
  DocumentCard,
  FileContextCard,
  SettingsCtaCard,
  SearchResultCard,
  SearchStartCard,
} from "./ChatBoxes";

type Props = {
  messages: ChatMessage[];
  isStreaming: boolean;
  error?: string | null;

  onConfirmCriteriaCard?: (messageId: number) => void;
  onChangeCriteriaCard?: (args: {
    messageId: number;
    modifiedBlock: CriteriaCardBlock;
  }) => void;
};

function ChatMessageList({
  messages,
  isStreaming,
  error,
  onConfirmCriteriaCard,
  onChangeCriteriaCard,
}: Props) {
  const hasActiveToolCall = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last?.segments?.length) return false;
    return last.segments.some(
      (s) =>
        s.type === "block" &&
        (s as any).content?.type === "tool_status" &&
        (s as any).content?.state === "running"
    );
  }, [messages]);

  const doneBySearchStartMessageId = useMemo(() => {
    const doneSet = new Set<string | number>();
    let lastSearchStartMessageId: string | number | null = null;

    for (const m of messages) {
      const segments = m.segments ?? [];

      for (const s of segments) {
        if (s.type === "block" && (s as any).content?.type === "search_start") {
          lastSearchStartMessageId = m.id ?? null;
          continue;
        }

        if (m.role === "assistant" && s.type === "text") {
          const text = (s.content ?? "").trim();
          const isDoneText =
            text.startsWith("[완료]") || text.startsWith("전체");

          if (isDoneText && lastSearchStartMessageId != null) {
            doneSet.add(lastSearchStartMessageId);
            lastSearchStartMessageId = null;
          }
        }
      }
    }

    return doneSet;
  }, [messages]);

  return (
    <div className="flex-1 pr-2 space-y-8">
      {messages.length === 0 && (
        <div className="text-sm text-hgray600">
          검색 요청을 입력하면 대화가 시작됩니다.
        </div>
      )}

      {messages.map((m, idx) => {
        const isUser = m.role === "user";
        const bubbleCls = isUser
          ? "ml-auto border border-white/10 bg-hgray100/70 text-hgray900 py-3 px-4"
          : "bg-white/0 text-hgray800 mt-1";
        const segments = m.segments ?? [];
        const toolSegments = segments
          .filter(
            (s) =>
              s.type === "block" && (s as any).content?.type === "tool_status"
          )
          .map((s) => (s as any).content as ToolStatusBlock);
        const hasMainContent = segments.some(
          (s) =>
            !(s.type === "block" && (s as any).content?.type === "tool_status")
        );
        const showToolToggle = toolSegments.length > 0 && hasMainContent;
        const segmentsToRender = showToolToggle
          ? segments.filter(
              (s) =>
                !(
                  s.type === "block" &&
                  (s as any).content?.type === "tool_status"
                )
            )
          : segments;

        return (
          <div className="flex flex-col gap-1" key={`${m.role}-${idx}`}>
            <div
              className={`text-xs text-ngray600 ${
                isUser ? "text-right" : "text-left"
              }`}
            >
              {isUser ? (
                "me"
              ) : (
                <div className="flex flex-row items-center justify-start gap-1.5">
                  <span className="text-xs text-ngray600">
                    {/* <Bolt className="w-3 h-3" /> */}
                    <Image
                      src="/svgs/logo.svg"
                      alt="Harper"
                      width={9}
                      height={9}
                      className="text-hgray600"
                    />
                  </span>
                  <span>Harper</span>
                </div>
              )}
            </div>
            <div
              className={`max-w-[98%] rounded-3xl text-sm leading-relaxed ${bubbleCls}`}
            >
              <div className="whitespace-pre-wrap break-words flex flex-row flex-wrap gap-1">
                {showToolToggle && <ToolStatusToggle items={toolSegments} />}
                {segmentsToRender.map((s, si) => {
                  if (s.type === "text") {
                    return (
                      <div
                        key={`text-${idx}-${si}`}
                        className="whitespace-pre-wrap break-words"
                      >
                        <div
                          dangerouslySetInnerHTML={{
                            __html: s.content
                              .replace(/<br\s*\/?>/g, "\n")
                              .replace(/\*\*/g, "")
                              .replace(/#/g, ""),
                          }}
                        ></div>
                        {/* {s.content.replace(/<br\s*\/?>/g, "\n")} */}

                        {!isUser &&
                          isStreaming &&
                          idx === messages.length - 1 &&
                          si == (m.segments?.length ?? 0) - 1 && (
                            <span className="inline-block w-2 ml-1 align-baseline animate-pulse">
                              ▍
                            </span>
                          )}
                      </div>
                    );
                  }
                  if (s.type === "block") {
                    if (s.content.type === "link") {
                      return (
                        <LinkChip
                          raw={s.content.href}
                          size="md"
                          key={`block-${idx}-${si}`}
                        />
                      );
                    }
                    if (s.content.type === "criteria_card") {
                      return (
                        <CriteriaCard
                          key={`block-${idx}-${si}`}
                          block={s.content as CriteriaCardBlock}
                          onChange={(modifiedBlock) => {
                            onChangeCriteriaCard?.({
                              messageId: m.id as number,
                              modifiedBlock,
                            });
                            logger.log("onChangeCriteriaCard", modifiedBlock);
                          }}
                          onConfirm={() =>
                            onConfirmCriteriaCard?.(Number(m.id))
                          }
                          disabled={false}
                        />
                      );
                    }
                    if (s.content.type === "criteria_loading") {
                      return <CriteriaLoading key={`block-${idx}-${si}`} />;
                    }
                    if (s.content.type === "tool_status") {
                      return (
                        <ToolStatusCard
                          key={`block-${idx}-${si}`}
                          {...(s.content as ToolStatusBlock)}
                        />
                      );
                    }
                    if (s.content.type === "tool_result") {
                      const block = s.content as ToolResultBlock;

                      return (
                        <DocumentCard
                          key={`block-${idx}-${si}`}
                          title={block.title}
                          url={block.url}
                          excerpt={block.excerpt}
                          label="읽어온 웹사이트"
                        />
                      );
                    }
                    if (s.content.type === "file_context") {
                      return (
                        <FileContextCard
                          key={`block-${idx}-${si}`}
                          block={s.content as FileContextBlock}
                        />
                      );
                    }
                    if (s.content.type === "settings_cta") {
                      return (
                        <SettingsCtaCard
                          key={`block-${idx}-${si}`}
                          block={s.content as SettingsCtaBlock}
                        />
                      );
                    }
                    if (s.content.type === "search_result") {
                      return (
                        <SearchResultCard
                          text={s.content.text}
                          runId={s.content.run_id}
                          key={`block-${idx}-${si}`}
                        />
                      );
                    }
                    if (s.content.type === "search_start") {
                      const runId = s.content.run_id as string | undefined;
                      const isDone =
                        m.id != null && doneBySearchStartMessageId.has(m.id);

                      return (
                        <SearchStartCard
                          text={s.content.text}
                          runId={runId}
                          isDone={isDone}
                          key={`block-${idx}-${si}`}
                        />
                      );
                    }
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        );
      })}

      {isStreaming && !hasActiveToolCall && (
        <div className="text-xs text-hgray600 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          응답 작성 중...
        </div>
      )}

      {error && <div className="text-xs text-red-400">{error}</div>}
    </div>
  );
}

export default React.memo(ChatMessageList);
