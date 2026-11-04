/** The URL contains only an operation ID. The existing viewer checks ownership. */
export function browserSessionHref(sessionId: string) {
  return `/career?browserSession=${encodeURIComponent(sessionId)}`;
}
export function browserSessionFromQuery(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
