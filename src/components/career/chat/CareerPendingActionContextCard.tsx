"use client";

import {
  CircleHelp,
  FileText,
  Loader2,
  MessageSquareText,
  Upload,
  X,
} from "lucide-react";
import { CardButton, MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import type {
  CareerPendingCompanyRequestAction,
  CareerPendingFitQuestionAction,
} from "@/lib/career/pendingActions";

type PendingQuestionAction =
  | CareerPendingCompanyRequestAction
  | CareerPendingFitQuestionAction;

export function CareerPendingActionContextCard({
  action,
  expanded,
  onDismiss,
  onUploadResume,
  onToggleExpanded,
  resumeUploadPending = false,
}: {
  action: PendingQuestionAction;
  expanded: boolean;
  onDismiss: () => void;
  onUploadResume?: () => void;
  onToggleExpanded: () => void;
  resumeUploadPending?: boolean;
}) {
  const t = useCareerT();
  const canUploadResume =
    action.kind === "company_request" && action.requestMode === "resume";
  const eyebrow =
    action.kind === "internal_fit_question"
      ? t(
          "career.chat.pending_action_context.fit_question_label",
          "정보가 필요합니다"
        )
      : action.requestMode === "resume"
        ? t(
            "career.chat.pending_action_context.resume_request_label",
            "회사 요청 · 이력서"
          )
        : t(
            "career.chat.pending_action_context.company_question_label",
            "회사에서 온 질문"
          );
  const Icon =
    action.kind === "internal_fit_question"
      ? CircleHelp
      : action.kind === "company_request" && action.requestMode === "resume"
        ? FileText
        : MessageSquareText;

  return (
    <div className="relative animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
      <CardButton
        aria-expanded={expanded}
        aria-label={
          expanded
            ? t(
                "career.chat.pending_action_context.collapse_aria",
                "요청 내용 접기"
              )
            : t(
                "career.chat.pending_action_context.expand_aria",
                "요청 내용 더 보기"
              )
        }
        onClick={onToggleExpanded}
        className={cn(
          "group min-h-0 rounded-[14px] border-none bg-neutral-100 px-3 py-3 pr-11 shadow-none hover:border-neutral-1000-a10",
          canUploadResume && onUploadResume && "pb-12"
        )}
      >
        <span className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-neutral-1000-a05 bg-bg-floating text-neutral-muted">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="mb-1 flex min-w-0 items-center gap-2">
              <span className="text-[11px] font-normal uppercase text-neutral-soft">
                {eyebrow}
              </span>
            </span>
            {action.kind === "company_request" ? (
              <span className="mb-1 block truncate text-[13px] font-semibold leading-5 text-neutral-primary">
                {action.companyName} · {action.roleTitle}
              </span>
            ) : null}
            <span
              className={cn(
                "mt-1 block whitespace-pre-wrap text-[12px] font-normal leading-5 text-neutral-muted",
                expanded
                  ? "max-h-[6.25rem] overflow-y-auto overscroll-contain pr-1"
                  : "line-clamp-3"
              )}
            >
              {action.prompt}
            </span>
            <span className="mt-2 block text-[11px] font-normal leading-4 text-neutral-soft">
              {expanded
                ? t(
                    "career.chat.pending_action_context.expanded_help",
                    "내용 영역 안에서 스크롤할 수 있어요. 아래에 바로 답변해 주세요."
                  )
                : t(
                    "career.chat.pending_action_context.collapsed_help",
                    "누르면 내용을 더 볼 수 있어요. 아래 답변은 이 요청에 연결됩니다."
                  )}
            </span>
          </span>
        </span>
      </CardButton>
      {canUploadResume && onUploadResume ? (
        <MuteButton
          className="absolute bottom-2 left-[3.75rem] z-10 h-7 rounded-[9px] bg-bg-floating text-[11px] font-medium text-neutral-primary"
          disabled={resumeUploadPending}
          onClick={onUploadResume}
          size="sm"
          type="button"
          variant="default"
        >
          {resumeUploadPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {t(
            "career.chat.pending_action_context.upload_resume",
            "이력서 업로드"
          )}
        </MuteButton>
      ) : null}
      <MuteButton
        aria-label={t(
          "career.chat.pending_action_context.dismiss_aria",
          "선택한 항목 닫기"
        )}
        className="absolute right-2 top-2 z-10 h-7 w-7 rounded-full text-neutral-soft hover:bg-bg-floating hover:text-neutral-primary"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        size="sm"
        type="button"
        variant="transparent"
      >
        <X className="h-3.5 w-3.5" />
      </MuteButton>
    </div>
  );
}
