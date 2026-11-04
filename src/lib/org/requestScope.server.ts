import { AsyncLocalStorage } from "node:async_hooks";

// Opt-in only for mutations which do not edit membership, roles or user profiles.
// Cross-request permission caching is separately opted into by candidate routes.
type Scope = { cache: Map<string, Promise<unknown>>; cachePermissions?: boolean; afterResponse?: (run: () => Promise<void>) => void };
const scope = new AsyncLocalStorage<Scope>();

// A single read tool may traverse many candidates. Share only its common reads,
// never a whole agent turn: the next tool (including writes) checks current access.
const readScope = new AsyncLocalStorage<WeakMap<object, Map<string, Promise<unknown>>>>();
export function withOrgReadScope<T>(run: () => Promise<T>): Promise<T> {
  return readScope.run(new WeakMap(), run);
}
export async function memoOrgRead<T>(admin: object, key: readonly unknown[], run: () => Promise<T>): Promise<T> {
  const clients = readScope.getStore();
  if (!clients) return run();
  let cache = clients.get(admin);
  if (!cache) clients.set(admin, cache = new Map());
  const id = JSON.stringify(key);
  const cached = cache.get(id);
  if (cached) return cached as Promise<T>;
  const pending = run();
  cache.set(id, pending);
  try { return await pending; }
  catch (error) { if (cache.get(id) === pending) cache.delete(id); throw error; }
}
export function withOrgRequestScope<T>(run: () => Promise<T>, afterResponse?: Scope["afterResponse"], options?: { cachePermissions?: boolean }): Promise<T> {
  return scope.run({ cache: new Map(), afterResponse, cachePermissions: options?.cachePermissions }, run);
}
export function canCacheOrgPermissions() { return scope.getStore()?.cachePermissions === true; }
export async function memoOrgRequest<T>(key: readonly unknown[], run: () => Promise<T>): Promise<T> {
  const cache = scope.getStore()?.cache;
  if (!cache) return run();
  const id = JSON.stringify(key);
  const cached = cache.get(id);
  if (cached) return cached as Promise<T>;
  const pending = run();
  cache.set(id, pending);
  try { return await pending; }
  catch (error) { if (cache.get(id) === pending) cache.delete(id); throw error; }
}

/** Queue records must already be durable before using this scheduling helper. */
export function deferOrgResponseWork(run: () => Promise<void>): boolean {
  const current = scope.getStore();
  if (!current?.afterResponse) return false;
  current.afterResponse(() => scope.run({ cache: new Map() }, run));
  return true;
}
