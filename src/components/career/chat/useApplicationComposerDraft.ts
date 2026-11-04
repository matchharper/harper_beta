import { useCallback, useMemo, useSyncExternalStore, type SetStateAction } from "react";

type Values<T> = Record<string, T>;
const isString = (value: unknown): value is string => typeof value === "string";
const changedEvent = "harper:composer-draft-changed";
const memory = new Map<string, string>();
const serverSnapshot = () => null;

function snapshot(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function read<T>(
  text: string | null,
  isValue: (value: unknown) => value is T
): Values<T> {
  try {
    const value = JSON.parse(text ?? "null");
    return value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value).every(isValue)
      ? value
      : {};
  } catch {
    return {};
  }
}

function write<T>(key: string, values: Values<T>) {
  const text = Object.keys(values).length ? JSON.stringify(values) : null;
  try {
    if (text === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, text);
    memory.delete(key);
  } catch {
    if (text === null) memory.delete(key);
    else memory.set(key, text);
  }
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: key }));
}

// Timeline and composer share one draft. Closing either surface or reloading
// preserves it, but it never becomes an answer without explicit submission.
export function useApplicationComposerDraft<T = string>(
  key: string,
  isValue: (value: unknown) => value is T = isString as (
    value: unknown
  ) => value is T
) {
  const subscribe = useCallback((notify: () => void) => {
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) notify();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === key) notify();
    };
    window.addEventListener(changedEvent, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(changedEvent, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);
  const getSnapshot = useCallback(() => snapshot(key), [key]);
  const text = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const values = useMemo(() => read(text, isValue), [text, isValue]);
  const setValues = (next: SetStateAction<Values<T>>) => {
    const current = read(snapshot(key), isValue);
    write(key, typeof next === "function" ? next(current) : next);
  };
  const clear = () => write(key, {});
  return [values, setValues, clear] as const;
}
