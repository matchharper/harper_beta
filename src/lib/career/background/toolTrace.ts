/** Shared transport types for the development run viewer. */
export const CAREER_BACKGROUND_TOOL_LOG = "career_background_tool";

export type CareerBackgroundToolLog = {
  id: number;
  executionId: string;
  callId?: string;
  name: string;
  phase: "started" | "returned" | "threw";
  occurredAt: string;
  inputText?: string;
  resultText?: string;
  errorText?: string;
  diagnosticsText?: string;
  durationMs?: number;
};

export type CareerBackgroundLogPage = {
  run: {
    id: string;
    status: string;
    error: string | null;
    outcome: string | null;
  };
  logs: CareerBackgroundToolLog[];
  nextCursor: number;
  hasMore: boolean;
};

export const CAREER_BACKGROUND_STATUS: Record<string, string> = {
  queued: "대기 중",
  running: "실행 중",
  handed_off: "Career agent 처리 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소됨",
  partial: "일부 완료",
};
