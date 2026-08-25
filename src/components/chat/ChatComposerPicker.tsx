import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CHAT_COMPOSER_PICKER_SCROLL_NUDGE_PX = 8;

export const CHAT_COMPOSER_PICKER_SURFACE_CLASS_NAME =
  "overflow-hidden rounded-2xl border border-neutral-1000-a10 bg-bg-floating shadow-none";

type ChatComposerPickerItemBase = {
  icon?: ReactNode;
  id: string;
  imageAlt?: string;
  imageSrc?: string | null;
  subText?: string;
  text: string;
  trailingText?: string;
};

export type ChatComposerPickerTextItem = ChatComposerPickerItemBase & {
  announcement?: "alert" | "status";
  tone?: "critical" | "default" | "muted";
  type: "text";
};

export type ChatComposerPickerInteractiveItem = ChatComposerPickerItemBase & {
  disabled?: boolean;
  onSelect: () => void;
  type: "action" | "option";
};

export type ChatComposerPickerItem =
  | ChatComposerPickerInteractiveItem
  | ChatComposerPickerTextItem;

export type ChatComposerPickerNavigationDirection = "down" | "up";
export type ChatComposerPickerItemLayout = "inline" | "stacked";

function isSelectableChatComposerPickerItem(
  item: ChatComposerPickerItem
): item is ChatComposerPickerInteractiveItem {
  return item.type !== "text" && !item.disabled;
}

function getSelectableIndices(items: ChatComposerPickerItem[]) {
  return items.flatMap((item, index) =>
    isSelectableChatComposerPickerItem(item) ? [index] : []
  );
}

function getChatComposerPickerItemId(listId: string, itemId: string) {
  return `${listId}-item-${encodeURIComponent(itemId)}`;
}

export function useChatComposerPickerKeyboard({
  isOpen,
  items,
  listId,
  onClose,
}: {
  isOpen: boolean;
  items: ChatComposerPickerItem[];
  listId: string;
  onClose: () => void;
}) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [navigationDirection, setNavigationDirection] =
    useState<ChatComposerPickerNavigationDirection | null>(null);
  const selectableIndices = getSelectableIndices(items);
  const resolvedHighlightedIndex = selectableIndices.includes(highlightedIndex)
    ? highlightedIndex
    : (selectableIndices[0] ?? -1);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isOpen) return false;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return true;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (selectableIndices.length === 0) return true;
        const currentPosition = selectableIndices.indexOf(
          resolvedHighlightedIndex
        );
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextPosition =
          (Math.max(0, currentPosition) +
            direction +
            selectableIndices.length) %
          selectableIndices.length;
        const nextIndex = selectableIndices[nextPosition] ?? -1;
        setNavigationDirection(
          nextIndex === resolvedHighlightedIndex
            ? null
            : event.key === "ArrowDown"
              ? "down"
              : "up"
        );
        setHighlightedIndex(nextIndex);
        return true;
      }
      const highlightedItem = items[resolvedHighlightedIndex];
      if (
        event.key === "Enter" &&
        !event.nativeEvent.isComposing &&
        highlightedItem &&
        isSelectableChatComposerPickerItem(highlightedItem)
      ) {
        event.preventDefault();
        highlightedItem.onSelect();
        return true;
      }
      return false;
    },
    [isOpen, items, onClose, resolvedHighlightedIndex, selectableIndices]
  );
  const resetHighlight = useCallback(() => {
    setHighlightedIndex(-1);
    setNavigationDirection(null);
  }, []);
  const highlightFromPointer = useCallback((index: number) => {
    setHighlightedIndex(index);
    setNavigationDirection(null);
  }, []);
  const highlightedItem = items[resolvedHighlightedIndex];

  return {
    activeDescendantId:
      isOpen &&
      highlightedItem &&
      isSelectableChatComposerPickerItem(highlightedItem)
        ? getChatComposerPickerItemId(listId, highlightedItem.id)
        : undefined,
    highlightedIndex: resolvedHighlightedIndex,
    navigationDirection,
    onKeyDown,
    resetHighlight,
    setHighlightedIndex: highlightFromPointer,
  };
}

