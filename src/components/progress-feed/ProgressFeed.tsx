import Image from "next/image";
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  LoaderCircle,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  StickyNote,
  Trash2,
  XCircle,
} from "lucide-react";
import { formatKst } from "@/components/ops/career/utils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

export type ProgressFeedIcon = "check" | "eye" | "note" | "sparkles" | "x";

export type ProgressFeedDelivery = {
  bodyText: string | null;
  id: string;
  subject: string | null;
};

export type ProgressFeedActor = {
  email?: string | null;
  name?: string | null;
  profilePicture?: string | null;
};

export type ProgressFeedItem = {
  actor?: ProgressFeedActor | null;
  actorLabel?: string | null;
  createdAt: string;
  customContent?: ReactNode;
  deletable?: boolean;
  delivery?: ProgressFeedDelivery | null;
  editable?: boolean;
  icon?: ProgressFeedIcon;
  id: string;
  roleContext?: string | null;
  text: string;
  title?: string | null;
};

type ProgressFeedProps = {
  actionsVariant?: "inline" | "menu";
  deleteConfirmMessage?: string;
  deleteError?: Error | null;
  draft?: string;
  emptyLabel?: string;
  error?: Error | null;
  editError?: Error | null;
  isLoading?: boolean;
  items: ProgressFeedItem[];
  onDelete?: (item: ProgressFeedItem) => void;
  onDraftChange?: (value: string) => void;
  onEdit?: (item: ProgressFeedItem, text: string) => Promise<void> | void;
  onSubmit?: () => void;
  pendingDeleteId?: string | null;
  pendingEditId?: string | null;
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
    </div>
  );
}

function getActorLabel(actor: ProgressFeedActor) {
  return actor.name || actor.email || "멤버";
}

function ProgressActor({
  actor,
  fallbackLabel,
}: {
  actor?: ProgressFeedActor | null;
  fallbackLabel?: string | null;
}) {
  if (actor) {
    const label = getActorLabel(actor);
    const initial = label.trim().slice(0, 1).toUpperCase() || "?";

    return (
      <div className="mt-2 mb-4 flex min-w-0 items-center gap-2 text-sm text-neutral-muted">
        {actor.profilePicture ? (
          <Image
            src={actor.profilePicture}
            alt={label}
            width={20}
            height={20}
            unoptimized
            className="h-5 w-5 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-weak text-[11px] font-medium text-neutral-muted">
            {initial}
          </span>
        )}
        <span className="truncate font-medium text-neutral-primary">
          {label}
        </span>
      </div>
    );
  }

  if (!fallbackLabel) return null;
  return (
    <div className="mt-1 truncate text-[11px] text-neutral-muted">
      {fallbackLabel}
    </div>
  );
}

type ProgressFeedItemRowProps = {
  actionsDisabled: boolean;
  actionsVariant: NonNullable<ProgressFeedProps["actionsVariant"]>;
  canDeleteItems: boolean;
  canEditItems: boolean;
  deleteDisabled: boolean;
  editingText: string;
  expanded: boolean;
  isDeleting: boolean;
  isEditing: boolean;
  isEditPending: boolean;
  item: ProgressFeedItem;
  onCancelEdit: () => void;
  onDeleteItem: (item: ProgressFeedItem) => void;
  onEditingTextChange: (value: string) => void;
  onSaveEdit: (item: ProgressFeedItem, text: string) => Promise<void>;
  onStartEdit: (item: ProgressFeedItem) => void;
  onToggleDelivery: (deliveryKey: string) => void;
};

function equalActors(
  left: ProgressFeedActor | null | undefined,
  right: ProgressFeedActor | null | undefined
) {
  if (Boolean(left) !== Boolean(right)) return false;
  if (!left || !right) return true;
  return (
    left.email === right.email &&
    left.name === right.name &&
    left.profilePicture === right.profilePicture
  );
}

function equalDeliveries(
  left: ProgressFeedDelivery | null | undefined,
  right: ProgressFeedDelivery | null | undefined
) {
  if (Boolean(left) !== Boolean(right)) return false;
  if (!left || !right) return true;
  return (
    left.bodyText === right.bodyText &&
    left.id === right.id &&
    left.subject === right.subject
  );
}

function equalFeedItems(left: ProgressFeedItem, right: ProgressFeedItem) {
  return (
    left.id === right.id &&
    left.actorLabel === right.actorLabel &&
    left.createdAt === right.createdAt &&
    left.deletable === right.deletable &&
    left.editable === right.editable &&
    left.icon === right.icon &&
    left.roleContext === right.roleContext &&
    left.text === right.text &&
    left.title === right.title &&
    equalActors(left.actor, right.actor) &&
    equalDeliveries(left.delivery, right.delivery)
  );
}

