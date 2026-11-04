"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import { CardButton, MuteButton } from "@/components/ui/button";
import { Typography } from "@/components/ui/typography";
import { Skeleton } from "@/components/ui/skeleton";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerActionItems } from "@/hooks/career/useCareerActionItems";
import { useCareerChatActivityContext } from "./CareerChatPanelContext";
import { cn } from "@/lib/utils";
import {
  sortCareerActionItems,
  type CareerActionItem,
  type CareerHighlightedAction,
} from "@/lib/career/actionItems";

export function CareerActionItemList({
  items,
  onSelect,
  disabled = false,
}: {
  items: CareerActionItem[];
  onSelect: (item: CareerHighlightedAction) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3 max-w-[440px]" data-career-action-items>
      {sortCareerActionItems(items).map((item) => (
        <CardButton
          key={item.id}
          disabled={disabled}
          onClick={() => onSelect({ ...item, kind: "action_item" })}
          className={cn(
            "block px-5 py-4 rounded-2xl shadow-none",
            item.urgency === "urgent" &&
              "border-critical/30 hover:border-primary"
          )}
        >
          <Typography
            as="span"
            variant="body-sm"
            className="block break-words break-keep"
          >
            {item.title}
          </Typography>
          {item.description && (
            <Typography
              as="span"
              variant="description"
              className="mt-2 block whitespace-pre-wrap break-words"
            >
              {item.description}
            </Typography>
          )}
          <Typography
            as="div"
            variant="body-xs"
            className="mt-4 flex items-center gap-2 font-medium"
          >
            <span className="break-words">{item.buttonText}</span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 shrink-0 text-neutral-soft"
            />
          </Typography>
        </CardButton>
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
          disabled={
            sessionPending || chatAdmissionPending || inputMode === "call"
          }
        />
      ) : (
        !items.isError && (
          <Typography variant="description" className="py-6">
            {t("career.actions.empty", "지금 확인할 할 일이 없어요.")}
          </Typography>
        )
      )}
    </section>
  );
}
