// Keeps where one person moves candidate cards on a Role's board in step
// with the server, as BoardTextSync does for text boxes. A move shows at
// once and stays on screen until the server has it, so a slow or failed
// save, or a refresh that left before the save landed, never makes a card
// jump back.
//
// The cards of a move are saved together, one request at a time; moves made
// while a request is out go in the next one. Spots the board gave cards
// nobody had placed are kept only where nobody has placed them since, so a
// teammate's arrangement wins. A failed save is tried again.

import type { OrgBoardPoint, OrgBoardPositions } from "@/lib/org/roleViews";

type CardLocal = {
  /** When the server last confirmed a change (this browser's clock). */
  confirmedAt: number | null;
  /** Placed by the board rather than the person. */
  ifEmpty: boolean;
  point: OrgBoardPoint;
  /** Bumped on every change; `savedRev` is the last the server confirmed. */
  rev: number;
  savedRev: number;
};

export type BoardCardTransport = (change: {
  moved: OrgBoardPositions;
  placed: OrgBoardPositions;
}) => Promise<void>;

const DEFAULT_RETRY_DELAYS = [2_000, 5_000, 15_000];
/**
 * A board read this long after a save was confirmed started after it, so
 * what it shows is the server's word, a teammate's later move included.
 */
const SETTLE_MS = 5_000;

export class BoardCardSync {
  private locals = new Map<string, CardLocal>();
  private snapshot: OrgBoardPositions = {};
  private listeners = new Set<() => void>();
  private inFlight = false;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly transport: BoardCardTransport,
    private readonly options: {
      /** Called when a request comes back and none is out, to re-read. */
      onIdle?: () => void;
      retryDelays?: number[];
    } = {}
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** This person's spots the server may not have yet, by card. */
  getSnapshot = () => this.snapshot;

  private emit() {
    const next: OrgBoardPositions = {};
    for (const [id, local] of this.locals) next[id] = local.point;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  /**
   * The person moved these cards. `placed` are the spots the board shows for
   * cards nobody has placed yet, so they stay put around the moved ones.
   */
  move(moved: OrgBoardPositions, placed: OrgBoardPositions = {}) {
    for (const [id, point] of Object.entries(placed)) {
      if (id in moved || this.locals.has(id)) continue;
      this.locals.set(id, {
        confirmedAt: null,
        ifEmpty: true,
        point,
        rev: 1,
        savedRev: 0,
      });
    }
    for (const [id, point] of Object.entries(moved)) {
      const current = this.locals.get(id);
      this.locals.set(id, {
        confirmedAt: current?.confirmedAt ?? null,
        ifEmpty: false,
        point,
        rev: (current?.rev ?? 0) + 1,
        savedRev: current?.savedRev ?? 0,
      });
    }
    this.emit();
    // A new move also sends anything still waiting for a retry.
    this.clearRetry();
    this.retryCount = 0;
    this.flush();
  }

  /**
   * Hands cards back to the server's copy once it has them. A card with a
   * move the server has not confirmed stays local. So does one whose save
   * the read may have missed, until a read clearly after the save arrives;
   * from then a teammate's later move shows.
   */
  reconcile(server: OrgBoardPositions, readAt: number) {
    let changed = false;
    for (const [id, local] of this.locals) {
      if (local.rev !== local.savedRev) continue;
      const row = server[id];
      const matches = local.ifEmpty
        ? Boolean(row)
        : Boolean(row && row.x === local.point.x && row.y === local.point.y);
      const settled =
        local.confirmedAt !== null && readAt >= local.confirmedAt + SETTLE_MS;
      if (matches || settled) {
        this.locals.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private flush() {
    if (this.inFlight) return;
    const moved: OrgBoardPositions = {};
    const placed: OrgBoardPositions = {};
    const sent = new Map<string, number>();
    for (const [id, local] of this.locals) {
      if (local.rev === local.savedRev) continue;
      (local.ifEmpty ? placed : moved)[id] = local.point;
      sent.set(id, local.rev);
    }
    if (!sent.size) return;
    this.inFlight = true;
    this.transport({ moved, placed }).then(
      () => {
        this.inFlight = false;
        this.retryCount = 0;
        const now = Date.now();
        for (const [id, rev] of sent) {
          const local = this.locals.get(id);
          if (local) {
            this.locals.set(id, { ...local, confirmedAt: now, savedRev: rev });
          }
        }
        this.flush();
        if (!this.inFlight) this.options.onIdle?.();
      },
      () => {
        this.inFlight = false;
        this.scheduleRetry();
        this.options.onIdle?.();
      }
    );
  }

  private scheduleRetry() {
    const delays = this.options.retryDelays ?? DEFAULT_RETRY_DELAYS;
    const delay = delays[this.retryCount];
    // Out of retries: the next move sends it again.
    if (delay === undefined) return;
    this.clearRetry();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryCount += 1;
      this.flush();
    }, delay);
  }
}
