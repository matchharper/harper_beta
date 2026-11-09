"use client";
import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";
import { CareerChatPanelProvider, type CareerChatPanelContextValue } from "@/components/career/CareerChatPanelContext";
import { CareerInlineForms } from "@/components/career/chat/CareerInlineForms";
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
  const loseResponse = useRef(false);
  useEffect(() => {
    const fetch = window.fetch, getSession = supabase.auth.getSession;
    const forms: CareerForm[] = Array.from({ length: 3 }, (_, index) => ({ formId: index + 1, revision: 1, kind: "form", state: "open",
      title: `${index + 1}번 회사 · 지원 내용 검토`,
      items: [{ id: "body", label: "지원 메시지", type: "textarea", content: { value: "직접 맡았던 프로젝트 경험을 검토해 주세요." } },
        { id: "start", label: "입사 가능 시기", type: "select", content: { options: [{ id: "now", label: "바로 가능" }, { id: "month", label: "한 달 이내" }] } },
        { id: "privacy", label: "지원 정보 제공에 동의", type: "checkbox", content: { value: false } }],
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
        for (const item of answer.responses) {
          const form = forms.find(form => form.formId === item.formId)!;
          responses.push({ ...item, requestId: `${answer.requestId}:${item.formId}`, formSnapshot: structuredClone(form) });
          form.state = "answered";
        }
        setMessages(current => [...current, `답변 ${answer.responses.length}개를 한 번에 보냈어요.`]);
        if (loseResponse.current) { loseResponse.current = false; throw new TypeError("Fixture: connection lost after commit"); }
        return Response.json({ message: { id: 100 + responses.length, role: "user", content: "답변을 보냈어요.", formResponses: responses.filter(response => response.requestId.startsWith(answer.requestId + ":")) } });
      }
      if (url.pathname === "/api/talent/forms") {
        const formId = Number(url.searchParams.get("formId"));
        return Response.json({ form: forms.find(form => form.formId === formId), responses: responses
          .filter(response => response.formId === formId).map(response => ({ response })) });
      }
      return Response.json({ preview: true, data: [] });
    };
    const frame = requestAnimationFrame(() => setReady(true));
    return () => { cancelAnimationFrame(frame); window.fetch = fetch; supabase.auth.getSession = getSession; client.clear(); };
  }, [client]);
  return <MessagesProvider locale="ko" persistPreference={false}><QueryClientProvider client={client}>
    <RouterContext.Provider value={{ locale: "ko", query: {}, push: async () => true } as unknown as NextRouter}>
      <main className="mx-auto flex h-dvh max-w-2xl flex-col bg-bg-default px-4 py-5 text-neutral-primary">
        <p className="text-xs text-neutral-muted">동시 지원 · 로컬 검증용 가상 데이터</p>
        <MuteButton onClick={() => { loseResponse.current = true; }}>다음 제출: 저장 후 응답 끊기</MuteButton>
        {ready && <CareerChatPanelProvider value={{ user: { id: "fixture" }, conversationId: "fixture", messages: [],
          onSendChatMessage: async () => {} } as unknown as CareerChatPanelContextValue}>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-8 text-sm">
            <p>지원 내용을 확인해 주세요.</p>
            <CareerInlineForms formIds={[1, 2, 3]} grouped />
            {messages.map((message, index) => <p className="mt-4 text-right" key={index}>{message}</p>)}
          </div>
          <form onSubmit={event => { event.preventDefault(); if (text) setMessages(current => [...current, text]); setText(""); }}>
            <ChatComposerFrame aria-label="Harper에게 메시지" placeholder="Harper에게 메시지" value={text} onChange={event => setText(event.target.value)} actionLayout="footer"
              action={<MuteButton type="submit" aria-label="보내기"><ArrowUp size={16} /></MuteButton>} />
          </form>
        </CareerChatPanelProvider>}
      </main>
    </RouterContext.Provider>
  </QueryClientProvider></MessagesProvider>;
}
