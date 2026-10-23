/**
 * A Role just created from a JD in the chat: until its start session exists
 * (the quick JD read takes a few seconds) its page shows the start screen's
 * loading line instead of the chat. Kept per tab, for 30 s at most; the
 * server's quick read ends it sooner when the message was not a JD.
 */
export const START_PENDING_MS = 30_000;
export const START_PENDING_EVENT = "harper:role-start-pending";

const key = (roleId: string) => `harper:role-start-pending:${roleId}`;

function changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(START_PENDING_EVENT));
}

/** The first message can start the flow: the same test the server's quick JD read uses (20+ characters, no link, no file). */
export function mayStartFromJd(message: string, attachments: number) {
  const text = message.trim();
  return attachments === 0 && text.length >= 20 && !/https?:\/\/|www\./i.test(text);
}

export function markStartPending(storage: Pick<Storage, "setItem"> | null, roleId: string, now = Date.now()) {
  try {
    storage?.setItem(key(roleId), String(now));
    changed();
  } catch {
    // Storage blocked: the chat shows as before.
  }
}

/** The server's quick read found no JD: the chat shows right away. */
export function clearStartPending(storage: Pick<Storage, "removeItem"> | null, roleId: string) {
  try {
    storage?.removeItem(key(roleId));
    changed();
  } catch {
    // Storage blocked: nothing was marked.
  }
}

/** When the loading line gives way to the chat (null: this Role was not just created from a JD here). */
export function startPendingUntil(storage: Pick<Storage, "getItem"> | null, roleId: string) {
  try {
    const at = Number(storage?.getItem(key(roleId)));
    return at > 0 ? at + START_PENDING_MS : null;
  } catch {
    return null;
  }
}

export function sessionStorageOrNull() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * The first message on the new-role page passed the JD test: until the Role's
 * page takes over (the chat turn creates the Role, then the page moves), the
 * new-role page shows the same loading line instead of the chat. Per workspace,
 * same 30 s cap; cleared when the turn ends, fails or the message was not a JD.
 */
const newRoleKey = (workspaceId: string) => `harper:role-start-pending:new:${workspaceId}`;

export function markNewRolePending(storage: Pick<Storage, "setItem"> | null, workspaceId: string, now = Date.now()) {
  try {
    storage?.setItem(newRoleKey(workspaceId), String(now));
    changed();
  } catch {
    // Storage blocked: the chat shows as before.
  }
}

export function clearNewRolePending(storage: Pick<Storage, "removeItem"> | null, workspaceId: string) {
  try {
    storage?.removeItem(newRoleKey(workspaceId));
    changed();
  } catch {
    // Storage blocked: nothing was marked.
  }
}

export function newRolePendingUntil(storage: Pick<Storage, "getItem"> | null, workspaceId: string) {
  try {
    const at = Number(storage?.getItem(newRoleKey(workspaceId)));
    return at > 0 ? at + START_PENDING_MS : null;
  } catch {
    return null;
  }
}
