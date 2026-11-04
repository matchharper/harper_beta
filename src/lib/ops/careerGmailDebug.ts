import type { GmailSearchResult } from "@/lib/integrations/gmail";

export type CareerGmailDebugOptions = {
  account: { userId: string; email: string | null };
  connectionStatus: string;
  tool: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type CareerGmailDebugRun = {
  account: CareerGmailDebugOptions["account"];
  input: Record<string, unknown>;
  startedAt: string;
  durationMs: number;
  result: GmailSearchResult | null;
  error: string | null;
  llmText: string;
};

// Editable examples only; execution always uses the submitted Gmail query.
export const CAREER_GMAIL_QUERY_EXAMPLES = [
  { label: "최근 7일", query: "newer_than:7d" },
  { label: "안 읽은 메일", query: "is:unread newer_than:30d" },
  { label: "발신자", query: "from:matchharper.com newer_than:30d" },
  { label: "수신자", query: "to:daniel@matchharper.com newer_than:30d" },
  { label: "제목", query: "subject:(interview OR application)" },
  { label: "기간", query: "after:2026/10/01 before:2026/11/01" },
  { label: "첨부 파일", query: "has:attachment filename:pdf" },
  { label: "정확한 문구·제외", query: '"interview invitation" -from:me' },
] as const;
