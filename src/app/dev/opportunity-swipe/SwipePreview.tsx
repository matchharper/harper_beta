"use client";

import { useState } from "react";
import {
  Building2,
  ChevronRight,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { OpportunitySwipeRow } from "@/components/career/history/OpportunitySwipeRow";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { MuteButton } from "@/components/ui/button";

const examples = [
  {
    id: 1,
    title: "Product Designer",
    company: "Sample Studio",
    location: "서울 · 정규직",
  },
  {
    id: 2,
    title: "Frontend Engineer",
    company: "Example Labs",
    location: "서울 · 하이브리드",
  },
  {
    id: 3,
    title: "Product Manager",
    company: "Demo Works",
    location: "리모트 · 정규직",
  },
  {
    id: 4,
    title: "Brand Designer",
    company: "Sample Collective",
    location: "서울 · 정규직",
  },
];

export default function SwipePreview() {
  const [decisions, setDecisions] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [message, setMessage] = useState("카드를 좌우로 밀어보세요.");
  const decide = (id: number, label: string) => {
    setDecisions((current) => ({ ...current, [id]: label }));
    setMessage(`${examples.find((item) => item.id === id)?.title}: ${label}`);
  };

  return (
    <main className="min-h-dvh bg-bg-basement px-5 py-10 text-neutral-primary">
      <div className="mx-auto max-w-[400px] space-y-7">
        <header className="space-y-3">
          <p className="text-xs text-neutral-muted">
            LOCAL PREVIEW · 가상 데이터
          </p>
          <h1 className="text-2xl font-medium">새 기회</h1>
          <p className="text-sm leading-6 text-neutral-muted">
            휴대폰은 손가락으로, PC는 마우스로 드래그하세요. 글씨 색이 바뀌면
            손을 놓아 선택합니다. 짧게 밀거나 되돌리면 취소됩니다.
          </p>
          <div className="flex justify-between text-xs text-neutral-muted">
            <span>← 나와 안맞아요</span>
            <span>관심 있어요 →</span>
          </div>
        </header>
        <div className="space-y-3">
          {examples
            .filter((item) => !decisions[item.id])
            .map((item) => (
              <OpportunitySwipeRow
                key={item.id}
                preview
                disabled={expanded === item.id}
                positive={{
                  label: "관심 있어요",
                  icon: <ThumbsUp className="size-5" />,
                  onSelect: () => decide(item.id, "관심 있어요"),
                }}
                negative={{
                  label: "나와 안맞아요",
                  icon: <ThumbsDown className="size-5" />,
                  onSelect: () => decide(item.id, "나와 안맞아요"),
                }}
              >
                <article className="rounded-lg border border-neutral-1000-a05/50 bg-bg-floating">
                  <ClickablePanel
                    className="flex cursor-pointer items-center gap-3 px-3 py-4"
                    aria-expanded={expanded === item.id}
                    onActivate={() =>
                      setExpanded(expanded === item.id ? null : item.id)
                    }
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-bg-weak">
                      <Building2
                        aria-hidden
                        className="size-5 text-neutral-muted"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-6">{item.title}</p>
                      <p className="text-xs leading-5 text-neutral-muted">
                        {item.company}
                      </p>
                      <p className="text-xs leading-5 text-neutral-soft">
                        {item.location}
                      </p>
                    </div>
                    <ChevronRight
                      aria-hidden
                      className="size-3 text-neutral-soft"
                    />
                  </ClickablePanel>
                  {expanded === item.id ? (
                    <div className="space-y-4 border-t border-neutral-1000-a05 p-4 text-sm">
                      <p>
                        탭하면 상세가 열립니다. 가상 기회이며, 선택해도 저장이나
                        연락이 발생하지 않습니다.
                      </p>
                      <div className="flex gap-2">
                        <MuteButton
                          onClick={() => decide(item.id, "나와 안맞아요")}
                        >
                          나와 안맞아요
                        </MuteButton>
                        <MuteButton
                          onClick={() => decide(item.id, "관심 있어요")}
                        >
                          관심 있어요
                        </MuteButton>
                      </div>
                    </div>
                  ) : null}
                </article>
              </OpportunitySwipeRow>
            ))}
        </div>
        <div className="space-y-4 border-t border-neutral-1000-a05 pt-5">
          <p role="status" className="text-sm text-neutral-muted">
            {message}
          </p>
          <MuteButton
            onClick={() => {
              setDecisions({});
              setExpanded(null);
              setMessage("카드를 좌우로 밀어보세요.");
            }}
          >
            <RotateCcw className="size-4" />
            다시 테스트
          </MuteButton>
          <p className="text-xs leading-5 text-neutral-soft">
            실제 새 기회와 동일한 스와이프 컴포넌트입니다. 이 페이지의 선택
            결과는 화면에서만 반영되며, 실제 서비스의 연결 동의·피드백 절차는
            생략합니다.
          </p>
        </div>
      </div>
    </main>
  );
}
