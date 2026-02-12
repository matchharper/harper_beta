import React, { useMemo, useState } from "react";
import { Heart, Send, X, Check, Zap } from "lucide-react";
import { QueryClient } from "@tanstack/react-query";

import SimpleAreaModal from "@/components/Modal/SimpleAreaModal";
import ConnectionAreaModal from "@/components/Modal/ConnectionAreaModal";
import { candidateKey } from "@/hooks/useCandidateDetail";

type ConnectionItem = { typed: number };

type FeedbackBarProps = {
  name: string;
  connection?: ConnectionItem[] | null;
  candidId: string;
  userId: string;
  qc: QueryClient;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getStatusText({
  name,
  liked,
  requested,
  passed,
}: {
  name: string;
  liked: boolean;
  requested: boolean;
  passed: boolean;
}) {
  if (passed) return `${name}님은 패스 처리됨`;
  if (requested) return `${name} · 연결 요청을 보냈음`;
  if (liked) return `${name} · 관심 후보로 저장됨`;
  return (
    <div>
      <span className="text-accenta1">{name}</span> · 더 좋은 추천을 위해
      피드백을 남겨주세요
    </div>
  );
}

const FeedbackBar = ({
  name,
  connection,
  candidId,
  userId,
  qc,
}: FeedbackBarProps) => {
  const [openLike, setOpenLike] = useState(false);
  const [openConnect, setOpenConnect] = useState(false);
  const [openPass, setOpenPass] = useState(false);

  const state = useMemo(() => {
    const list = connection ?? [];
    return {
      liked: list.some((c) => c.typed === 4),
      passed: list.some((c) => c.typed === 5),
      requested: list.some((c) => c.typed === 7),
    };
  }, [connection]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: candidateKey(candidId, userId) });
  };

  const statusText = getStatusText({ name, ...state });

  return (
    <>
      <div className="sticky top-0 z-40 w-full">
        <div className="border-b border-white/10 bg-black/10 backdrop-blur-xl text-white/90">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-2 py-2 pl-4">
            {/* Left: status */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">{statusText}</div>
            </div>

            {/* Right: actions */}
            <div className="flex shrink-0 items-center gap-1.5">
              <ActionButton
                kind="like"
                active={state.liked}
                disabled={false}
                onClick={() => setOpenLike(true)}
                label={state.liked ? "등록됨" : "좋아요"}
                icon={Check}
              />
              <ActionButton
                kind="pass"
                active={state.passed}
                disabled={false}
                onClick={() => setOpenPass(true)}
                label={state.passed ? "Skipped" : "아쉬워요"}
                icon={X}
              />
              <ActionButton
                kind="connect"
                active={state.requested}
                disabled={false}
                onClick={() => setOpenConnect(true)}
                label={state.requested ? "요청됨" : "연결 요청"}
                icon={Zap}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <SimpleAreaModal
        open={openLike}
        candidId={candidId}
        name={name}
        onClose={() => setOpenLike(false)}
        title={
          state.liked
            ? "이미 관심 후보로 저장되어 있어요"
            : "관심 후보로 저장할까요?"
        }
        placeholder="예: 특정 회사 경험 / 논문 이력 (빈칸 제출 가능)"
        onConfirm={async () => {
          await invalidate();
          setOpenLike(false);
        }}
        isLike={true}
      />

      <ConnectionAreaModal
        open={openConnect}
        candidId={candidId}
        name={name}
        onClose={() => setOpenConnect(false)}
        title={
          state.requested
            ? "연결 요청이 이미 등록되어 있어요"
            : "해당 후보자와 연결해 드릴까요?"
        }
        placeholder="예: 이분이랑 최대한 빨리 이야기 해보고 싶습니다."
        onConfirm={async () => {
          await invalidate();
          setOpenConnect(false);
        }}
      />

      <SimpleAreaModal
        open={openPass}
        candidId={candidId}
        name={name}
        onClose={() => setOpenPass(false)}
        title={
          state.passed
            ? "이미 패스 처리된 후보입니다"
            : "이번 후보는 패스할까요?"
        }
        placeholder="예: 스택/연차/지역 미스매치 (빈칸 제출 가능)"
        onConfirm={async () => {
          await invalidate();
          setOpenPass(false);
        }}
        isLike={false}
      />
    </>
  );
};

type ActionButtonProps = {
  kind: "like" | "connect" | "pass";
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function ActionButton({
  kind,
  active,
  disabled,
  onClick,
  label,
  icon: Icon,
}: ActionButtonProps) {
  const activeClass =
    kind === "like"
      ? "bg-accenta1 text-black"
      : kind === "connect"
        ? "text-black"
        : "text-black";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "group inline-flex items-center gap-1.5 rounded-md border px-3 py-2",
        "text-[12px] transition",
        active
          ? "bg-accenta1 text-black border-accenta1/0"
          : "border-black/0 bg-white/10 hover:bg-white/15",
        "active:scale-[0.99]",
        active && activeClass,
        disabled && "opacity-40 cursor-not-allowed hover:bg-white/0"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default React.memo(FeedbackBar);
