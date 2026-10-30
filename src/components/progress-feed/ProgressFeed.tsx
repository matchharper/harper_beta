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
  type LucideIcon,
} from "lucide-react";
import { formatKst } from "@/components/ops/career/utils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton, MuteButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

export type ProgressFeedIcon =
  | "harper"
  | "check"
  | "eye"
  | "mail"
  | "note"
  | "sparkles"
  | "x";

export type ProgressFeedDelivery = {
  bodyText: string | null;
  id: string;
  label?: string | null;
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

/**
 * A step of the process the records belong to (a pipeline column). With
 * stages, the feed is one vertical line, newest first: the stages still
 * ahead, then what happened in the current stage above where it began, and
 * so on back to the first stage.
 */
export type ProgressFeedStage = {
  /** When it was reached. Records from then until the next stage go under it. */
  at: string | null;
  /** A short line beside the label, e.g. the date. */
  detail?: string;
  /** Shown under the label, e.g. how far it is inside that stage. */
  extra?: ReactNode;
  icon: LucideIcon;
  key: string;
  label: string;
  /** `now` is the current stage, `done` one passed, `next` one still ahead. */
  state: "done" | "next" | "now";
};

export type ProgressFeedLabels = {
  actorFallback: string;
  body: string;
  cancel: string;
  delete: string;
  deleteProgress: string;
  edit: string;
  failure: string;
  feedActions: string;
  save: string;
  subject: string;
  viewContent: string;
};

const DEFAULT_LABELS: ProgressFeedLabels = {
  actorFallback: "팀원",
  body: "본문",
  cancel: "취소",
  delete: "삭제",
  deleteProgress: "Progress 삭제",
  edit: "수정",
  failure: "처리하지 못했습니다.",
  feedActions: "피드 작업",
  save: "저장",
  subject: "제목",
  viewContent: "내용 보기",
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
  labels?: ProgressFeedLabels;
  onDelete?: (item: ProgressFeedItem) => void;
  onDraftChange?: (value: string) => void;
  onEdit?: (item: ProgressFeedItem, text: string) => Promise<void> | void;
  onSubmit?: () => void;
  pendingDeleteId?: string | null;
  pendingEditId?: string | null;
  pendingSubmit?: boolean;
  placeholder?: string;
  /** Lays the records out between these stages, newest first. */
  stages?: ProgressFeedStage[];
  submitError?: Error | null;
  submitLabel?: string;
};

function time(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Puts each record under the last stage reached at or before it. Records
 * older than every stage go under the first one; stages still ahead get none.
 */
export function groupProgressFeedByStage(
  stages: ProgressFeedStage[],
  items: ProgressFeedItem[]
) {
  const groups = stages.map((stage) => ({
    items: [] as ProgressFeedItem[],
    stage,
  }));
  const reached = groups.filter((group) => group.stage.state !== "next");
  // A stage without a date starts when the one before it did.
  let start = Number.NEGATIVE_INFINITY;
  const starts = reached.map((group) => {
    start = Math.max(start, time(group.stage.at) ?? start);
    return start;
  });
  const sorted = [...items].sort(
    (left, right) => (time(left.createdAt) ?? 0) - (time(right.createdAt) ?? 0)
  );
  for (const item of sorted) {
    const at = time(item.createdAt) ?? 0;
    let index = 0;
    starts.forEach((stageStart, position) => {
      if (stageStart <= at) index = position;
    });
    reached[index]?.items.push(item);
  }
  return groups;
}

function ProgressIcon({
  icon,
  small = false,
}: {
  icon?: ProgressFeedIcon;
  small?: boolean;
}) {
  const size = small ? "h-3 w-3" : "h-3.5 w-3.5";
  if (icon === "harper") {
    const px = small ? 12 : 14;
    return <Image src="/svgs/face.svg" alt="" width={px} height={px} />;
  }
  if (icon === "check") return <CheckCircle2 className={size} />;
  if (icon === "eye") return <Eye className={size} />;
  if (icon === "mail") return <Mail className={size} />;
  if (icon === "sparkles") return <Sparkles className={size} />;
  if (icon === "x") return <XCircle className={size} />;
  return <StickyNote className={size} />;
}

function DeliveryPreview({
  delivery,
  labels,
}: {
  delivery: ProgressFeedDelivery;
  labels: ProgressFeedLabels;
}) {
  return (
    <div className="mt-2 space-y-3 rounded-md border border-neutral-1000-a05 bg-bg-default/70 p-3 text-xs leading-5 text-neutral-muted">
      {delivery.subject ? (
        <div>
          <div className="text-[11px] text-neutral-soft">{labels.subject}</div>
          <div className="mt-1 font-medium text-neutral-primary">
            {delivery.subject}
          </div>
        </div>
      ) : null}
      {delivery.bodyText ? (
        <div>
          {delivery.subject ? (
            <div className="text-[11px] text-neutral-soft">{labels.body}</div>
          ) : null}
          <div className="mt-1 whitespace-pre-wrap break-words text-neutral-primary">
            {delivery.bodyText}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getActorLabel(actor: ProgressFeedActor, fallback: string) {
  return actor.name || actor.email || fallback;
}

function ProgressActor({
  actor,
  fallbackLabel,
  memberFallback,
}: {
  actor?: ProgressFeedActor | null;
  fallbackLabel?: string | null;
  memberFallback: string;
}) {
  if (actor) {
    const label = getActorLabel(actor, memberFallback);
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
  /** Beside a line of stages: a smaller mark, so the stages stand out. */
  besideStages: boolean;
  expanded: boolean;
  isDeleting: boolean;
  isEditing: boolean;
  isEditPending: boolean;
  item: ProgressFeedItem;
  labels: ProgressFeedLabels;
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
    left.label === right.label &&
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
    left.besideStages === right.besideStages &&
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
    left.labels === right.labels &&
    equalFeedItems(left.item, right.item)
  );
}

const ProgressFeedItemRow = memo(function ProgressFeedItemRow({
  actionsDisabled,
  actionsVariant,
  besideStages,
  canDeleteItems,
  canEditItems,
  deleteDisabled,
  editingText,
  expanded,
  isDeleting,
  isEditing,
  isEditPending,
  item,
  labels,
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
    // Beside a line of stages the record sits right of the line, starting
    // where the stage names start, with a mark smaller than a stage's dot.
    <div className={cx("flex items-start gap-1.5", besideStages && "pl-8")}>
      <span
        className={cx(
          "relative mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-bg-weak text-neutral-muted",
          besideStages ? "size-5" : "size-6"
        )}
      >
        <ProgressIcon icon={item.icon} small={besideStages} />
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
            <ProgressActor
              actor={item.actor}
              fallbackLabel={item.actorLabel}
              memberFallback={labels.actorFallback}
            />
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
                    {labels.cancel}
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
                    {labels.save}
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
                <MuteButton
                  aria-expanded={expanded}
                  type="button"
                  onClick={() => onToggleDelivery(deliveryKey)}
                  size="sm"
                  variant="transparent"
                >
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <Mail className="h-3.5 w-3.5" />
                  {delivery.label || labels.viewContent}
                </MuteButton>
                {expanded ? (
                  <DeliveryPreview delivery={delivery} labels={labels} />
                ) : null}
              </div>
            ) : null}
          </div>
          {useActionMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BareButton
                  type="button"
                  disabled={actionsDisabled}
                  aria-label={labels.feedActions}
                  title={labels.feedActions}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-soft transition hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </BareButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                {canEdit ? (
                  <DropdownMenuItem onSelect={() => onStartEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {labels.edit}
                  </DropdownMenuItem>
                ) : null}
                {canDelete ? (
                  <DropdownMenuItem
                    tone="danger"
                    onSelect={() => onDeleteItem(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {labels.delete}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : canDelete ? (
            <BareButton
              type="button"
              onClick={() => onDeleteItem(item)}
              disabled={deleteDisabled}
              aria-label={labels.deleteProgress}
              title={labels.deleteProgress}
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
  emptyLabel = "",
  error,
  editError,
  isLoading,
  items,
  labels = DEFAULT_LABELS,
  onDelete,
  onDraftChange,
  onEdit,
  onSubmit,
  pendingDeleteId,
  pendingEditId,
  pendingSubmit,
  placeholder = "메모를 남겨주세요.",
  stages,
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

  const renderItem = (item: ProgressFeedItem) => {
    if (item.customContent) {
      return (
        // Lined up with the other records' cards beside the stage line.
        <div className={stages?.length ? "pl-[58px]" : undefined} key={item.id}>
          <ProgressFeedCustomItem content={item.customContent} />
        </div>
      );
    }
    const isEditing = editingItemId === item.id;
    const deliveryKey = item.delivery ? `${item.id}:${item.delivery.id}` : null;
    return (
      <ProgressFeedItemRow
        actionsDisabled={Boolean(pendingDeleteId || pendingEditId)}
        actionsVariant={actionsVariant}
        besideStages={Boolean(stages?.length)}
        canDeleteItems={Boolean(onDelete)}
        canEditItems={Boolean(onEdit)}
        deleteDisabled={Boolean(pendingDeleteId)}
        editingText={isEditing ? editingText : ""}
        expanded={deliveryKey !== null && expandedDeliveryId === deliveryKey}
        isDeleting={pendingDeleteId === item.id}
        isEditing={isEditing}
        isEditPending={pendingEditId === item.id}
        item={item}
        key={item.id}
        labels={labels}
        onCancelEdit={handleCancelEdit}
        onDeleteItem={handleDeleteItem}
        onEditingTextChange={handleEditingTextChange}
        onSaveEdit={handleSaveEdit}
        onStartEdit={handleStartEdit}
        onToggleDelivery={handleToggleDelivery}
      />
    );
  };

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
            labels.failure}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : error ? (
        <div className={opsTheme.errorNotice}>{error.message}</div>
      ) : stages?.length ? (
        <ol className="relative">
          <span
            aria-hidden
            className="absolute bottom-3 left-[11.5px] top-3 w-px bg-neutral-1000-a10"
          />
          {/* Newest first, like every feed: the stages still ahead on top,
              then each stage's records above the point where it began. */}
          {groupProgressFeedByStage(stages, items)
            .reverse()
            .map(({ items: group, stage }) => {
              const Icon = stage.icon;
              return (
                <li
                  aria-current={stage.state === "now" ? "step" : undefined}
                  className="relative"
                  key={stage.key}
                >
                  {group.length ? (
                    <div className="space-y-2 pb-1.5 pt-1.5">
                      {[...group].reverse().map(renderItem)}
                    </div>
                  ) : null}
                  <div className="flex min-h-9 items-center gap-2 py-1.5">
                    <span
                      className={cx(
                        "relative flex size-6 shrink-0 items-center justify-center rounded-full border",
                        stage.state === "now"
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : stage.state === "done"
                            ? "border-neutral-1000-a10 bg-bg-weak text-neutral-600"
                            : "border-dashed border-neutral-1000-a10 bg-bg-default text-neutral-soft"
                      )}
                    >
                      <Icon aria-hidden className="size-3" />
                    </span>
                    <span
                      className={cx(
                        "text-[13px] font-medium",
                        stage.state === "next"
                          ? "text-neutral-muted"
                          : "text-neutral-primary"
                      )}
                    >
                      {stage.label}
                    </span>
                    {stage.detail ? (
                      <span className="text-[12px] tabular-nums text-neutral-muted">
                        {stage.detail}
                      </span>
                    ) : null}
                  </div>
                  {stage.extra ? (
                    <div className="pb-1.5 pl-8">{stage.extra}</div>
                  ) : null}
                </li>
              );
            })}
        </ol>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-6 text-center text-sm text-neutral-soft">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">{items.map(renderItem)}</div>
      )}
    </div>
  );
}
