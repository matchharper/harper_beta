// Preserve the explicit import action across Google's redirect. A callback URL
// alone must never authorize an import, and a reload must not repeat it.
const key = (userId: string) => `harper:gmail-import:${userId}`;

export function rememberGmailImportIntent(
  storage: Pick<Storage, "setItem">,
  userId: string,
  accountId: string
) {
  storage.setItem(key(userId), accountId);
}

export function consumeGmailImportIntent(
  storage: Pick<Storage, "getItem" | "removeItem">,
  userId: string,
  accountId: string | null | undefined
) {
  if (!accountId || storage.getItem(key(userId)) !== accountId) return false;
  storage.removeItem(key(userId));
  return true;
}
