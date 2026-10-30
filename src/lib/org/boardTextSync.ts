// Keeps the text boxes one person changes on a Role's board in step with
// the server. What the person did is shown right away and kept on screen
// until the server has it, so a slow or failed save, or a refresh that left
// before the save landed, never makes a box jump back or disappear.
//
// Each box is saved on its own, one request at a time; changes made while a
// request is out are sent together once it returns. A failed save stays on
// screen, marked, and is tried again.

import type { OrgBoardText } from "@/lib/org/roleViews";

export type BoardTextLocal = {
  /** When the server last confirmed a change (this browser's clock). */
  confirmedAt: number | null;
  /** Made here and not yet known to the server. */
  created: boolean;
  deleted: boolean;
  failed: boolean;
  /** Being typed in: saved when typing ends. */
  held: boolean;
  inFlight: boolean;
  /** Bumped on every change; `savedRev` is the last the server confirmed. */
  rev: number;
  savedRev: number;
  text: OrgBoardText;
};

export type BoardTextTransport = {
  remove: (id: string) => Promise<void>;
  save: (text: OrgBoardText) => Promise<void>;
};

const DEFAULT_RETRY_DELAYS = [2_000, 5_000, 15_000];
/**
 * A board read this long after a save was confirmed started after it, so
 * what it shows is the server's word, a teammate's later change included.
 */
const SETTLE_MS = 5_000;

function sameContent(left: OrgBoardText, right: OrgBoardText) {
  return (
    left.text === right.text &&
    left.size === right.size &&
    left.x === right.x &&
    left.y === right.y
  );
}

export class BoardTextSync {
  private locals = new Map<string, BoardTextLocal>();
  private snapshot: ReadonlyMap<string, BoardTextLocal> = new Map();
  private listeners = new Set<() => void>();
  private retries = new Map<
    string,
    { count: number; timer: ReturnType<typeof setTimeout> | null }
  >();

