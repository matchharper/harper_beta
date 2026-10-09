import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerChatPanelContext } from "../CareerChatPanelContext";
import { useCareerT } from "@/i18n/useCareerT";
import type { SessionRecord } from "@/lib/career/simulation/sessionStore";
import {
  parseApplicationDraft,
  type PreparationResponse,
} from "@/lib/career/simulation/preparation";
import type { CareerMessage } from "../types";
export type PreparationCommand = {
  operation:
    | "continue"
    | "respond"
    | "navigate"
    | "hide"
    | "show"
    | "generate"
    | "approve"
    | "attach"
    | "resume"
    | "end";
  itemId?: string;
  response?: PreparationResponse;
  documentId?: string;
  draftVersion?: number;
};
type Value = {
  record: SessionRecord | null;
  drafts: CareerMessage[];
  pending: boolean;
  error: string;
  command: (input: PreparationCommand) => Promise<boolean>;
};
export const ApplicationPreparationContext = createContext<Value>({
  record: null,
  drafts: [],
  pending: false,
  error: "",
  command: async () => false,
});
export const useApplicationPreparation = () =>
  useContext(ApplicationPreparationContext);
export function ApplicationPreparationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { conversationId, messages, chatPending, onSendChatMessage } =
    useCareerChatPanelContext();
  const { fetchWithAuth } = useCareerApi();
  const t = useCareerT();
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const [drafts, setDrafts] = useState<CareerMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const conversationRef = useRef(conversationId);
  useEffect(() => {
    conversationRef.current = conversationId;
    return () => {
      conversationRef.current = null;
    };
  }, [conversationId]);
  const refresh = useCallback(async () => {
    if (!conversationId) return;
    const response = await fetchWithAuth(
      `/api/talent/simulation?conversationId=${encodeURIComponent(conversationId)}`
    );
    if (!response.ok) return;
    const data = await response.json();
    if (conversationRef.current !== conversationId) return;
    setRecord((prev) =>
      prev &&
      data.session?.messageId === prev.messageId &&
      data.session.state.revision <= prev.state.revision
        ? prev
        : data.session
    );
    const refreshedDrafts = (data.drafts ?? []).flatMap(
      (row: { id: number; payload: unknown; created_at: string }) => {
        const draft = parseApplicationDraft(row.payload);
        return draft
          ? [
              {
                id: row.id,
                role: "assistant" as const,
                messageType: "application_draft",
                content: "",
                createdAt: row.created_at,
                applicationDraft: draft,
              },
            ]
          : [];
      }
    );
    const outputMessages: CareerMessage[] = data.outputs ?? [];
    refreshedDrafts.push(...(outputMessages as typeof refreshedDrafts));
    setDrafts((prev) =>
      JSON.stringify(prev) === JSON.stringify(refreshedDrafts)
        ? prev
        : refreshedDrafts
    );
  }, [conversationId, fetchWithAuth]);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh, messages, chatPending]);
  const activeSessionId =
    record?.state.status === "active" ? record.messageId : null;
  useEffect(() => {
    if (!activeSessionId) return;
    const id = setInterval(() => void refresh().catch(() => {}), 3000);
    return () => clearInterval(id);
  }, [activeSessionId, refresh]);
  const command = useCallback(
    async (input: PreparationCommand) => {
      if (!record || !conversationId || lock.current || chatPending)
        return false;
      lock.current = true;
      setPending(true);
      setError("");
      let committed = false;
      let submittedRecord: SessionRecord | null = null;
      try {
        if (input.operation === "continue") {
          const batch = record.state.activity?.batches.findLast(
            (b) =>
              b.status === "submitted" &&
              ["pending", "failed"].includes(b.continuation)
          );
          if (!batch) return false;
          await onSendChatMessage({
            text: "",
            applicationInputSubmission: {
              batchId: batch.id,
              sessionMessageId: record.messageId,
              expectedRevision: record.state.revision,
            },
          });
          await refresh();
          return true;
        }
        const response = await fetchWithAuth("/api/talent/simulation", {
          method: "POST",
          body: JSON.stringify({
            ...input,
            conversationId,
            sessionMessageId: record.messageId,
            expectedRevision: record.state.revision,
            requestId: crypto.randomUUID(),
          }),
        });
        if (!response.ok) throw new Error("Preparation failed");
        if (conversationRef.current !== conversationId) return false;
        const receive = (data: {
          session?: SessionRecord | null;
          error?: string;
        }) => {
          if (conversationRef.current !== conversationId) return;
          if (data.session) {
            committed = true;
            const incoming = data.session;
            submittedRecord = incoming;
            setRecord((prev) =>
              prev &&
              incoming.messageId === prev.messageId &&
              incoming.state.revision <= prev.state.revision
                ? prev
                : incoming
            );
          }
          if (data.error) throw new Error(data.error);
        };
        if (
          response.headers.get("content-type")?.includes("application/x-ndjson")
        ) {
          if (!response.body) throw new Error("Missing preparation stream");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          try {
            while (true) {
              const { value, done } = await reader.read();
              buffer += decoder.decode(value, { stream: !done });
              let newline: number;
              while ((newline = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, newline);
                buffer = buffer.slice(newline + 1);
                if (line.trim()) receive(JSON.parse(line));
              }
              if (done) {
                if (buffer.trim()) receive(JSON.parse(buffer));
                break;
              }
            }
          } finally {
            reader.releaseLock();
          }
        } else receive(await response.json());
        await refresh();
        const ready = submittedRecord as SessionRecord | null;
        const batch = ready?.state.activity?.batches.findLast(
          (b) => b.status === "submitted" && b.continuation === "pending"
        );
        if (ready && batch && input.operation === "respond") {
          await onSendChatMessage({
            text: "",
            applicationInputSubmission: {
              batchId: batch.id,
              sessionMessageId: ready.messageId,
              expectedRevision: ready.state.revision,
            },
          });
        }
        return true;
      } catch {
        if (conversationRef.current === conversationId) {
          setError(
            committed
              ? ""
              : t(
                  "career.prep.error",
                  "처리하지 못했어요. 입력은 유지됩니다. 상태를 확인한 뒤 다시 시도해 주세요."
                )
          );
          await refresh().catch(() => {});
        }
        return committed;
      } finally {
        lock.current = false;
        setPending(false);
      }
    },
    [
      record,
      conversationId,
      fetchWithAuth,
      refresh,
      t,
      chatPending,
      onSendChatMessage,
    ]
  );
  return (
    <ApplicationPreparationContext.Provider
      value={{
        record,
        drafts,
        pending: pending || chatPending,
        error,
        command,
      }}
    >
      {children}
    </ApplicationPreparationContext.Provider>
  );
}
