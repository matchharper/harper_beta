import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { en } from "./en";
import { ko, type OrgMessageKey } from "./ko";
import {
  getBrowserLanguage,
  isOrgLocale,
  resolveOrgLocale,
  type OrgLocale,
} from "./locale";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { canSwitchAuthPersonaWithoutLogout } from "@/lib/authSessionPersona";
import { useAuthStore } from "@/store/useAuthStore";

const STORAGE_KEY = "harper:org-locale";
const STORAGE_OWNER_KEY = "harper:org-locale-user";
function entryLocale(): OrgLocale | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("lang");
  return isOrgLocale(value) ? value : null;
}
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type OrgLocaleContextValue = {
  locale: OrgLocale;
  setLocale: (locale: OrgLocale) => Promise<void>;
  c: OrgCopy;
};

export type OrgCopy = (
  ko: string,
  en: string,
  values?: OrgMessageValues
) => string;

function interpolateCopy(source: string, values?: OrgMessageValues) {
  if (!values) return source;
  return source.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return match;
    return String(values[name] ?? "");
  });
}

const OrgLocaleContext = createContext<OrgLocaleContextValue | null>(null);
const keysByCurrentCopy = new Map<string, OrgMessageKey>(
  Object.entries(ko)
    .reverse()
    .map(([key, value]) => [value, key as OrgMessageKey])
);
const FALLBACK_CONTEXT: OrgLocaleContextValue = {
  locale: "ko",
  setLocale: async () => undefined,
  c: (ko, _en, values) => interpolateCopy(ko, values),
};

function storedLocale(): OrgLocale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "ko" || stored === "en" ? stored : null;
  } catch {
    return null;
  }
}

function persistLocale(locale: OrgLocale) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Keep the selection for the current tab when storage is unavailable.
  }
}

function storedLocaleOwner() {
  try {
    return window.localStorage.getItem(STORAGE_OWNER_KEY);
  } catch {
    return null;
  }
}

function persistLocaleOwner(userId: string) {
  try {
    window.localStorage.setItem(STORAGE_OWNER_KEY, userId);
  } catch {
    // The server preference still persists when browser storage is unavailable.
  }
}

async function initialAccountLocale(userId: string): Promise<OrgLocale> {
  const entry = entryLocale();
  if (entry) return entry;
  const local = storedLocale();
  const owner = storedLocaleOwner();
  if (local && (!owner || owner === userId)) return local;
  const browserLanguage = getBrowserLanguage();
  if (browserLanguage) return resolveOrgLocale(browserLanguage);
  const context = (await fetch("/api/landing/context", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)) as { countryCode?: string } | null;
  return resolveOrgLocale(null, context?.countryCode);
}

