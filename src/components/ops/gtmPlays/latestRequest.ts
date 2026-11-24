/**
 * The newest request wins (useGtmAction, api.ts): a caller that asks again before an earlier answer came (a filter
 * changed, a page turned, a refresh) never sees that earlier answer land over the newer one, however late it comes.
 * Only the newest request's answer, error and end are handed on; an older one resolves to null and changes nothing.
 * Pure (no React, no fetch), so the rule is tested on its own and every caller of the hook gets it.
 */
export type LatestHandlers<T> = {
  /** The request starts (it is the newest now). */
  start: () => void;
  /** Its answer, while it is still the newest. */
  result: (value: T) => void;
  /** Its error, while it is still the newest. */
  error: (caught: unknown) => void;
  /** It ended (answer or error), while it is still the newest: nothing is loading any more. */
  done: () => void;
};

export function latestRequests() {
  let latest = 0;
  return async function runLatest<T>(call: () => Promise<T>, on: LatestHandlers<T>): Promise<T | null> {
    const id = (latest += 1);
    const newest = () => id === latest;
    on.start();
    try {
      const value = await call();
      if (!newest()) return null;
      on.result(value);
      return value;
    } catch (caught) {
      if (newest()) on.error(caught);
      return null;
    } finally {
      if (newest()) on.done();
    }
  };
}