function equalRowProps(
  left: ProgressFeedItemRowProps,
  right: ProgressFeedItemRowProps
) {
  return (
    left.actionsDisabled === right.actionsDisabled &&
    left.actionsVariant === right.actionsVariant &&
    left.canDeleteItems === right.canDeleteItems &&
    left.canEditItems === right.canEditItems &&
    left.deleteDisabled === right.deleteDisabled &&
    left.editingText === right.editingText &&
    left.expanded === right.expanded &&
    left.isDeleting === right.isDeleting &&
    left.isEditing === right.isEditing &&
    left.isEditPending === right.isEditPending &&
    left.onCancelEdit === right.onCancelEdit &&
    left.onDeleteItem === right.onDeleteItem &&
    left.onEditingTextChange === right.onEditingTextChange &&
    left.onSaveEdit === right.onSaveEdit &&
    left.onStartEdit === right.onStartEdit &&
    left.onToggleDelivery === right.onToggleDelivery &&
    equalFeedItems(left.item, right.item)
  );
}

const ProgressFeedItemRow = memo(function ProgressFeedItemRow({
  actionsDisabled,
  actionsVariant,
  canDeleteItems,
  canEditItems,
  deleteDisabled,
  editingText,
  expanded,
  isDeleting,
  isEditing,
  isEditPending,
  item,
  onCancelEdit,
  onDeleteItem,
  onEditingTextChange,
  onSaveEdit,
  onStartEdit,
  onToggleDelivery,
}: ProgressFeedItemRowProps) {
  const delivery = item.delivery ?? null;
  const deliveryKey = delivery ? `${item.id}:${delivery.id}` : null;
  const canEdit = canEditItems && Boolean(item.editable);
  const canDelete = canDeleteItems && Boolean(item.deletable);
  const useActionMenu = (canEdit || canDelete) && actionsVariant === "menu";

  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-weak text-neutral-muted">
        <ProgressIcon icon={item.icon} />
      </span>
      <article className="min-w-0 flex-1 rounded-sm border border-neutral-1000-a05 bg-bg-floating px-3 py-2 text-sm text-neutral-primary">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            {item.roleContext ? (
              <div className="truncate text-xs font-medium text-neutral-primary">
                {item.roleContext}
              </div>
            ) : null}
            <div className={cx("flex items-start justify-between gap-3")}>
              {item.title ? (
                <div className="min-w-0 truncate text-[12px] font-medium text-neutral-primary">
                  {item.title}
                </div>
              ) : (
                <div />
              )}
              <div className="shrink-0 text-[11px] text-neutral-soft">
                {formatKst(item.createdAt)}
              </div>
            </div>
            <ProgressActor actor={item.actor} fallbackLabel={item.actorLabel} />
            {isEditing ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  unstyled
                  value={editingText}
                  onChange={(event) => onEditingTextChange(event.target.value)}
                  maxLength={2000}
                  disabled={isEditPending}
                  className="min-h-[92px] w-full resize-y rounded-sm border border-neutral-1000-a10 bg-bg-default px-3 py-2 text-sm leading-6 text-neutral-primary outline-none transition focus:border-neutral-400"
                />
                <div className="flex justify-end gap-1.5">
                  <BareButton
                    type="button"
                    onClick={onCancelEdit}
                    disabled={isEditPending}
                    className="h-8 rounded-sm px-2.5 text-xs font-medium text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    취소
                  </BareButton>
                  <BareButton
                    type="button"
                    onClick={() => {
                      const nextText = editingText.trim();
                      if (!nextText || isEditPending) return;
                      void onSaveEdit(item, nextText);
                    }}
                    disabled={!editingText.trim() || isEditPending}
                    className={cx(
                      opsTheme.buttonPrimary,
                      "h-8 rounded-sm px-2.5 text-xs"
                    )}
                  >
                    {isEditPending ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    저장
                  </BareButton>
                </div>
              </div>
            ) : (
              <div className="mt-2 whitespace-pre-wrap leading-6 text-neutral-primary">
                {item.text}
              </div>
            )}
            {delivery && deliveryKey ? (
              <div className="mt-2">
                <BareButton
                  type="button"
                  onClick={() => onToggleDelivery(deliveryKey)}
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
                {expanded ? <DeliveryPreview delivery={delivery} /> : null}
              </div>
            ) : null}
          </div>
          {useActionMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BareButton
                  type="button"
                  disabled={actionsDisabled}
                  aria-label="피드 작업"
                  title="피드 작업"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-soft transition hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </BareButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                {canEdit ? (
                  <DropdownMenuItem onSelect={() => onStartEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                    수정
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem
                    tone="danger"
                    onSelect={() => onDeleteItem(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    삭제
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : canDelete ? (
            <BareButton
              type="button"
              onClick={() => onDeleteItem(item)}
              disabled={deleteDisabled}
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
    </div>
  );
}, equalRowProps);

const ProgressFeedCustomItem = memo(function ProgressFeedCustomItem({
  content,
}: {
  content: ReactNode;
}) {
  return <div>{content}</div>;
});

export function ProgressFeed({
  actionsVariant = "inline",
  deleteConfirmMessage = "이 Progress를 삭제할까요?",
  deleteError,
  draft = "",
  emptyLabel = "아직 피드가 없습니다.",
  error,
  editError,
  isLoading,
  items,
  onDelete,
  onDraftChange,
  onEdit,
  onSubmit,
  pendingDeleteId,
  pendingEditId,
  pendingSubmit,
  placeholder = "메모를 남겨주세요.",
  submitError,
  submitLabel = "메모 추가",
}: ProgressFeedProps) {
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(
    null
  );
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const deleteConfirmMessageRef = useRef(deleteConfirmMessage);
  const onDeleteRef = useRef(onDelete);
  const onEditRef = useRef(onEdit);

  useEffect(() => {
    deleteConfirmMessageRef.current = deleteConfirmMessage;
    onDeleteRef.current = onDelete;
    onEditRef.current = onEdit;
  }, [deleteConfirmMessage, onDelete, onEdit]);

  const handleCancelEdit = useCallback(() => {
    setEditingItemId(null);
    setEditingText("");
  }, []);
  const handleDeleteItem = useCallback((item: ProgressFeedItem) => {
    const deleteItem = onDeleteRef.current;
    if (!deleteItem || !window.confirm(deleteConfirmMessageRef.current)) return;
    deleteItem(item);
  }, []);
  const handleEditingTextChange = useCallback((value: string) => {
    setEditingText(value);
  }, []);
  const handleSaveEdit = useCallback(
    async (item: ProgressFeedItem, nextText: string) => {
      const editItem = onEditRef.current;
      if (!editItem) return;
      try {
        await editItem(item, nextText);
        setEditingItemId(null);
        setEditingText("");
      } catch {
        // Keep the editor open; the parent renders the error.
      }
    },
    []
  );
  const handleStartEdit = useCallback((item: ProgressFeedItem) => {
    setEditingItemId(item.id);
    setEditingText(item.text);
  }, []);
  const handleToggleDelivery = useCallback((deliveryKey: string) => {
    setExpandedDeliveryId((current) =>
      current === deliveryKey ? null : deliveryKey
    );
  }, []);
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
            className="min-h-[104px] w-full resize-none border-b border-neutral-1000-a05 bg-bg-floating px-3 py-3 text-sm leading-6 text-neutral-primary outline-none transition placeholder:text-neutral-placeholder"
            placeholder={placeholder}
            maxLength={2000}
            disabled={pendingSubmit}
          />
          <div className="mt-0 flex justify-end px-2 pb-2">
            <BareButton
              type="button"
              onClick={onSubmit}
              disabled={!trimmedDraft || pendingSubmit}
              className={cx(
                opsTheme.buttonPrimary,
                "h-8 px-1 rounded-sm text-xs"
              )}
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

      {submitError || deleteError || editError ? (
        <div className={opsTheme.errorNotice}>
          {submitError?.message ??
            deleteError?.message ??
            editError?.message ??
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
            if (item.customContent) {
              return (
                <ProgressFeedCustomItem
                  content={item.customContent}
                  key={item.id}
                />
              );
            }
            const isEditing = editingItemId === item.id;
            const deliveryKey = item.delivery
              ? `${item.id}:${item.delivery.id}`
              : null;

            return (
              <ProgressFeedItemRow
                actionsDisabled={Boolean(pendingDeleteId || pendingEditId)}
                actionsVariant={actionsVariant}
                canDeleteItems={Boolean(onDelete)}
                canEditItems={Boolean(onEdit)}
                deleteDisabled={Boolean(pendingDeleteId)}
                editingText={isEditing ? editingText : ""}
                expanded={
                  deliveryKey !== null && expandedDeliveryId === deliveryKey
                }
                isDeleting={pendingDeleteId === item.id}
                isEditing={isEditing}
                isEditPending={pendingEditId === item.id}
                item={item}
                key={item.id}
                onCancelEdit={handleCancelEdit}
                onDeleteItem={handleDeleteItem}
                onEditingTextChange={handleEditingTextChange}
                onSaveEdit={handleSaveEdit}
                onStartEdit={handleStartEdit}
                onToggleDelivery={handleToggleDelivery}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