  constructor(
    private readonly transport: BoardTextTransport,
    private readonly options: {
      /** Called when the last request out comes back, to re-read the board. */
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

  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = new Map(this.locals);
    for (const listener of this.listeners) listener();
  }

  private change(
    id: string,
    update: (current: BoardTextLocal | undefined) => BoardTextLocal | null
  ) {
    const next = update(this.locals.get(id));
    if (next) this.locals.set(id, next);
    else this.locals.delete(id);
    this.emit();
  }

  /** A new box, made here. Kept local while `hold` is set. */
  create(text: OrgBoardText, { hold = false } = {}) {
    this.change(text.id, () => ({
      confirmedAt: null,
      created: true,
      deleted: false,
      failed: false,
      held: hold,
      inFlight: false,
      rev: 1,
      savedRev: 0,
      text,
    }));
    this.flush(text.id);
  }

  /**
   * Changes a box (words, size or place). `base` is the box as shown, used
   * the first time this person touches a box the server already has.
   */
  update(
    base: OrgBoardText,
    patch: Partial<OrgBoardText>,
    { hold = false } = {}
  ) {
    this.change(base.id, (current) => {
      const text = { ...(current?.text ?? base), ...patch, id: base.id };
      if (current) {
        return {
          ...current,
          deleted: false,
          // Only the end of typing lets go of a box being typed in.
          held: hold || current.held,
          rev: current.rev + 1,
          text,
        };
      }
      return {
        confirmedAt: null,
        created: false,
        deleted: false,
        failed: false,
        held: hold,
        inFlight: false,
        rev: 1,
        savedRev: 0,
        text,
      };
    });
    this.flush(base.id);
  }

  /** Typing ended: saves what was written. */
  release(id: string) {
    const current = this.locals.get(id);
    if (!current?.held) return;
    this.change(id, () => ({ ...current, held: false }));
    this.flush(id);
  }

  /** Takes a box off the board. One never sent just goes away. */
  remove(base: OrgBoardText) {
    const current = this.locals.get(base.id);
    if (current?.created && current.savedRev === 0 && !current.inFlight) {
      this.clearRetry(base.id);
      this.change(base.id, () => null);
      return;
    }
    this.change(base.id, () => ({
      confirmedAt: current?.confirmedAt ?? null,
      created: current?.created ?? false,
      deleted: true,
      failed: false,
      held: false,
      inFlight: current?.inFlight ?? false,
      rev: (current?.rev ?? 0) + 1,
      savedRev: current?.savedRev ?? 0,
      text: current?.text ?? base,
    }));
    this.flush(base.id);
  }

  /** Saves every box still being typed in, e.g. when the board closes. */
  releaseAll() {
    for (const [id, local] of this.locals) {
      if (!local.held) continue;
      if (local.text.text.trim()) this.release(id);
      else this.remove(local.text);
    }
  }

  retry(id: string) {
    this.clearRetry(id);
    this.flush(id);
  }

  /**
   * Hands boxes back to the server's copy once it has them. A box with
   * changes the server has not confirmed stays local. So does one whose
   * save the read may have missed, until a read clearly after the save
   * arrives; from then a teammate's later change or delete shows.
   */
  reconcile(server: OrgBoardText[], readAt: number) {
    const rows = new Map(server.map((row) => [row.id, row]));
    let changed = false;
    for (const [id, local] of this.locals) {
      if (local.held || local.inFlight || local.rev !== local.savedRev) {
        continue;
      }
      const row = rows.get(id);
      const matches = local.deleted
        ? !row
        : Boolean(row && sameContent(row, local.text));
      const settled =
        local.confirmedAt !== null && readAt >= local.confirmedAt + SETTLE_MS;
      if (matches || settled) {
        this.locals.delete(id);
        this.clearRetry(id);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private clearRetry(id: string) {
    const retry = this.retries.get(id);
    if (retry?.timer) clearTimeout(retry.timer);
    this.retries.delete(id);
  }

  private busy() {
    for (const local of this.locals.values()) if (local.inFlight) return true;
    return false;
  }

  private flush(id: string) {
    const local = this.locals.get(id);
    if (!local || local.inFlight || local.held) return;
    if (local.rev === local.savedRev) return;
    const rev = local.rev;
    const deleting = local.deleted;
    const text = local.text;
    this.change(id, () => ({ ...local, inFlight: true }));
    const request = deleting
      ? this.transport.remove(id)
      : this.transport.save(text);
    request.then(
      () => {
        this.clearRetry(id);
        const current = this.locals.get(id);
        if (current) {
          this.change(id, () => ({
            ...current,
            confirmedAt: Date.now(),
            created: deleting ? current.created : false,
            failed: false,
            inFlight: false,
            savedRev: rev,
          }));
        }
        this.flush(id);
        if (!this.busy()) this.options.onIdle?.();
      },
      () => {
        const current = this.locals.get(id);
        if (current) {
          this.change(id, () => ({
            ...current,
            failed: true,
            inFlight: false,
          }));
        }
        this.scheduleRetry(id);
        if (!this.busy()) this.options.onIdle?.();
      }
    );
  }

  private scheduleRetry(id: string) {
    const delays = this.options.retryDelays ?? DEFAULT_RETRY_DELAYS;
    const count = this.retries.get(id)?.count ?? 0;
    const delay = delays[count];
    if (delay === undefined) {
      this.retries.set(id, { count, timer: null });
      return;
    }
    const timer = setTimeout(() => {
      this.retries.set(id, { count: count + 1, timer: null });
      this.flush(id);
    }, delay);
    this.retries.set(id, { count, timer });
  }
}

/**
 * The boxes to draw: the server's, with this person's changes on top and
 * their new boxes after.
 */
export function mergeBoardTexts(
  server: OrgBoardText[],
  locals: ReadonlyMap<string, BoardTextLocal>
) {
  const shown: OrgBoardText[] = [];
  for (const row of server) {
    const local = locals.get(row.id);
    if (local?.deleted) continue;
    shown.push(local ? { ...row, ...local.text } : row);
  }
  for (const [id, local] of locals) {
    if (local.deleted || server.some((row) => row.id === id)) continue;
    shown.push(local.text);
  }
  return shown;
}
