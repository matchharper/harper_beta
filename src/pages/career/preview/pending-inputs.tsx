// career-i18n-skip-file: Local-only preview with synthetic data.
import type { GetServerSideProps } from "next";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
import { CareerChatPanelProvider, type CareerChatPanelContextValue } from "@/components/career/CareerChatPanelContext";
import { TimelineMessageList } from "@/components/career/chat/CareerTimelineSection";
import type { CareerMessage } from "@/components/career/types";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { MuteButton } from "@/components/ui/button";
import { createCareerTurnProjection, projectCareerInputDelivery } from "@/hooks/career/careerTurnProjection";
import { CareerOpenFormsSnapshotContext } from "@/hooks/career/useCareerOpenForms";
import { MessagesProvider } from "@/i18n/useMessage";

const startedAt = "2026-11-08T03:00:00.000Z";
const initialMessages: CareerMessage[] = [
  { id: 1, role: "user", content: "추천할 만한 회사를 찾아줘", messageType: "chat", createdAt: startedAt },
  { id: 2, role: "assistant", content: "", messageType: "career_turn_activity", createdAt: startedAt,
    workReplyId: "invocation:preview", workStartedAt: startedAt, workPending: true,
    workEvents: [{ id: "tool:search", kind: "tool", text: "회사 정보를 확인하고 있어요", createdAt: startedAt }] },
];

export default function PendingInputsPreview() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { enabled: false } } }));
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<CareerMessage[]>([]);
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [text, setText] = useState("");
  const project = createCareerTurnProjection();
  const snapshot = { completionCursor: null, forms: [], pending: busy ? 1 : 0, latestMessageId: messages.length,
    pendingInputMessageIds: pendingIds, activeInvocationIds: busy ? ["preview"] : [] };
  const rows = project(projectCareerInputDelivery(messages, snapshot), snapshot);
  return <MessagesProvider locale="ko" persistPreference={false}>
    <QueryClientProvider client={client}>
      <CareerOpenFormsSnapshotContext.Provider value={snapshot}>
        <CareerChatPanelProvider value={{ conversationId: null, user: null, messages } as unknown as CareerChatPanelContextValue}>
          <main data-career-theme="sky" className="flex min-h-dvh flex-col px-5 py-8">
            <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-neutral-muted">로컬 가상 데이터 · 입력 대기 UI</span>
                <MuteButton onClick={() => setPendingIds([])}>LLM 입력 반영</MuteButton>
                <MuteButton onClick={() => { setBusy(true); setMessages(initialMessages); setPendingIds([]); }}>실행 중인 작업</MuteButton>
                <MuteButton onClick={() => { setBusy(false); setMessages([]); setPendingIds([]); }}>빈 대화</MuteButton>
              </div>
              <div className="flex flex-1 flex-col gap-2 pb-6">
                <TimelineMessageList messages={rows} assistantTyping={false} thinkingLogsByMessageId={{}}
                  isStartingCall={false} assistantChoiceActionsDisabled={false} onboardingWrapupPending={false}
                  onOpenOpportunity={() => {}} />
              </div>
              <form onSubmit={event => {
                event.preventDefault();
                if (!text.trim()) return;
                const id = messages.length + 1;
                setMessages(current => [...current, { id, clientRequestId: `preview-${id}`, role: "user", content: text,
                  messageType: "chat", turnPending: true, createdAt: new Date(Date.parse(startedAt) + id * 1000).toISOString() }]);
                if (busy) setPendingIds(current => [...current, id]);
                setText("");
              }}>
                <ChatComposerFrame aria-label="메시지" placeholder="메시지를 여러 개 보내보세요" value={text}
                  onChange={event => setText(event.target.value)} actionLayout="footer"
                  action={<MuteButton type="submit" aria-label="보내기"><ArrowUp size={16} /></MuteButton>} />
              </form>
            </div>
          </main>
        </CareerChatPanelProvider>
      </CareerOpenFormsSnapshotContext.Provider>
    </QueryClientProvider>
  </MessagesProvider>;
}

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
