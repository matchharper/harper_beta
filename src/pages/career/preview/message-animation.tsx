import { ArrowUp } from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useLayoutEffect, useRef, useState } from "react";

import { careerTimelineMessageTextClassName } from "@/components/career/chat/careerTimelineTypography";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { ChatMessageBubbleFrame } from "@/components/chat/ChatTimeline";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

type PreviewMessage = { id: number; text: string };

export default function MessageAnimationPreview() {
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages]);

  function appendMessage(text: string) {
    const message = { id: nextId.current++, text };
    setMessages((current) => [...current, message]);
  }

  function sendDraft() {
    if (!draft.trim()) return;
    appendMessage(draft);
    setDraft("");
    composerRef.current?.focus();
  }

  return (
    <>
      <Head>
        <title>메시지 애니메이션 · Harper Preview</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="flex h-dvh flex-col bg-bg-basement text-neutral-primary">
        <header className="mx-auto flex w-full max-w-[788px] shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-5 md:px-6">
          <div className="space-y-1">
            <Text as="h1" variant="title">
              메시지 애니메이션
            </Text>
            <Text variant="subtle" tone="muted">
              입력한 내용은 이 화면에서만 표시됩니다.
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <MuteButton
              onClick={() => appendMessage("메시지가 이렇게 나타나요.")}
              size="sm"
            >
              예시 보내기
            </MuteButton>
            <MuteButton
              disabled={!messages.length}
              onClick={() => setMessages([])}
              size="sm"
              variant="transparent"
            >
              비우기
            </MuteButton>
          </div>
        </header>
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto">
          <div
            aria-label="미리보기 대화"
            aria-live="polite"
            className="mx-auto flex min-h-full w-full max-w-[788px] flex-col justify-end gap-4 px-4 pb-6 pt-4 md:px-6"
            role="log"
          >
            {messages.map((message) => (
              <ChatMessageBubbleFrame
                key={message.id}
                animateEntrance
                isUser
                typographyClassName={careerTimelineMessageTextClassName}
              >
                <div className="whitespace-pre-wrap break-words">
                  {message.text}
                </div>
              </ChatMessageBubbleFrame>
            ))}
          </div>
        </div>
        <div className="mx-auto w-full max-w-[788px] shrink-0 px-4 pb-[max(20px,env(safe-area-inset-bottom))] md:px-6">
          <ChatComposerFrame
            ref={composerRef}
            aria-label="메시지"
            placeholder="메시지를 입력하세요"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                sendDraft();
              }
            }}
            action={
              <MuteButton
                aria-label="메시지 보내기"
                className="size-8 rounded-full p-0"
                disabled={!draft.trim()}
                onClick={sendDraft}
                variant="dark"
              >
                <ArrowUp aria-hidden="true" className="size-4" />
              </MuteButton>
            }
          />
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === "production" ? { notFound: true } : { props: {} };
