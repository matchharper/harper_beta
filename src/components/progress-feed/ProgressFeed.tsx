import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  LoaderCircle,
  Mail,
  Plus,
  Sparkles,
  StickyNote,
  Trash2,
  XCircle,
} from "lucide-react";
import { formatKst } from "@/components/ops/career/utils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ProgressFeedIcon = "check" | "eye" | "note" | "sparkles" | "x";

export type ProgressFeedDelivery = {
  bodyText: string | null;
  id: string;
  subject: string | null;
};

export type ProgressFeedItem = {
  actorLabel?: string | null;
  createdAt: string;
  deletable?: boolean;
  delivery?: ProgressFeedDelivery | null;
  icon?: ProgressFeedIcon;
  id: string;
  roleContext?: string | null;
  text: string;
  title?: string | null;
};

type ProgressFeedProps = {
  deleteConfirmMessage?: string;
  deleteError?: Error | null;
  draft?: string;
  emptyLabel?: string;
  error?: Error | null;
  isLoading?: boolean;
  items: ProgressFeedItem[];
  onDelete?: (item: ProgressFeedItem) => void;
  onDraftChange?: (value: string) => void;
  onSubmit?: () => void;
  pendingDeleteId?: string | null;
  pendingSubmit?: boolean;
  placeholder?: string;
  submitError?: Error | null;
  submitLabel?: string;
};

function ProgressIcon({ icon }: { icon?: ProgressFeedIcon }) {
  if (icon === "check") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (icon === "eye") return <Eye className="h-3.5 w-3.5" />;
  if (icon === "sparkles") return <Sparkles className="h-3.5 w-3.5" />;
  if (icon === "x") return <XCircle className="h-3.5 w-3.5" />;
  return <StickyNote className="h-3.5 w-3.5" />;
}

function DeliveryPreview({ delivery }: { delivery: ProgressFeedDelivery }) {
  return (
    <div className="mt-2 rounded-md border border-neutral-1000-a05 bg-bg-default/70 p-3 text-xs leading-5 text-neutral-muted">
      {delivery.subject ? (
        <div className="mb-2 font-medium text-neutral-primary">
          {delivery.subject}
        </div>
      ) : null}
      {delivery.bodyText ? (
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap pr-1">
          {delivery.bodyText}
        </div>
      ) : (
        <div>표시할 메일 본문이 없습니다.</div>
      )}
    </div>
  );
}

export function ProgressFeed({
  deleteConfirmMessage = "이 Progress를 삭제할까요?",
  deleteError,
  draft = "",
  emptyLabel = "아직 피드가 없습니다.",
  error,
  isLoading,
  items,
  onDelete,
  onDraftChange,
  onSubmit,
  pendingDeleteId,
  pendingSubmit,
  placeholder = "메모를 남겨주세요.",
  submitError,
  submitLabel = "메모 추가",
}: ProgressFeedProps) {
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(
    null
  );
  const trimmedDraft = draft.trim();
  const showComposer = Boolean(onDraftChange && onSubmit);

  return (
    <div className="space-y-4">
      {showComposer ? (
        <div className="rounded-md border border-neutral-1000-a10 bg-bg-floating overflow-hidden">
          <Textarea
            unstyled
            value={draft}
            onChange={(event) => onDraftChange?.(event.target.value)}
            className="min-h-[104px] w-full resize-y border-b border-neutral-1000-a10 bg-bg-floating px-3 py-3 text-sm leading-6 text-neutral-primary outline-none transition placeholder:text-neutral-placeholder"
            placeholder={placeholder}
            maxLength={2000}
            disabled={pendingSubmit}
          />
          <div className="mt-0 flex justify-end px-2 pb-2">
            <BareButton
              type="button"
              onClick={onSubmit}
              disabled={!trimmedDraft || pendingSubmit}
              className={cx(opsTheme.buttonPrimary, "h-9 px-3 text-xs")}
            >
              {pendingSubmit ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {submitLabel}
            </BareButton>
          </div>
        </div>
      ) : null}

      {submitError || deleteError ? (
        <div className={opsTheme.errorNotice}>
          {submitError?.message ??
            deleteError?.message ??
            "처리하지 못했습니다."}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : error ? (
        <div className={opsTheme.errorNotice}>{error.message}</div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-6 text-center text-sm text-neutral-soft">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isDeleting = Boolean(
              pendingDeleteId && pendingDeleteId === item.id
            );
            const delivery = item.delivery ?? null;
            const deliveryKey = delivery ? `${item.id}:${delivery.id}` : null;
            const expanded =
              deliveryKey !== null && expandedDeliveryId === deliveryKey;

            return (
              <article
                key={item.id}
                className="rounded-md border border-neutral-1000-a05 bg-bg-floating px-3.5 py-3 text-sm text-neutral-primary"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-weak text-neutral-muted">
                    <ProgressIcon icon={item.icon} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {item.roleContext ? (
                      <div className="truncate text-xs font-medium text-neutral-primary">
                        {item.roleContext}
                      </div>
                    ) : null}
                    <div
                      className={cx(
                        "flex flex-wrap items-center gap-x-2 gap-y-1",
                        item.roleContext && "mt-1"
                      )}
                    >
                      {item.title ? (
                        <div className="text-sm font-medium text-neutral-primary">
                          {item.title}
                        </div>
                      ) : null}
                      <div className="text-[11px] text-neutral-soft">
                        {formatKst(item.createdAt)}
                      </div>
                      {item.actorLabel ? (
                        <div className="truncate text-[11px] text-neutral-muted">
                          {item.actorLabel}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap leading-6 text-neutral-primary">
                      {item.text}
                    </div>
                    {delivery ? (
                      <div className="mt-2">
                        <BareButton
                          type="button"
                          onClick={() =>
                            setExpandedDeliveryId(expanded ? null : deliveryKey)
                          }
                          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-bg-weak px-2 text-[11px] font-medium text-neutral-muted transition hover:text-neutral-primary"
                        >
                          {expanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          <Mail className="h-3.5 w-3.5" />
                          메일 내용
                        </BareButton>
                        {expanded ? (
                          <DeliveryPreview delivery={delivery} />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {onDelete && item.deletable ? (
                    <BareButton
                      type="button"
                      onClick={() => {
                        if (!window.confirm(deleteConfirmMessage)) return;
                        onDelete(item);
                      }}
                      disabled={Boolean(pendingDeleteId)}
                      aria-label="Progress 삭제"
                      title="Progress 삭제"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-soft transition hover:bg-critical-faded hover:text-critical disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </BareButton>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
