"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerActionItems } from "@/hooks/career/useCareerActionItems";
import {
  useCareerChatActivityContext,
  useCareerChatPanelContext,
} from "./CareerChatPanelContext";
import {
  sortCareerActionItems,
  type CareerActionItem,
  type CareerHighlightedAction,
} from "@/lib/career/actionItems";

export function CareerActionItemList({
  items,
  onSelect,
  onClose,
  disabled = false,
}: {
  items: CareerActionItem[];
  onSelect: (item: CareerHighlightedAction) => void;
  onClose?: (item: CareerActionItem) => void;
  disabled?: boolean;
}) {
  const t = useCareerT();
  return (
    <div className="space-y-3" data-career-action-items>
      {sortCareerActionItems(items).map((item) => (
        <div key={item.id} className="career-followup-item">
          <CardButton
            data-urgency={item.urgency}
            disabled={disabled}
            onClick={() => onSelect({ ...item, kind: "action_item" })}
            className="career-followup-card career-glass"
          >
            <Typography
              as="span"
              variant="body-sm"
              className="career-followup-title"
            >
              {item.title}
            </Typography>
            {item.description && (
              <Typography
                as="span"
                variant="description"
                className="career-followup-description"
              >
                {item.description}
              </Typography>
            )}
            <Typography
              as="div"
              variant="body-xs"
              className="career-followup-action"
            >
              <span className="break-words">{item.buttonText}</span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 text-neutral-soft"
              />
            </Typography>
          </CardButton>
          {onClose && (
            <button
              type="button"
              className="career-card-close career-followup-close"
              aria-label={`${item.title}: ${t("career.followup.close", "닫기")}`}
              onClick={() => onClose(item)}
            >
              {t("career.followup.close", "닫기")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function CareerActionItemsPanel({
  onOpenChatAction,
}: {
  onOpenChatAction: (item: CareerHighlightedAction) => void;
}) {
  const t = useCareerT();
  const items = useCareerActionItems();
  const { sessionPending, chatAdmissionPending, inputMode } =
    useCareerChatActivityContext();
  const { conversationId } = useCareerChatPanelContext();
  return (
    <section aria-label={t("career.tasks.title", "할 일")}>
      {items.isError && (
        <div role="status" className="mb-4 flex items-center gap-3">
          <Typography variant="description">
            {t("career.actions.load_error", "할 일을 불러오지 못했어요.")}
          </Typography>
          <MuteButton size="sm" onClick={() => void items.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t("career.tasks.retry", "다시 불러오기")}
          </MuteButton>
        </div>
      )}
      {items.isPending ? (
        <div role="status" className="space-y-3">
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
          <span className="sr-only">
            {t("career.tasks.loading", "할 일을 불러오고 있어요")}
          </span>
        </div>
      ) : items.data?.length ? (
        <CareerActionItemList
          items={items.data}
          onSelect={onOpenChatAction}
          onClose={
            conversationId
              ? (item) => items.close(item, conversationId)
              : undefined
          }
          disabled={
            sessionPending || chatAdmissionPending || inputMode === "call"
          }
        />
      ) : (
        !items.isError && (
          <Typography variant="description" className=""></Typography>
        )
      )}
    </section>
  );
}
