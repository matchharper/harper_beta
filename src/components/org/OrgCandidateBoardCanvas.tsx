import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Maximize, Minus, Plus, Trash2, Type } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import {
  orgBoardLayoutKey,
  saveOrgBoardLayout,
  useOrgBoardLayout,
  useOrgBoardTexts,
} from "@/hooks/org/useOrgRoleViews";
import { useOptionalOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import {
  orgBoardTextSizeForZoom,
  ORG_BOARD_TEXT_SIZES,
  type OrgBoardLayout,
  type OrgBoardPoint,
  type OrgBoardText,
  type OrgBoardViewport,
} from "@/lib/org/roleViews";
import type { OrgBoardItem } from "@/lib/org/server";
import { cn } from "@/lib/utils";

const CARD_WIDTH = 340;
const CARD_HEIGHT = 260;
const GAP = 40;
const COLUMNS = 4;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const DRAG_THRESHOLD = 4;
const SAVE_DELAY = 700;
const DOT_SPACING = 24;
const DEFAULT_VIEWPORT: OrgBoardViewport = { x: 40, y: 40, zoom: 0.8 };
const NO_IDS: ReadonlySet<string> = new Set();

// The view a person left when opening a candidate's profile, so going back
// shows exactly that view instead of fitting every card again.
const returnViewports = new Map<string, OrgBoardViewport>();

const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

type Rect = { height: number; width: number; x: number; y: number };

/** Roughly how wide a line is, in em: wide for Hangul and CJK. */
function lineEms(line: string) {
  let width = 0;
  for (const char of line) width += char.charCodeAt(0) > 0x2e80 ? 1 : 0.6;
  return width;
}
type Positions = Record<string, OrgBoardPoint>;

function overlaps(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * The next free slots of a left-to-right grid, around cards already placed.
 * `rowHeight` is the tallest card measured on screen, so rows never overlap.
 */
function placeNewCards(
  positions: Positions,
  ids: string[],
  rowHeight = CARD_HEIGHT
) {
  const taken = Object.values(positions).map((point) => ({
    ...point,
    height: rowHeight,
    width: CARD_WIDTH,
  }));
  const next: Positions = {};
  let slot = 0;
  for (const id of ids) {
    for (;;) {
      const point = {
        x: (slot % COLUMNS) * (CARD_WIDTH + GAP),
        y: Math.floor(slot / COLUMNS) * (rowHeight + GAP),
      };
      slot += 1;
      const rect = { ...point, height: rowHeight, width: CARD_WIDTH };
      if (!taken.some((other) => overlaps(rect, other))) {
        next[id] = point;
        taken.push(rect);
        break;
      }
    }
  }
  return next;
}

/** Keeps the point under the pointer still while zooming. */
function zoomViewport(
  current: OrgBoardViewport,
  factor: number,
  point: { x: number; y: number }
) {
  const zoom = clampZoom(current.zoom * factor);
  return {
    x: point.x - ((point.x - current.x) * zoom) / current.zoom,
    y: point.y - ((point.y - current.y) * zoom) / current.zoom,
    zoom,
  };
}

type Drag =
  | {
      kind: "cards";
      ids: string[];
      /** The latest offset painted on screen, committed on release. */
      last?: { dx: number; dy: number };
      moved: boolean;
      origin: Positions;
      start: { x: number; y: number };
    }
  | {
      kind: "pan";
      /** The latest spot painted on screen, committed on release. */
      last?: OrgBoardViewport;
      moved: boolean;
      origin: OrgBoardViewport;
      start: { x: number; y: number };
    }
  | {
      base: Set<string>;
      kind: "select";
      start: { x: number; y: number };
    }
  | {
      id: string;
      kind: "text";
      /** The latest offset painted on screen, committed on release. */
      last?: { dx: number; dy: number };
      moved: boolean;
      origin: OrgBoardPoint;
      start: { x: number; y: number };
    };

type BoardProps = {
  /** Which tab of the Role's board this is; each has its own text boxes. */
  board: string;
  items: OrgBoardItem[];
  /** Omitted where the board has no bulk actions. */
  onSelectionChange?: (ids: Set<string>) => void;
  renderCard: (item: OrgBoardItem) => ReactNode;
  roleId: string;
  selectedIds: ReadonlySet<string>;
  workspaceId: string;
};

const BOARD_CLASS =
  "relative h-[calc(100dvh-220px)] min-h-[440px] overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-floating";

/**
 * A white board where the team places candidate cards anywhere and writes
 * text boxes beside them. Each teammate's card arrangement and zoom are
 * saved for them; the text boxes are shared by the whole team, one set per
 * tab.
 */
export function OrgCandidateBoardCanvas(props: BoardProps) {
  const layoutQuery = useOrgBoardLayout({
    roleId: props.roleId,
    workspaceId: props.workspaceId,
  });
  if (layoutQuery.isPending) {
    return <div aria-busy="true" className={BOARD_CLASS} />;
  }
  // A failed read starts from an empty arrangement; moving cards saves anew.
  return <BoardCanvas {...props} initial={layoutQuery.data?.layout ?? null} />;
}

function BoardCanvas({
  board,
  initial,
  items,
  onSelectionChange,
  renderCard,
  roleId,
  selectedIds,
  workspaceId,
}: BoardProps & { initial: OrgBoardLayout | null }) {
  const { c } = useOrgLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const textRefs = useRef(new Map<string, HTMLDivElement>());
  const [positions, setPositions] = useState<Positions>(
    () => initial?.positions ?? {}
  );
  // Text boxes are the team's. This person's changes show at once and are
  // saved in the background, one box at a time.
  const {
    locals: textLocals,
    sync: textSync,
    texts,
  } = useOrgBoardTexts({ board, roleId, workspaceId });
  const canWrite =
    useOptionalOrgWorkspace()?.permissions.canManageCandidates ?? false;
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [viewport, setViewport] = useState<OrgBoardViewport>(
    () => returnViewports.get(roleId) ?? initial?.viewport ?? DEFAULT_VIEWPORT
  );
  const [animate, setAnimate] = useState(false);
  const [panning, setPanning] = useState(false);
  const [dragging, setDragging] = useState<ReadonlySet<string>>(NO_IDS);
  const [order, setOrder] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCardClick = useRef<{
    at: number;
    viewport: OrgBoardViewport;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const queued = useRef<(() => void) | null>(null);
  const spaceHeld = useRef(false);
  const hovering = useRef(false);

  // Cards without a saved spot take the next free ones. They are kept once
  // the person moves anything, so they do not jump later.
  const [rowHeight, setRowHeight] = useState(CARD_HEIGHT);
  const placed = useMemo(() => {
    const missing = items
      .map((item) => item.recommendationId)
      .filter((id) => !positions[id]);
    return missing.length
      ? { ...positions, ...placeNewCards(positions, missing, rowHeight) }
      : positions;
  }, [items, positions, rowHeight]);

  // The same card elements across moves, zooms and drags: React keeps them
  // as they are and only the small wrappers change.
  const cards = useMemo(
    () =>
      new Map(items.map((item) => [item.recommendationId, renderCard(item)])),
    [items, renderCard]
  );

  const latest = useRef({ positions: placed, texts, viewport });
  useEffect(() => {
    latest.current = { positions: placed, texts, viewport };
  });
  const selectedTextRef = useRef(selectedText);
  useEffect(() => {
    selectedTextRef.current = editingText ? null : selectedText;
  });

  const queryClient = useQueryClient();
  /** Takes a box off the board for everyone. */
  const removeText = useCallback(
    (id: string) => {
      setSelectedText((current) => (current === id ? null : current));
      setEditingText((current) => (current === id ? null : current));
      const text = latest.current.texts.find((entry) => entry.id === id);
      if (text) textSync.remove(text);
    },
    [textSync]
  );
  const flushSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const { positions, viewport: view } = latest.current;
    const layout: OrgBoardLayout = { positions, viewport: view };
    // The cached copy is what the board opens with next time.
    queryClient.setQueryData(orgBoardLayoutKey(workspaceId, roleId), {
      layout,
    });
    void saveOrgBoardLayout({ layout, roleId, workspaceId }).catch(
      () => undefined
    );
  }, [queryClient, roleId, workspaceId]);
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, SAVE_DELAY);
  }, [flushSave]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (saveTimer.current) flushSave();
      // The board closing right after a card click means a profile opened;
      // remember this view for the way back.
      const click = lastCardClick.current;
      if (click && performance.now() - click.at < 2_000) {
        returnViewports.set(roleId, click.viewport);
      }
    },
    [flushSave, roleId]
  );

  // At most one screen update per frame while the pointer or wheel moves.
  const nextFrame = useCallback((update: () => void) => {
    queued.current = update;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const run = queued.current;
      queued.current = null;
      run?.();
    });
  }, []);
  const flushFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const run = queued.current;
    queued.current = null;
    run?.();
  };

  /** Moves the board under the pointer without re-rendering the cards. */
  const paintViewport = (next: OrgBoardViewport) => {
    const layer = layerRef.current;
    const container = containerRef.current;
    if (layer) {
      layer.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.zoom})`;
    }
    if (container) {
      container.style.backgroundPosition = `${next.x}px ${next.y}px`;
    }
  };

  const cardRect = useCallback(
    (id: string): Rect | null => {
      const point = placed[id];
      if (!point) return null;
      return {
        ...point,
        height: cardRefs.current.get(id)?.offsetHeight ?? CARD_HEIGHT,
        width: CARD_WIDTH,
      };
    },
    [placed]
  );

  const animateTo = useCallback(
    (next: OrgBoardViewport) => {
      setAnimate(true);
      setViewport(next);
      scheduleSave();
      setTimeout(() => setAnimate(false), 220);
    },
    [scheduleSave]
  );

  const fitViewport = useCallback(() => {
    const container = containerRef.current;
    const rects = items
      .map((item) => cardRect(item.recommendationId))
      .filter((rect): rect is Rect => Boolean(rect));
    if (!container || !rects.length) return null;
    const left = Math.min(...rects.map((rect) => rect.x));
    const top = Math.min(...rects.map((rect) => rect.y));
    const right = Math.max(...rects.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    const padding = 48;
    const zoom = clampZoom(
      Math.min(
        (container.clientWidth - padding * 2) / (right - left),
        (container.clientHeight - padding * 2) / (bottom - top),
        1
      )
    );
    return {
      x: (container.clientWidth - (right - left) * zoom) / 2 - left * zoom,
      y:
        Math.max(
          padding,
          (container.clientHeight - (bottom - top) * zoom) / 2
        ) -
        top * zoom,
      zoom,
    };
  }, [cardRect, items]);

  // Opening the board shows every card where it was last left. Cards are
  // measured first, so new ones are laid out by their real height.
  // Coming back from a profile keeps the view as it was instead.
  const fitted = useRef(returnViewports.has(roleId));
  const measured = useRef(false);
  useEffect(() => {
    returnViewports.delete(roleId);
  }, [roleId]);
  useLayoutEffect(() => {
    if (!items.length) return;
    if (!measured.current) {
      let tallest = 0;
      for (const element of cardRefs.current.values()) {
        tallest = Math.max(tallest, element.offsetHeight);
      }
      if (tallest > rowHeight + 8) {
        // Measuring needs the cards on screen, so this runs after layout.
        setRowHeight(tallest);
        return;
      }
      measured.current = true;
    }
    if (fitted.current) return;
    fitted.current = true;
    const next = fitViewport();
    if (next) setViewport(next);
  }, [fitViewport, items.length, rowHeight]);

  const center = () => ({
    x: (containerRef.current?.clientWidth ?? 0) / 2,
    y: (containerRef.current?.clientHeight ?? 0) / 2,
  });

  // Pinch or Ctrl/⌘ + wheel zooms at the pointer; a plain wheel or two-finger
  // swipe moves the board. A native listener so the page does not scroll.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = container.getBoundingClientRect();
      const point = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      const zoom = event.ctrlKey || event.metaKey;
      // Lines (some mice) count as roughly 16px each.
      const unit = event.deltaMode === 1 ? 16 : 1;
      setViewport((current) =>
        zoom
          ? zoomViewport(current, Math.exp(-event.deltaY * unit * 0.01), point)
          : {
              ...current,
              x: current.x - event.deltaX * unit,
              y: current.y - event.deltaY * unit,
            }
      );
      scheduleSave();
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [scheduleSave]);

  // Space + drag moves the board from anywhere; +, - and 0 zoom; Esc clears
  // the selection.
  useEffect(() => {
    // Keys belong to the board only while the pointer is over it and nothing
    // else (a dialog, the chat box, a field) has focus.
    const ours = (target: EventTarget | null) =>
      target === document.body ||
      (target instanceof Node &&
        Boolean(containerRef.current?.contains(target)) &&
        !(
          target instanceof HTMLElement &&
          target.closest("input, textarea, select, [contenteditable='true']")
        ));
    const onKeyDown = (event: KeyboardEvent) => {
      if (!hovering.current || !ours(event.target)) return;
      if (event.key === " ") {
        event.preventDefault();
        spaceHeld.current = true;
        setPanning(true);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") {
        animateTo(zoomViewport(latest.current.viewport, 1.25, center()));
      } else if (event.key === "-") {
        animateTo(zoomViewport(latest.current.viewport, 1 / 1.25, center()));
      } else if (event.key === "0") {
        const current = latest.current.viewport;
        animateTo(zoomViewport(current, 1 / current.zoom, center()));
      } else if (
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedTextRef.current
      ) {
        event.preventDefault();
        removeText(selectedTextRef.current);
      } else if (event.key === "Escape" && onSelectionChange) {
        onSelectionChange(new Set());
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      spaceHeld.current = false;
      if (!drag.current) setPanning(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [animateTo, onSelectionChange, removeText]);

  const local = (event: { clientX: number; clientY: number }) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
    };
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    containerRef.current?.setPointerCapture(event.pointerId);
    drag.current = {
      kind: "pan",
      moved: false,
      origin: viewport,
      start: local(event),
    };
    setPanning(true);
  };

  const onBoardPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-board-controls]")) return;
    // A text box handles its own press (select, move, edit).
    if (target.closest("[data-board-text]") && !spaceHeld.current) return;
    if (event.button === 1 || spaceHeld.current) {
      event.preventDefault();
      startPan(event);
      return;
    }
    if (target.closest("[data-board-card]")) return;
    if (event.shiftKey && onSelectionChange) {
      event.currentTarget.setPointerCapture(event.pointerId);
      const start = local(event);
      drag.current = { base: new Set(selectedIds), kind: "select", start };
      setMarquee({ height: 0, width: 0, ...start });
      return;
    }
    startPan(event);
  };

  const onBoardPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const point = local(event);
    if (current.kind === "pan") {
      const dx = point.x - current.start.x;
      const dy = point.y - current.start.y;
      if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      current.moved = true;
      const next = {
        ...current.origin,
        x: current.origin.x + dx,
        y: current.origin.y + dy,
      };
      nextFrame(() => {
        paintViewport(next);
        current.last = next;
      });
      return;
    }
    if (current.kind === "text") {
      const dx = (event.clientX - current.start.x) / viewport.zoom;
      const dy = (event.clientY - current.start.y) / viewport.zoom;
      if (!current.moved) {
        if (Math.hypot(dx, dy) * viewport.zoom < DRAG_THRESHOLD) return;
        containerRef.current?.setPointerCapture(event.pointerId);
        current.moved = true;
      }
      nextFrame(() => {
        const element = textRefs.current.get(current.id);
        if (element) {
          element.style.left = `${current.origin.x + dx}px`;
          element.style.top = `${current.origin.y + dy}px`;
        }
        current.last = { dx, dy };
      });
      return;
    }
    if (current.kind === "select") {
      const rect = {
        height: Math.abs(point.y - current.start.y),
        width: Math.abs(point.x - current.start.x),
        x: Math.min(point.x, current.start.x),
        y: Math.min(point.y, current.start.y),
      };
      nextFrame(() => {
        setMarquee(rect);
        const area = {
          height: rect.height / viewport.zoom,
          width: rect.width / viewport.zoom,
          x: (rect.x - viewport.x) / viewport.zoom,
          y: (rect.y - viewport.y) / viewport.zoom,
        };
        const next = new Set(current.base);
        for (const item of items) {
          const card = cardRect(item.recommendationId);
          if (card && overlaps(card, area)) next.add(item.recommendationId);
        }
        const same =
          next.size === selectedIds.size &&
          [...next].every((id) => selectedIds.has(id));
        if (!same) onSelectionChange?.(next);
      });
      return;
    }
    const dx = (event.clientX - current.start.x) / viewport.zoom;
    const dy = (event.clientY - current.start.y) / viewport.zoom;
    if (!current.moved) {
      if (Math.hypot(dx, dy) * viewport.zoom < DRAG_THRESHOLD) return;
      // Capture only once it is a drag, so a plain click still opens the card.
      containerRef.current?.setPointerCapture(event.pointerId);
      current.moved = true;
      // Keep the spots shown for new cards from here on, and lift the cards.
      setPositions(placed);
      setDragging(new Set(current.ids));
      setOrder((existing) => [
        ...existing.filter((entry) => !current.ids.includes(entry)),
        ...current.ids,
      ]);
    }
    nextFrame(() => {
      for (const id of current.ids) {
        const origin = current.origin[id];
        const element = cardRefs.current.get(id);
        if (!origin || !element) continue;
        element.style.left = `${origin.x + dx}px`;
        element.style.top = `${origin.y + dy}px`;
      }
      current.last = { dx, dy };
    });
  };

  const onBoardPointerUp = () => {
    flushFrame();
    const current = drag.current;
    drag.current = null;
    if (!spaceHeld.current) setPanning(false);
    if (!current) return;
    if (current.kind === "select") {
      setMarquee(null);
      return;
    }
    if (current.kind === "text") {
      if (current.moved) {
        const { dx, dy } = current.last ?? { dx: 0, dy: 0 };
        const text = latest.current.texts.find(
          (entry) => entry.id === current.id
        );
        if (text) {
          textSync.update(text, {
            x: current.origin.x + dx,
            y: current.origin.y + dy,
          });
        }
      }
      return;
    }
    if (current.kind === "pan") {
      if (current.moved) {
        if (current.last) setViewport(current.last);
        scheduleSave();
      } else {
        // A plain click on the empty board clears the selection.
        setSelectedText(null);
        if (onSelectionChange && selectedIds.size) onSelectionChange(new Set());
      }
      return;
    }
    if (current.moved) {
      suppressClick.current = true;
      const { dx, dy } = current.last ?? { dx: 0, dy: 0 };
      setPositions((existing) => {
        const next = { ...existing };
        for (const id of current.ids) {
          const origin = current.origin[id];
          if (origin) next[id] = { x: origin.x + dx, y: origin.y + dy };
        }
        return next;
      });
      setDragging(NO_IDS);
      scheduleSave();
    }
  };

  const onCardPointerDown = (
    item: OrgBoardItem,
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0 || spaceHeld.current) return;
    // Anything on the card drags it except fields, boxes and menus, which
    // keep working. A click without movement still reaches the card.
    const keep = (event.target as HTMLElement).closest(
      "input, textarea, select, label, [role='checkbox'], [role='menuitem'], [aria-haspopup], [contenteditable='true']"
    );
    if (keep) return;
    const id = item.recommendationId;
    const ids =
      selectedIds.has(id) && selectedIds.size > 1
        ? items
            .map((entry) => entry.recommendationId)
            .filter((entry) => selectedIds.has(entry))
        : [id];
    const origin: Positions = {};
    for (const entry of ids) {
      if (placed[entry]) origin[entry] = placed[entry];
    }
    suppressClick.current = false;
    drag.current = {
      ids,
      kind: "cards",
      moved: false,
      origin,
      start: { x: event.clientX, y: event.clientY },
    };
  };

  const onCardClickCapture = (
    item: OrgBoardItem,
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (
      onSelectionChange &&
      (event.shiftKey || event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      event.stopPropagation();
      const next = new Set(selectedIds);
      if (next.has(item.recommendationId)) next.delete(item.recommendationId);
      else next.add(item.recommendationId);
      onSelectionChange(next);
      return;
    }
    // A plain click usually opens the profile, which replaces the board.
    lastCardClick.current = {
      at: event.timeStamp,
      viewport: latest.current.viewport,
    };
  };

  const onTextPointerDown = (
    text: OrgBoardText,
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (event.button !== 0 || spaceHeld.current || !canWrite) return;
    const target = event.target as HTMLElement;
    if (target.closest("textarea, button")) return;
    setSelectedText(text.id);
    drag.current = {
      id: text.id,
      kind: "text",
      moved: false,
      origin: { x: text.x, y: text.y },
      start: { x: event.clientX, y: event.clientY },
    };
  };

  /** A new box in the middle of the view, ready to type in. */
  const addText = () => {
    const container = containerRef.current;
    const id = crypto.randomUUID();
    textSync.create(
      {
        id,
        // Readable at the current zoom, even when the whole board is in view.
        size: orgBoardTextSizeForZoom(viewport.zoom),
        text: "",
        x: ((container?.clientWidth ?? 0) / 2 - viewport.x) / viewport.zoom,
        y: ((container?.clientHeight ?? 0) / 2 - viewport.y) / viewport.zoom,
      },
      { hold: true }
    );
    setSelectedText(id);
    setEditingText(id);
  };
  /** Typing ended: an empty box goes away, otherwise it is saved. */
  const finishEditing = (id: string) => {
    setEditingText(null);
    const text = latest.current.texts.find((entry) => entry.id === id);
    if (!text?.text.trim()) removeText(id);
    else textSync.release(id);
  };
  const resize = (text: OrgBoardText, step: 1 | -1) => {
    const index = ORG_BOARD_TEXT_SIZES.indexOf(text.size);
    const next =
      ORG_BOARD_TEXT_SIZES[
        Math.min(
          ORG_BOARD_TEXT_SIZES.length - 1,
          Math.max(0, (index < 0 ? 2 : index) + step)
        )
      ];
    // While typing, saved with the words when typing ends.
    textSync.update(text, { size: next }, { hold: editingText === text.id });
  };

  const fitAll = () => {
    const next = fitViewport();
    if (next) animateTo(next);
  };
  const arrange = () => {
    setPositions(
      placeNewCards(
        {},
        items.map((item) => item.recommendationId),
        rowHeight
      )
    );
    requestAnimationFrame(fitAll);
    scheduleSave();
  };

  const dotSize = DOT_SPACING * viewport.zoom;
  return (
    <div
      aria-label={c("후보자 포스트잇 보드", "Candidate board")}
      className={cn(
        BOARD_CLASS,
        "touch-none select-none",
        // Cards show they can be picked up; the card's own button keeps
        // opening the profile on a plain click.
        "[&_[data-board-card]]:cursor-grab [&_[data-board-drag-surface]]:cursor-grab",
        dragging.size > 0 &&
          "[&_[data-board-card]]:cursor-grabbing [&_[data-board-drag-surface]]:cursor-grabbing"
      )}
      onDragStartCapture={(event) => event.preventDefault()}
      onPointerCancel={onBoardPointerUp}
      onPointerDown={onBoardPointerDown}
      onPointerEnter={() => {
        hovering.current = true;
      }}
      onPointerLeave={() => {
        hovering.current = false;
      }}
      onPointerMove={onBoardPointerMove}
      onPointerUp={onBoardPointerUp}
      ref={containerRef}
      role="region"
      style={{
        backgroundImage:
          "radial-gradient(circle, var(--color-neutral-1000-a10) 1px, transparent 1px)",
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        backgroundSize: `${dotSize}px ${dotSize}px`,
        cursor: panning ? "grabbing" : "grab",
      }}
    >
      <div
        className={cn(
          "absolute left-0 top-0 origin-top-left will-change-transform",
          animate && "transition-transform duration-200 ease-out"
        )}
        ref={layerRef}
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        {items.map((item) => {
          const id = item.recommendationId;
          const point = placed[id];
          if (!point) return null;
          const layer = order.indexOf(id);
          const lifted = dragging.has(id);
          return (
            <div
              className={cn(
                "absolute rounded-lg transition-shadow duration-150",
                lifted ? "shadow-xl" : "shadow-sm hover:shadow-md",
                selectedIds.has(id) && "ring-2 ring-neutral-800"
              )}
              data-board-card
              key={id}
              onClickCapture={(event) => onCardClickCapture(item, event)}
              onPointerDown={(event) => onCardPointerDown(item, event)}
              ref={(element) => {
                if (element) cardRefs.current.set(id, element);
                else cardRefs.current.delete(id);
              }}
              style={{
                left: point.x,
                top: point.y,
                width: CARD_WIDTH,
                // Above the text boxes only while being moved.
                zIndex: lifted ? order.length + 2 : layer >= 0 ? layer + 1 : 0,
              }}
            >
              {cards.get(id)}
            </div>
          );
        })}
        {texts.map((text) => {
          const editing = editingText === text.id;
          const selected = selectedText === text.id;
          const lines = text.text.split("\n");
          const ems = Math.max(4, ...lines.map(lineEms)) + 1;
          return (
            <div
              className={cn(
                "absolute rounded-sm",
                editing
                  ? "ring-2 ring-action/60"
                  : !canWrite
                    ? "cursor-default"
                    : selected
                      ? "cursor-move ring-2 ring-action/60"
                      : "cursor-move hover:ring-1 hover:ring-neutral-1000-a10"
              )}
              data-board-text
              key={text.id}
              onDoubleClick={() => {
                if (!canWrite) return;
                setSelectedText(text.id);
                setEditingText(text.id);
              }}
              onPointerDown={(event) => onTextPointerDown(text, event)}
              ref={(element) => {
                if (element) textRefs.current.set(text.id, element);
                else textRefs.current.delete(text.id);
              }}
              style={{ left: text.x, top: text.y, zIndex: order.length + 1 }}
            >
              {selected ? (
                // Kept at its real size whatever the zoom.
                <div
                  className="absolute bottom-full left-0 mb-1.5 flex origin-bottom-left items-center gap-0.5 rounded-md border border-neutral-1000-a05 bg-bg-floating p-0.5 shadow-sm"
                  style={{ transform: `scale(${1 / viewport.zoom})` }}
                >
                  <MuteButton
                    aria-label={c("글자 작게", "Smaller text")}
                    disabled={text.size === ORG_BOARD_TEXT_SIZES[0]}
                    onClick={() => resize(text, -1)}
                    size="sm"
                    type="button"
                    variant="transparent"
                  >
                    <Minus className="size-3" />
                  </MuteButton>
                  <span className="w-7 text-center text-[12px] tabular-nums text-neutral-muted">
                    {text.size}
                  </span>
                  <MuteButton
                    aria-label={c("글자 크게", "Larger text")}
                    disabled={text.size === ORG_BOARD_TEXT_SIZES.at(-1)}
                    onClick={() => resize(text, 1)}
                    size="sm"
                    type="button"
                    variant="transparent"
                  >
                    <Plus className="size-3" />
                  </MuteButton>
                  <MuteButton
                    aria-label={c("텍스트 삭제", "Delete text")}
                    onClick={() => removeText(text.id)}
                    size="sm"
                    type="button"
                    variant="transparent"
                  >
                    <Trash2 className="size-3" />
                  </MuteButton>
                  {text.updatedByName ? (
                    // Who wrote or last changed it, for a board the team shares.
                    <span className="whitespace-nowrap px-1.5 text-[11px] text-neutral-muted">
                      {text.updatedByName}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {editing ? (
                <textarea
                  aria-label={c("보드 텍스트", "Board text")}
                  autoFocus
                  className="block resize-none overflow-hidden bg-transparent px-1 font-medium leading-tight text-neutral-primary outline-none select-text"
                  onBlur={() => finishEditing(text.id)}
                  onChange={(event) =>
                    textSync.update(
                      text,
                      { text: event.target.value },
                      { hold: true }
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape") event.currentTarget.blur();
                  }}
                  placeholder={c("텍스트", "Text")}
                  rows={lines.length}
                  style={{ fontSize: text.size, width: `${ems}em` }}
                  value={text.text}
                />
              ) : (
                <div
                  className="whitespace-pre px-1 font-medium leading-tight text-neutral-primary"
                  style={{ fontSize: text.size }}
                >
                  {text.text}
                </div>
              )}
              {textLocals.get(text.id)?.failed ? (
                // Kept at its real size whatever the zoom.
                <div
                  className="absolute left-0 top-full mt-1 flex origin-top-left items-center gap-1.5 whitespace-nowrap rounded-md bg-critical-faded px-2 py-1 text-[12px] text-critical"
                  role="alert"
                  style={{ transform: `scale(${1 / viewport.zoom})` }}
                >
                  {c("저장하지 못했어요", "Couldn't save")}
                  <button
                    className="underline underline-offset-2"
                    onClick={() => textSync.retry(text.id)}
                    type="button"
                  >
                    {c("다시 시도", "Retry")}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {marquee ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-sm border border-action/60 bg-action/10"
          style={{
            height: marquee.height,
            left: marquee.x,
            top: marquee.y,
            width: marquee.width,
          }}
        />
      ) : null}
      <div
        className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-neutral-1000-a05 bg-bg-floating p-1 shadow-sm"
        data-board-controls
      >
        {canWrite ? (
          <>
            <MuteButton
              aria-label={c("텍스트 추가", "Add text")}
              onClick={addText}
              size="sm"
              type="button"
              variant="transparent"
            >
              <Type className="size-3.5" />
            </MuteButton>
            <span aria-hidden className="mx-0.5 h-4 w-px bg-neutral-1000-a10" />
          </>
        ) : null}
        <MuteButton
          aria-label={c("축소", "Zoom out")}
          onClick={() => animateTo(zoomViewport(viewport, 1 / 1.25, center()))}
          size="sm"
          type="button"
          variant="transparent"
        >
          <Minus className="size-3.5" />
        </MuteButton>
        <button
          aria-label={c("100%로 보기", "Zoom to 100%")}
          className="w-12 rounded-sm text-center text-[12px] tabular-nums text-neutral-muted hover:text-neutral-primary"
          onClick={() =>
            animateTo(zoomViewport(viewport, 1 / viewport.zoom, center()))
          }
          type="button"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
        <MuteButton
          aria-label={c("확대", "Zoom in")}
          onClick={() => animateTo(zoomViewport(viewport, 1.25, center()))}
          size="sm"
          type="button"
          variant="transparent"
        >
          <Plus className="size-3.5" />
        </MuteButton>
        <MuteButton
          aria-label={c("모두 보기", "Fit all")}
          onClick={fitAll}
          size="sm"
          type="button"
          variant="transparent"
        >
          <Maximize className="size-3.5" />
        </MuteButton>
        <MuteButton
          aria-label={c("자동 정렬", "Tidy up")}
          onClick={arrange}
          size="sm"
          type="button"
          variant="transparent"
        >
          <LayoutGrid className="size-3.5" />
        </MuteButton>
      </div>
    </div>
  );
}