export function OrgLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<OrgLocale>("en");
  const authUserId = useAuthStore((state) =>
    state.persona === "company" ||
    canSwitchAuthPersonaWithoutLogout(state.user?.email)
      ? state.user?.id ?? null
      : null
  );
  const localeRef = useRef<OrgLocale>("en");
  const requestVersion = useRef(0);
  const applyLocale = useCallback((next: OrgLocale) => {
    localeRef.current = next;
    updateLocale(next);
    persistLocale(next);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const entry = entryLocale();
    if (!authUserId && entry) {
      applyLocale(entry);
      return;
    }
    const manual = storedLocale();
    const owner = storedLocaleOwner();
    const useManual = manual && (!authUserId || !owner || owner === authUserId);
    if (useManual) {
      applyLocale(manual);
      return;
    }

    const browserLanguage = getBrowserLanguage();
    if (browserLanguage) {
      const detected = resolveOrgLocale(browserLanguage);
      applyLocale(detected);
      return;
    }

    let cancelled = false;
    const version = requestVersion.current;
    void fetch("/api/landing/context", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((context: { countryCode?: string } | null) => {
        if (!cancelled && requestVersion.current === version) {
          const detected = resolveOrgLocale(null, context?.countryCode);
          applyLocale(detected);
        }
      })
      .catch(() => {
        if (!cancelled && requestVersion.current === version) applyLocale("en");
      });
    return () => {
      cancelled = true;
    };
  }, [applyLocale, authUserId]);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!authUserId) return;
    void (async () => {
      const saved = await fetchWithInternalAuth<{ locale: unknown }>(
        "/api/org/locale"
      );
      if (requestVersion.current !== version) return;
      if (isOrgLocale(saved.locale)) {
        persistLocaleOwner(authUserId);
        applyLocale(saved.locale);
        return;
      }
      const detected = await initialAccountLocale(authUserId);
      if (requestVersion.current !== version) return;
      const created = await fetchWithInternalAuth<{ locale: unknown }>(
        "/api/org/locale",
        {
          body: JSON.stringify({ locale: detected, ifUnset: true }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        }
      );
      if (requestVersion.current !== version) return;
      if (isOrgLocale(created.locale)) {
        persistLocaleOwner(authUserId);
        applyLocale(created.locale);
      }
    })().catch((error) => console.warn("[org/locale:sync]", error));
  }, [applyLocale, authUserId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      if (authUserId && storedLocaleOwner() !== authUserId) return;
      applyLocale(storedLocale() ?? resolveOrgLocale(getBrowserLanguage()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [applyLocale, authUserId]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    async (next: OrgLocale) => {
      const previous = localeRef.current;
      const version = ++requestVersion.current;
      if (authUserId) persistLocaleOwner(authUserId);
      applyLocale(next);
      if (!authUserId) return;
      try {
        const saved = await fetchWithInternalAuth<{ locale: unknown }>(
          "/api/org/locale",
          {
            body: JSON.stringify({ locale: next }),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          }
        );
        if (!isOrgLocale(saved.locale))
          throw new Error("Invalid saved language");
        if (requestVersion.current === version) {
          persistLocaleOwner(authUserId);
          applyLocale(saved.locale);
        }
      } catch (error) {
        if (requestVersion.current === version) applyLocale(previous);
        throw error;
      }
    },
    [applyLocale, authUserId]
  );

  return (
    <OrgLocaleScope locale={locale} setLocale={setLocale}>
      {children}
    </OrgLocaleScope>
  );
}

// Connect shared Org UI to a language owned by another surface, such as pricing.
// Persistence stays with that surface rather than starting another locale sync.
export function OrgLocaleScope({
  locale,
  setLocale = FALLBACK_CONTEXT.setLocale,
  children,
}: {
  locale: OrgLocale;
  setLocale?: (locale: OrgLocale) => void | Promise<void>;
  children: ReactNode;
}) {
  const c = useCallback(
    (ko: string, en: string, values?: OrgMessageValues) =>
      interpolateCopy(locale === "ko" ? ko : en, values),
    [locale]
  );
  const changeLocale = useCallback(
    async (next: OrgLocale) => {
      await setLocale(next);
    },
    [setLocale]
  );
  const value = useMemo(
    () => ({ locale, setLocale: changeLocale, c }),
    [locale, changeLocale, c]
  );
  return (
    <OrgLocaleContext.Provider value={value}>
      {children}
    </OrgLocaleContext.Provider>
  );
}

export function useOrgLocale() {
  return useContext(OrgLocaleContext) ?? FALLBACK_CONTEXT;
}

export function useIsOrgLocaleProvided() {
  return useContext(OrgLocaleContext) !== null;
}

export type OrgMessageValues = Record<
  string,
  string | number | null | undefined
>;

// Compatibility for shared components; Org UI keeps both strings inline with c.
export function useOrgT() {
  const { locale } = useOrgLocale();
  return useCallback(
    <K extends OrgMessageKey>(
      key: K,
      // The call site owns its Korean copy so editing it updates the UI directly.
      currentCopy: string,
      values?: OrgMessageValues
    ) => {
      const source = locale === "ko" ? currentCopy : en[key];
      return interpolateCopy(source, values);
    },
    [locale]
  );
}

// For UI labels supplied by shared company helpers that also serve Slack and
// the company-side LLM. Only call this at their presentation boundary.
export function useOrgSourceT() {
  const { locale } = useOrgLocale();
  return useCallback(
    (source: string) => {
      if (locale === "ko") return source;
      const key = keysByCurrentCopy.get(source);
      return key ? en[key] : source;
    },
    [locale]
  );
}
