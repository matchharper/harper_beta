import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgTalentDetailResponse } from "@/lib/org/server";
import type {
  OrgTalentDetailNavigationState,
  OrgTalentDetailNavigationTarget,
} from "@/lib/org/detailNavigation";
import { OrgTalentProfile } from "./OrgTalentProfile";
import { OrgTalentNotes } from "./OrgTalentNotes";
import { OrgPassPopover } from "./OrgPassPopover";
import { OrgErrorState } from "./workspace/OrgErrorState";

type Props = {
  detail?: OrgTalentDetailResponse;
  error: Error | null;
  onRetry: () => void;
  navigation: OrgTalentDetailNavigationState<OrgTalentDetailNavigationTarget> | null;
  onNavigate: (target: OrgTalentDetailNavigationTarget | null) => void;
  onBack?: () => void;
  onAccept: () => void;
  onPass: (reason: string) => Promise<void>;
  onSave: () => Promise<void>;
  saved: boolean;
  pending: boolean;
  canManage: boolean;
  onResume: (
    kind: "storage" | "link" | "document",
    link?: string | null,
    documentId?: string | null
  ) => void;
};

/** Shared inline review surface for Home and the role inbox. */
export function OrgCandidateReview(props: Props) {
  const { c } = useOrgLocale();
  const { detail, navigation, pending, canManage } = props;
  const [passOpen, setPassOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionable = Boolean(
    detail &&
    (detail.companyIntro
      ? detail.companyIntro.status === "ready" &&
        detail.capabilities.requestIntro
      : detail.recommendation.stage === "pending_connection" &&
        detail.capabilities.moveStage)
  );
  const save = async () => {
    setActionError("");
    try {
      await props.onSave();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : c("저장하지 못했습니다.", "Could not save candidate.")
      );
    }
  };
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [detail?.recommendation.recommendationId]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        pending ||
        passOpen
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog],[role=menu],[role=tablist]"
        )
      )
        return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = event.key.toLowerCase();
      if (key === "arrowleft" && navigation?.previous) {
        event.preventDefault();
        props.onNavigate(navigation.previous);
      }
      if (key === "arrowright" && navigation?.next) {
        event.preventDefault();
        props.onNavigate(navigation.next);
      }
      if (!actionable || !canManage) return;
      if (key === "s") {
        event.preventDefault();
        void save();
      }
      if (key === "p") {
        event.preventDefault();
        setPassOpen(true);
      }
      if (key === "r") {
        event.preventDefault();
        props.onAccept();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  return (
    <section
      aria-label={c("후보자 검토", "Candidate review")}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-default"
    >
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-1000-a05 bg-bg-default px-4 py-3 lg:px-6">
        <div className="flex items-center gap-1">
          {props.onBack && (
            <MuteButton
              aria-label={c("리스트로 돌아가기", "Back to list")}
              onClick={props.onBack}
              variant="transparent"
              size="sm"
            >
              <ArrowLeft className="size-4" />
            </MuteButton>
          )}
          <MuteButton
            aria-label={c("이전 후보자", "Previous candidate")}
            onClick={() => props.onNavigate(navigation?.previous ?? null)}
            disabled={!navigation?.previous || pending}
            variant="transparent"
            size="sm"
          >
            <ChevronLeft className="size-4" />
          </MuteButton>
          <span
            aria-live="polite"
            className="min-w-12 text-center text-xs tabular-nums text-neutral-muted"
          >
            {navigation ? `${navigation.position} / ${navigation.total}` : "—"}
          </span>
          <MuteButton
            aria-label={c("다음 후보자", "Next candidate")}
            onClick={() => props.onNavigate(navigation?.next ?? null)}
            disabled={!navigation?.next || pending}
            variant="transparent"
            size="sm"
          >
            <ChevronRight className="size-4" />
          </MuteButton>
        </div>
        {actionable && canManage && (
          <div className="flex items-center gap-2">
            <MuteButton onClick={() => void save()} disabled={pending}>
              {props.saved ? c("저장 해제", "Unsave") : "Save"}
              <kbd className="ml-2 text-xs text-neutral-soft">S</kbd>
            </MuteButton>
            <OrgPassPopover
              key={detail?.recommendation.recommendationId}
              open={passOpen}
              onOpenChange={setPassOpen}
              onSubmit={props.onPass}
              pending={pending}
            />
            <MuteButton
              variant="dark"
              disabled={pending}
              onClick={props.onAccept}
            >
              {detail?.companyIntro
                ? c("Intro 보내기", "Send intro")
                : c("Accept Intro", "Accept Intro")}
              <kbd className="ml-2 text-xs opacity-50">R</kbd>
            </MuteButton>
          </div>
        )}
      </header>
      {actionError && (
        <p role="alert" className="px-6 pt-3 text-xs text-critical">
          {actionError}
        </p>
      )}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 lg:p-10"
      >
        {props.error ? (
          <OrgErrorState
            message={props.error.message}
            onRetry={props.onRetry}
          />
        ) : detail ? (
          <div className="mx-auto max-w-[980px]">
            <OrgTalentProfile detail={detail} onResumeClick={props.onResume} />
            <OrgTalentNotes
              key={`${detail.role.roleId}:${detail.talent.userId}`}
              detail={detail}
              canManage={canManage}
            />
          </div>
        ) : (
          <div aria-busy="true" className="space-y-8">
            <Skeleton className="h-16 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}
      </div>
    </section>
  );
}
