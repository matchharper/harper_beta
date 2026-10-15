import { useEffect, useState, type SetStateAction } from "react";

type Values = Record<string, string>;
function read(key: string): Values {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value).every((entry) => typeof entry === "string")
      ? value
      : {};
  } catch {
    return {};
  }
}

// Unsubmitted text survives closing mobile chat or switching layouts. Scope it
// to the exact activity/batch; it never becomes an answer without submission.
export function useApplicationComposerDraft(key: string) {
  const [stored, setStored] = useState(() => ({ key, values: read(key) }));
  if (stored.key !== key) setStored({ key, values: read(key) });
  useEffect(() => {
    if (stored.key !== key) return;
    try {
      if (Object.keys(stored.values).length)
        sessionStorage.setItem(key, JSON.stringify(stored.values));
      else sessionStorage.removeItem(key);
    } catch {
      /* In-memory drafts still work when storage is unavailable. */
    }
  }, [key, stored]);
  const setValues = (next: SetStateAction<Values>) =>
    setStored((previous) => {
      const current = previous.key === key ? previous.values : read(key);
      return { key, values: typeof next === "function" ? next(current) : next };
    });
  const clear = () => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* Best effort. */
    }
    setStored({ key, values: {} });
  };
  return [stored.key === key ? stored.values : {}, setValues, clear] as const;
}
