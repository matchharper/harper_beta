import { useState } from "react";
import { cx } from "@/components/ops/theme";
import { POSTING_GRADE_LABEL, POSTING_VERDICT_LABEL } from "@/lib/gtmPlays/agent/review";
import type { AgentPerson, AgentPosting, AgentPostingGrade, AgentPostingVerdict } from "@/lib/gtmPlays/agent/types";
import { formatKst, useGtmAction } from "../api";

const GRADE_TONE: Record<AgentPostingGrade, string> = {
  good: "bg-positive-faded text-positive",
  unsure: "bg-bg-weak text-neutral-primary",
  poor: "bg-critical-faded text-critical",
};

/** The matcher's score in plain words, with its four parts on hover. */
function scoreTitle(posting: AgentPosting): string {
  const parts = posting.scoreParts;
  const head = "공고를 고를 때 매긴 점수예요(0~100, 높을수록 잘 맞음). 지역·근무 형태 같은 조건이 걸리면 크게 낮아져요.";
  if (!parts) return head;
  return `${head}\n서로 맞는 정도 ${parts.mutualFit} · 본인이 끌릴 정도 ${parts.candidateInterest} · 회사가 관심 가질 정도 ${parts.companyInterest} · 조건 문제 없음 ${parts.constraintPass}`;
}

/**
 * Under one proposed posting in the person panel: the matcher's 적합 점수, the separate grader's read and its reason
 * (따로 채점), and Ops's own 맞음 / 안 맞음 (a click on the chosen one takes it back).
 */
export function PostingQuality({ personId, posting, index, onPerson }: {
  personId: string; posting: AgentPosting; index: number; onPerson: (person: AgentPerson) => void;
}) {
  const action = useGtmAction<{ person: AgentPerson }>();
  const [pending, setPending] = useState<AgentPostingVerdict["value"] | null>(null);
  const current = posting.verdict?.value ?? null;
  const mark = async (value: AgentPostingVerdict["value"]) => {
    setPending(value);
    const result = await action.run("agent.posting.verdict", {
      id: personId, index, roleId: posting.roleId ?? null, title: posting.title, verdict: current === value ? null : value,
    });
    setPending(null);
    if (result) onPerson(result.person);
  };
  const review = posting.review;
  return (
    <div className="mt-1 space-y-1 text-[12px]">
      <p className="text-neutral-muted" title={scoreTitle(posting)}>
        {typeof posting.score === "number"
          ? <>적합 점수 <span className="font-medium tabular-nums text-neutral-primary">{posting.score}점</span></>
          : "적합 점수 없음 (점수를 남기기 전에 고른 공고)"}
      </p>
      <p className="text-neutral-muted">
        {review ? (
          <>
            따로 채점 <span className={cx("ml-0.5 rounded px-1.5 py-0.5 font-medium", GRADE_TONE[review.grade])}>{POSTING_GRADE_LABEL[review.grade]}</span>
            {review.reason ? <span className="ml-1">{review.reason}</span> : null}
          </>
        ) : "따로 채점 없음"}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-neutral-muted">운영팀 판단</span>
        {(["right", "wrong"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={action.loading}
            aria-pressed={current === value}
            title={current === value ? "다시 누르면 판단을 지워요" : undefined}
            onClick={() => void mark(value)}
            className={cx(
              "rounded-md border px-2 py-0.5 disabled:opacity-60",
              current === value
                ? value === "right" ? "border-positive bg-positive-faded font-medium text-positive" : "border-critical bg-critical-faded font-medium text-critical"
                : "border-neutral-1000-a10 text-neutral-muted hover:bg-bg-weak",
            )}
          >
            {pending === value ? "저장 중…" : POSTING_VERDICT_LABEL[value]}
          </button>
        ))}
        {posting.verdict ? <span className="text-neutral-muted">{formatKst(posting.verdict.at)}</span> : null}
        {action.error ? <span className="text-critical">{action.error}</span> : null}
      </div>
    </div>
  );
}
