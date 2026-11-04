"use client";
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";
import { CareerChatPanelProvider, type CareerChatPanelContextValue } from "@/components/career/CareerChatPanelContext";
import { CareerSuggestionProvider, CareerSuggestionComposerSlot } from "@/components/career/chat/CareerSuggestionComposer";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { MuteButton } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import type { CareerForm } from "@/lib/career/forms/schema";

/** Isolated renderer fixture. Every API call is intercepted, including analytics. */
export default function Preview() {
  const [client] = useState(() => new QueryClient());
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  useEffect(() => {
    const fetch = window.fetch, getSession = supabase.auth.getSession;
    const forms: CareerForm[] = Array.from({ length: 10 }, (_, index) => ({ formId: index + 1, revision: 1, kind: "form",
      title: `${index + 1}번 회사 · 지원 내용 검토`,
      items: [{ id: "body", label: "지원 메시지", type: "textarea", content: { value: "기존 이력서를 바탕으로 준비한 지원 메시지입니다." } }],
      positive: { id: "submit", label: "제출", message: "이 내용으로 제출해줘" },
      negative: { id: "change", label: "수정 요청", message: "지원 내용을 수정해줘" },
    }));
    const responses: any[] = [];
    supabase.auth.getSession = async () => ({ data: { session: { access_token: "local-fixture" } }, error: null }) as any;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
      if (!url.pathname.startsWith("/api/")) return fetch(input, init);
      if (url.pathname === "/api/talent/work") return Response.json({ forms, latestMessageId: 100 + responses.length, pending: 0 });
      if (url.pathname === "/api/talent/forms" && init?.method === "POST") {
        const answer = JSON.parse(String(init.body));
        const form = forms.find(form => form.formId === answer.formId)!;
        const response = { ...answer, formSnapshot: form }; responses.push(response);
        forms.splice(forms.indexOf(form), 1);
        return Response.json({ message: { id: 100 + responses.length, role: "user", content: "제출해줘", formResponse: response } });
      }
      if (url.pathname === "/api/talent/forms") return Response.json({ responses: responses
        .filter(response => response.formId === Number(url.searchParams.get("formId")) && response.revision === Number(url.searchParams.get("revision")))
        .map(response => ({ response })) });
      return Response.json({ preview: true, data: [] });
    };
    const frame = requestAnimationFrame(() => setReady(true));
    return () => { cancelAnimationFrame(frame); window.fetch = fetch; supabase.auth.getSession = getSession; client.clear(); };
  }, [client]);
  return <MessagesProvider locale="ko" persistPreference={false}><QueryClientProvider client={client}>
    <RouterContext.Provider value={{ locale: "ko", query: {}, push: async () => true } as unknown as NextRouter}>
      <main className="mx-auto flex h-dvh max-w-2xl flex-col bg-bg-default px-4 py-5 text-neutral-primary">
        <p className="text-xs text-neutral-muted">동시 지원 · 로컬 검증용 가상 데이터</p>
        <div className="flex-1 overflow-y-auto py-8 text-sm"><p>10개 지원의 준비를 마쳤어요. 필요한 내용을 검토하거나 채팅으로 진행 방향을 알려주세요.</p>
          {messages.map((message, index) => <p className="mt-4 text-right" key={index}>{message}</p>)}
        </div>
        {ready ? <CareerChatPanelProvider value={{ user: { id: "fixture" }, conversationId: "fixture", messages: [],
          onSendChatMessage: async () => {} } as unknown as CareerChatPanelContextValue}>
          <CareerSuggestionProvider><CareerSuggestionComposerSlot actions={<><MuteButton size="sm">기회 더 찾아줘</MuteButton><MuteButton size="sm">커리어 상담</MuteButton></>}>
            <form onSubmit={event => { event.preventDefault(); if (text) setMessages(current => [...current, text]); setText(""); }}>
              <ChatComposerFrame aria-label="Harper에게 메시지" placeholder="Harper에게 메시지" value={text} onChange={event => setText(event.target.value)} actionLayout="footer"
                action={<MuteButton type="submit" aria-label="보내기"><ArrowUp size={16} /></MuteButton>} />
            </form>
          </CareerSuggestionComposerSlot></CareerSuggestionProvider>
        </CareerChatPanelProvider> : null}
      </main>
    </RouterContext.Provider>
  </QueryClientProvider></MessagesProvider>;
}
