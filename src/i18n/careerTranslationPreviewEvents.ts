const REFRESH_STORAGE_KEY = "harper:careerTranslationDbPreviewRefreshAt";
const REFRESH_EVENT = "harper:careerTranslationDbPreviewRefresh";

export function notifyCareerTranslationDbPreviewChanged() {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(REFRESH_STORAGE_KEY, String(Date.now()));
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

export function subscribeCareerTranslationDbPreviewChanges(
  onChange: () => void
) {
  if (typeof window === "undefined") return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === REFRESH_STORAGE_KEY) onChange();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(REFRESH_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(REFRESH_EVENT, onChange);
  };
}
