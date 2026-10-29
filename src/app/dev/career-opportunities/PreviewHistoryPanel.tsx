"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  Archive,
  ArrowUpFromLine,
  Bookmark,
  ChevronDown,
  Handshake,
  Loader2,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import CareerHistoryPanel from "@/components/career/CareerHistoryPanel";
import { useCareerHistoryContext } from "@/components/career/CareerSidebarContext";
import OpportunityCard from "@/components/career/history/OpportunityCard";
import NewOpportunityList from "@/components/career/history/NewOpportunityList";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltips } from "@/components/ui/tooltip";

export type Scenario =
  | "ready"
  | "change"
  | "arrival"
  | "partial"
  | "empty"
  | "error";

export default function PreviewHistoryPanel({
  mode,
  scenario,
}: {
  mode: "current" | "proposal";
  scenario: Scenario;
}) {
  const router = useRouter();
  const {
    historyOpportunities,
    onUpdateHistoryOpportunityFeedback,
    onMarkHistoryOpportunityViewed,
  } = useCareerHistoryContext();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(12);
  const [search, setSearch] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [actionItem, setActionItem] = useState<CareerHistoryOpportunity | null>(
    null
  );
  const [state, setState] = useState<Scenario>(scenario);
  const [updated, setUpdated] = useState(false);
  const [searching, setSearching] = useState(scenario === "change");
  const [announcement, setAnnouncement] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const items = historyOpportunities.filter(
    (item) => !item.feedback && !item.savedStage
  );
  const internal = items.filter((item) => item.isInternal);
  const external = items.filter((item) => !item.isInternal);
  const rank = updated
    ? ["demo-1", "demo-10", "demo-11", "demo-2", "demo-3", "demo-4"]
    : ["demo-1", "demo-2", "demo-3", "demo-4", "demo-5", "demo-6"];
  const reviewed = rank.flatMap((id) =>
    external.filter((item) => item.id === id)
  );
  const available =
    state === "change" || state === "empty"
      ? []
      : state === "partial"
        ? reviewed.slice(0, 2)
        : reviewed;
  const primary = available.slice(0, 3);
  const additional = available.slice(3);
  const past = external.filter(
    (item) =>
      !available.some((current) => current.id === item.id) &&
      (updated || !["demo-10", "demo-11"].includes(item.id))
  );
  const filteredPast = past.filter((item) =>
    `${item.title} ${item.companyName} ${item.location}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const toggle = (item: CareerHistoryOpportunity) => {
    setExpanded((current) => (current === item.id ? null : item.id));
    void onMarkHistoryOpportunityViewed(item.id);
  };
  const save = (item: CareerHistoryOpportunity) => {
    void onUpdateHistoryOpportunityFeedback(
      item.id,
      item.isInternal ? "keep" : "positive",
      {
        savedStage: "saved",
      }
    );
    setAnnouncement(`${item.companyName} 공고를 내 기회에 저장했어요.`);
  };
  const hide = (item: CareerHistoryOpportunity) => {
    void onUpdateHistoryOpportunityFeedback(item.id, null, {
      savedStage: "hidden",
    });
    setUndo(item.id);
  };
  const publish = () => {
    if (timer.current) clearTimeout(timer.current);
    setSearching(false);
    setState("ready");
    setUpdated(true);
    setMore(false);
    setAnnouncement("추천 목록을 업데이트했어요.");
  };
  const requestReview = () => {
    setCriteriaOpen(false);
    setSearching(true);
    // A local transition demonstrates latency; it does not run scoring.
    timer.current = setTimeout(publish, 1800);
  };

  if (router.query.historyTab && router.query.historyTab !== "new") {
    return <CareerHistoryPanel navigationMode="sidebar" />;
  }

  const card = (item: CareerHistoryOpportunity) => (
    <OpportunityCard
      key={item.id}
      item={item}
      expanded={expanded === item.id}
      onToggle={() => toggle(item)}
      collapsedActions={
        <div className="flex shrink-0 items-center gap-0 md:gap-1 md:[@media(hover:hover)]:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          {!item.isInternal ? (
            <Tooltips text="목록에서 숨기기">
              <MuteButton
                aria-label={`${item.title}: 목록에서 숨기기`}
                variant="transparent"
                onClick={() => hide(item)}
              >
                <Archive aria-hidden className="size-3.5 md:size-4" />
              </MuteButton>
            </Tooltips>
          ) : null}
          <Tooltips text="저장">
            <MuteButton
              aria-label={`${item.title}: 저장`}
              variant="transparent"
              onClick={() => save(item)}
            >
              <Bookmark aria-hidden className="size-3.5 md:size-4" />
            </MuteButton>
          </Tooltips>
          {item.isInternal ? (
            <MuteButton
              aria-label="연결 제안 확인"
              variant="transparent"
              onClick={() => setActionItem(item)}
            >
              <Handshake className="size-4" />
            </MuteButton>
          ) : null}
        </div>
      }
      actions={
        <div className="grid grid-cols-2 items-center gap-2 pt-4 md:grid-cols-3">
          <MuteButton
            size="md"
            className="rounded-sm py-2.5 text-sm font-normal"
            onClick={() => hide(item)}
          >
            <Archive className="size-3.5" />
            목록에서 숨기기
          </MuteButton>
          <MuteButton
            size="md"
            variant={item.isInternal ? "neutral" : "dark"}
            className="rounded-sm py-2.5 text-sm font-normal"
            onClick={() => save(item)}
          >
            <Bookmark className="size-3.5" />
            저장
          </MuteButton>
          <MuteButton
            size="md"
            variant={item.isInternal ? "primary" : "neutral"}
            className="rounded-sm py-2.5 text-sm font-normal"
            onClick={() => setActionItem(item)}
          >
            {item.isInternal ? (
              <Handshake className="size-3.5" />
            ) : (
              <ArrowUpFromLine className="size-3.5" />
            )}
            {item.isInternal ? "연결하기" : "지원하기"}
          </MuteButton>
        </div>
      }
    />
  );

  return (
    <>
      {mode === "current" ? (
        <NewOpportunityList
          items={items.filter(
            (item) => !["demo-10", "demo-11"].includes(item.id)
          )}
          expandedOpportunityId={expanded}
          onToggleOpportunity={toggle}
          onApply={setActionItem}
          onNegative={(item) => {
            void onUpdateHistoryOpportunityFeedback(item.id, "negative");
          }}
          onKeep={save}
          onPositive={(item) =>
            item.isInternal ? setActionItem(item) : save(item)
          }
        />
      ) : (
        <div className="space-y-10 pb-6 pt-5">
          <section className="space-y-5" aria-label="Harper의 연결">
            <div className="space-y-2">
              <h2 className="flex items-center gap-2.5 text-base font-medium leading-7">
                Harper의 연결{" "}
                <span className="text-[13px] font-normal text-neutral-muted">
                  {internal.length}
                </span>
              </h2>
              {internal.length ? (
                <p className="text-sm leading-6 text-neutral-muted">
                  Harper가 회사와의 연결을 도와드리는 기회입니다.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">{internal.map(card)}</div>
          </section>
          <section className="space-y-5" aria-label="추천 Jobs">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-medium leading-7">Jobs</h2>
              <MuteButton
                size="sm"
                variant="transparent"
                onClick={() => setCriteriaOpen(true)}
              >
                <SlidersHorizontal className="size-3.5" />
                추천 기준
              </MuteButton>
            </div>
            {searching ||
            state === "arrival" ||
            state === "partial" ||
            state === "error" ? (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-1000-a10 bg-white px-3 py-2.5 text-[13px] leading-6"
              >
                <span className="flex items-center gap-2">
                  {searching ? (
                    <Loader2 aria-hidden className="size-3.5 animate-spin" />
                  ) : null}
                  {searching
                    ? state === "change"
                      ? "한국 기준으로 다시 살펴보고 있어요."
                      : "새 기회를 검토하고 있어요."
                    : state === "arrival"
                      ? "새 추천 2개가 도착했어요."
                      : state === "partial"
                        ? "검토를 마친 기회 2개를 먼저 보여드려요."
                        : "이번 검토를 완료하지 못했어요. 기존 추천은 그대로예요."}
                </span>
                {state === "arrival" ? (
                  <MuteButton size="sm" variant="neutral" onClick={publish}>
                    목록 업데이트
                  </MuteButton>
                ) : null}
                {state === "change" && searching ? (
                  <MuteButton size="sm" variant="transparent" onClick={publish}>
                    완료 결과 보기 · 데모
                  </MuteButton>
                ) : null}
                {!searching && (state === "partial" || state === "error") ? (
                  <MuteButton
                    size="sm"
                    variant="transparent"
                    onClick={requestReview}
                  >
                    다시 요청
                  </MuteButton>
                ) : null}
              </div>
            ) : null}
            {primary.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 text-[13px] text-neutral-muted">
                  <h3 className="text-[14px] font-normal">먼저 살펴볼 기회</h3>
                  <span>{updated ? "방금 검토" : "10월 28일 검토"}</span>
                </div>
                <div className="space-y-1.5">{primary.map(card)}</div>
                {additional.length > 0 ? (
                  <>
                    <MuteButton
                      size="sm"
                      variant="transparent"
                      aria-expanded={more}
                      onClick={() => setMore((current) => !current)}
                    >
                      <ChevronDown
                        className={`size-3.5 transition-transform ${more ? "rotate-180" : ""}`}
                      />
                      {more
                        ? "접기"
                        : `함께 검토한 기회 ${additional.length}개`}
                    </MuteButton>
                    {more ? (
                      <div className="space-y-1.5">{additional.map(card)}</div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : state === "empty" ? (
              <div className="space-y-3 py-4">
                <p className="text-sm text-neutral-muted">
                  이번 검토에서는 추천할 기회를 찾지 못했어요.
                </p>
                <MuteButton
                  size="sm"
                  variant="neutral"
                  onClick={() => setCriteriaOpen(true)}
                >
                  추천 기준 확인
                </MuteButton>
              </div>
            ) : state !== "change" ? (
              <p className="text-sm text-neutral-muted">
                지금 추천된 기회를 모두 살펴봤어요.
              </p>
            ) : null}
            <div className="border-t border-neutral-1000-a05 pt-4">
              <MuteButton
                variant="transparent"
                className="w-full justify-between px-0"
                aria-expanded={historyOpen}
                onClick={() => setHistoryOpen((current) => !current)}
              >
                <span>
                  이전 추천{" "}
                  <span className="ml-2 text-neutral-muted">{past.length}</span>
                </span>
                <ChevronDown
                  className={`size-4 transition-transform ${historyOpen ? "rotate-180" : ""}`}
                />
              </MuteButton>
              {state === "change" ? (
                <p className="mt-1 text-[13px] leading-6 text-neutral-muted">
                  미국 기준의 추천은 여기에 남겨뒀어요. 저장·지원한 기회는 내
                  기회에서 볼 수 있어요.
                </p>
              ) : null}
              {historyOpen ? (
                <div className="mt-4 space-y-3">
                  <Input
                    aria-label="이전 추천 검색"
                    placeholder="회사, 포지션 검색"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setHistoryLimit(12);
                    }}
                  />
                  <p className="text-xs text-neutral-muted">
                    현재 기준으로 모두 다시 검토한 목록은 아니에요.
                  </p>
                  <div className="space-y-1.5">
                    {filteredPast.slice(0, historyLimit).map(card)}
                  </div>
                  {filteredPast.length > historyLimit ? (
                    <MuteButton
                      size="sm"
                      variant="transparent"
                      onClick={() => setHistoryLimit((count) => count + 12)}
                    >
                      더보기
                    </MuteButton>
                  ) : null}
                  {!filteredPast.length ? (
                    <p className="text-sm text-neutral-muted">
                      검색 결과가 없어요.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      {undo ? (
        <div
          role="status"
          className="sticky bottom-3 flex items-center justify-between gap-2 rounded-md bg-neutral-primary px-3 py-2 text-sm text-white"
        >
          <span>목록에서 숨겼어요.</span>
          <MuteButton
            variant="transparent"
            size="sm"
            className="text-white"
            onClick={() => {
              void onUpdateHistoryOpportunityFeedback(undo, null, {
                savedStage: null,
              });
              setUndo(null);
            }}
          >
            <Undo2 className="size-3.5" />
            되돌리기
          </MuteButton>
        </div>
      ) : null}
      <TalentCareerModal
        open={criteriaOpen}
        onClose={() => setCriteriaOpen(false)}
        title="추천 기준"
        footer={
          <MuteButton variant="dark" onClick={requestReview}>
            이 기준으로 다시 검토
          </MuteButton>
        }
      >
        <div className="space-y-5 text-sm leading-7">
          <p>
            한국에서 근무할 수 있는 제품 개발 역할. 제품 의사결정에 참여하고 AI
            기능을 직접 만드는 일을 찾고 있어요.
          </p>
          <p className="text-neutral-muted">
            기준을 바꾸려면 Harper에게 이야기해주세요.
          </p>
          <p className="text-neutral-muted">
            새로 검토할 때는 이전 추천 중 관련 있는 기회도 함께 살펴봐요.
          </p>
        </div>
      </TalentCareerModal>
      <TalentCareerModal
        open={Boolean(actionItem)}
        onClose={() => setActionItem(null)}
        title={actionItem?.title}
        description={actionItem?.companyName}
        footer={
          <MuteButton
            variant="dark"
            onClick={() => {
              if (actionItem)
                void onUpdateHistoryOpportunityFeedback(
                  actionItem.id,
                  "positive",
                  {
                    savedStage: actionItem.isInternal ? "connected" : "applied",
                  }
                );
              setAnnouncement(
                "예시 상태를 내 기회에 반영했어요. 실제 지원·연결은 실행하지 않았어요."
              );
              setActionItem(null);
            }}
          >
            예시 상태 반영
          </MuteButton>
        }
      >
        <p className="text-sm leading-7">
          이 프리뷰에서는 실제 지원이나 회사 연결을 실행하지 않습니다. 저장·지원
          상태가 기존 내 기회 화면에 이어지는지 확인할 수 있어요.
        </p>
      </TalentCareerModal>
    </>
  );
}