export function ChatComposerPickerItemContent({
  item,
  layout = "inline",
}: {
  item: ChatComposerPickerItem;
  layout?: ChatComposerPickerItemLayout;
}) {
  const isText = item.type === "text";
  const tone = isText ? (item.tone ?? "muted") : "default";
  const isStacked = layout === "stacked";

  return (
    <>
      {item.imageSrc || item.icon ? (
        <span
          aria-hidden="true"
          className="relative mr-2 flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-lg text-black/70 [&_svg]:size-4"
        >
          {item.icon}
          {item.imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={item.imageAlt ?? ""}
              className="absolute inset-0 size-full bg-bg-floating object-cover"
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
              src={item.imageSrc}
            />
          ) : null}
        </span>
      ) : null}
      <span
        className={cn(
          "flex min-w-0 flex-1 overflow-hidden",
          isStacked
            ? "flex-col items-start justify-center gap-0 whitespace-nowrap"
            : "truncate items-center justify-start gap-1.5 whitespace-nowrap"
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate text-[12px] font-normal leading-4",
            tone === "critical"
              ? "text-critical"
              : tone === "muted"
                ? "text-black/50"
                : "text-black"
          )}
        >
          {item.text}
        </span>
        {item.subText ? (
          isStacked ? (
            <span className="w-full min-w-0 truncate text-[11px] font-normal leading-4 text-black/40">
              {item.subText}
            </span>
          ) : (
            <>
              <span aria-hidden="true" className="shrink-0 text-black/20">
                ·
              </span>
              <span className="min-w-0 max-w-[38%] shrink truncate text-[12px] font-normal text-black/40">
                {item.subText}
              </span>
            </>
          )
        ) : null}
      </span>
      {item.trailingText ? (
        <span className="ml-4 min-w-0 shrink truncate text-[12px] font-normal text-black/40">
          {item.trailingText}
        </span>
      ) : null}
    </>
  );
}

export function ChatComposerPicker({
  className,
  highlightedIndex,
  items,
  listId,
  navigationDirection,
  onClose,
  onHighlight,
}: {
  className?: string;
  highlightedIndex: number;
  items: ChatComposerPickerItem[];
  listId: string;
  navigationDirection?: ChatComposerPickerNavigationDirection | null;
  onClose: () => void;
  onHighlight: (index: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const highlightedOptionRef = useRef<HTMLButtonElement | null>(null);
  const previousHighlightedIndexRef = useRef(highlightedIndex);
  const [isScrollable, setIsScrollable] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const updateScrollable = () =>
      setIsScrollable(list.scrollHeight > list.clientHeight + 1);

    updateScrollable();
    if (!window.ResizeObserver) return;
    const observer = new window.ResizeObserver(updateScrollable);
    observer.observe(list);
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    const option = highlightedOptionRef.current;
    const list = listRef.current;
    const didMove = previousHighlightedIndexRef.current !== highlightedIndex;
    previousHighlightedIndexRef.current = highlightedIndex;
    if (!option || !list) return;

    const optionBottom = option.getBoundingClientRect().bottom;
    const listBottom = list.getBoundingClientRect().bottom;
    option.scrollIntoView({ block: "nearest" });

    if (
      didMove &&
      navigationDirection === "down" &&
      optionBottom >= listBottom - 4
    ) {
      const frameId = window.requestAnimationFrame(() => {
        const maxScrollTop = list.scrollHeight - list.clientHeight;
        list.scrollTop = Math.min(
          maxScrollTop,
          list.scrollTop + CHAT_COMPOSER_PICKER_SCROLL_NUDGE_PX
        );
      });
      return () => window.cancelAnimationFrame(frameId);
    }
  }, [highlightedIndex, navigationDirection]);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target))
        return;
      onClose();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () =>
      document.removeEventListener(
        "pointerdown",
        handleOutsidePointerDown,
        true
      );
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "absolute bottom-full left-0 z-30 mb-1 flex max-h-[min(20rem,40dvh)] w-full flex-col pb-3",
        CHAT_COMPOSER_PICKER_SURFACE_CLASS_NAME,
        className
      )}
    >
      <div
        ref={listRef}
        className="min-h-0 overflow-y-auto px-1 py-1"
        id={listId}
        role="listbox"
      >
        {items.map((item, index) => {
          const itemId = getChatComposerPickerItemId(listId, item.id);
          if (item.type === "text") {
            return (
              <div
                aria-disabled="true"
                aria-selected="false"
                className="flex h-8 w-full items-center overflow-hidden whitespace-nowrap px-2 text-left text-black/50"
                id={itemId}
                key={item.id}
                role="option"
              >
                <span
                  className="contents"
                  role={item.announcement ?? undefined}
                >
                  <ChatComposerPickerItemContent item={item} />
                </span>
              </div>
            );
          }

          const highlighted = index === highlightedIndex;
          return (
            <button
              ref={highlighted ? highlightedOptionRef : null}
              aria-selected={highlighted}
              className={cn(
                "mb-0.5 flex h-8 w-full flex-row items-center justify-start overflow-hidden whitespace-nowrap rounded-lg border-0 px-2 text-left shadow-none last:mb-0 focus-visible:ring-inset focus-visible:ring-offset-0",
                highlighted ? "bg-black/4" : "hover:bg-black/4"
              )}
              disabled={item.disabled}
              id={itemId}
              key={item.id}
              onClick={item.onSelect}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => {
                if (!item.disabled) onHighlight(index);
              }}
              role="option"
              type="button"
            >
              <ChatComposerPickerItemContent item={item} />
            </button>
          );
        })}
      </div>
      {isScrollable ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-linear-to-b from-transparent via-bg-floating/70 to-bg-floating"
        />
      ) : null}
    </div>
  );
}
