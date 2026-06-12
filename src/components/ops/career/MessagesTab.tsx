import { memo } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { parseRecommendJobPostingStatusLog } from "@/lib/talentOnboarding/recommendJobPostingStatus";
import { formatKst } from "./utils";

type MessageItem = {
  content: string;
  createdAt: string;
  id: number;
  messageType: string | null;
  role: string;
  thinkingLogs: string[];
};

type MessagesTabProps = {
  messages: MessageItem[];
};

type MessageToolLog = {
  label: string;
  text: string;
  tone: "default" | "success" | "error";
};

const KNOWN_THINKING_TOOL_LABELS = [
  {
    label: "update_talent_profile",
    text: "프로필과 추천 선호를 업데이트하고 있습니다.",
  },
  {
    label: "select_additional_onboarding_question",
    text: "다음에 확인할 온보딩 질문을 고르고 있습니다.",
  },
  {
    label: "open_url",
    text: "공유된 링크 내용을 확인하고 있습니다.",
  },
  {
    label: "research_company",
    text: "회사 정보를 확인하고 있습니다.",
  },
] as const;

const formatCount = (value: number | null | undefined, label: string) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${label} ${value.toLocaleString()}개`
    : null;

function formatRecommendationToolLog(rawLog: string): MessageToolLog | null {
  const status = parseRecommendJobPostingStatusLog(rawLog);
  if (!status) return null;

  const counts = [
    formatCount(status.candidateCount, "후보"),
    formatCount(status.recommendationCount, "추천"),
  ].filter(Boolean);
  const stateLabel =
    status.state === "completed"
      ? "완료"
      : status.state === "error"
        ? "실패"
        : status.state === "stopped"
          ? "중지"
          : "실행 중";

  return {
    label: "recommend_job_postings",
    text:
      counts.length > 0 ? `${stateLabel} · ${counts.join(" · ")}` : stateLabel,
    tone:
      status.state === "completed"
        ? "success"
        : status.state === "error"
          ? "error"
          : "default",
  };
}

function getThinkingToolLabel(log: string) {
  const knownTool = KNOWN_THINKING_TOOL_LABELS.find(
    (item) => item.text === log
  );
  if (knownTool) return knownTool.label;
  if (log.includes("채용공고") && log.includes("찾고 있습니다")) {
    return "recommend_job_postings";
  }
  return "Thinking";
}

function getMessageToolLogs(logs: string[] | undefined): MessageToolLog[] {
  return (logs ?? [])
    .map((log) => {
      const normalized = log.replace(/\s+/g, " ").trim();
      if (!normalized) return null;

      return (
        formatRecommendationToolLog(normalized) ?? {
          label: getThinkingToolLabel(normalized),
          text: normalized,
          tone: "default" as const,
        }
      );
    })
    .filter((log): log is MessageToolLog => Boolean(log));
}

const toolLogClass = (tone: MessageToolLog["tone"]) =>
  cx(
    "rounded-md border px-2.5 py-1.5 text-[11px] leading-5",
    tone === "success"
      ? "border-positive/30 bg-positive-faded/70 text-positive"
      : tone === "error"
        ? "border-critical/30 bg-critical-faded/65 text-critical"
        : "border-neutral-1000-a05 bg-bg-default/55 text-neutral-muted"
  );

export const MessagesTab = memo(function MessagesTab({
  messages,
}: MessagesTabProps) {
  if (messages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-6 text-center text-sm text-neutral-soft">
        대화 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto">
      {messages.map((msg) => {
        const toolLogs = getMessageToolLogs(msg.thinkingLogs);

        return (
          <div
            key={msg.id}
            className={cx(
              "rounded-lg px-4 py-3 text-sm",
              msg.role === "assistant"
                ? "bg-bg-weak text-neutral-primary"
                : "bg-bg-default/70 text-neutral-primary"
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className={cx(opsTheme.eyebrow)}>
                {msg.role === "assistant" ? "Harper" : "Talent"}
              </span>
              <span className="text-[10px] text-neutral-soft">
                {formatKst(msg.createdAt)}
              </span>
            </div>
            {toolLogs.length > 0 ? (
              <div className="mb-2 flex flex-col gap-1.5">
                {toolLogs.map((log, index) => (
                  <div
                    key={`${msg.id}-tool-${index}-${log.label}`}
                    className={toolLogClass(log.tone)}
                  >
                    <span className="mr-1.5 font-medium text-neutral-muted">
                      {log.label}
                    </span>
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="whitespace-pre-wrap">{msg.content}</div>
          </div>
        );
      })}
    </div>
  );
});
