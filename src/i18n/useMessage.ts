"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";
import {
  getBrowserInferredLocale,
  normalizeLocale,
  type ResolvedLocale,
} from "@/i18n/localeResolution";

export type Locale = ResolvedLocale;
export type MessageDictionary = typeof ko & {
  readonly career: Record<string, string>;
};

const LOCALE_STORAGE_KEY = "harper:locale";
const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1];
}

export function getLocaleFromCookie(): Locale | null {
  return normalizeLocale(getCookie(LOCALE_COOKIE_NAME));
}

export function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;

  const cookieLocale = getLocaleFromCookie();
  if (cookieLocale) return cookieLocale;

  const stored = normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  if (stored) return stored;
  return null;
}

export function getInitialClientLocalePreference(): Locale {
  return getStoredLocale() ?? getBrowserInferredLocale();
}

export function persistLocalePreference(locale: Locale) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

const DICTS: Record<Locale, MessageDictionary> = {
  ko: ko as unknown as MessageDictionary,
  en: en as unknown as MessageDictionary,
};

type MessagesContextValue = {
  locale: Locale;
  m: MessageDictionary;
  setLocale: (locale: Locale) => void;
};

const MessagesContext = createContext<MessagesContextValue | null>(null);

export function MessagesProvider({
  children,
  locale: controlledLocale,
  messages,
  onLocaleChange,
}: {
  children: ReactNode;
  locale?: Locale;
  messages?: MessageDictionary;
  onLocaleChange?: (locale: Locale) => void;
}) {
  const [localeState, setLocaleState] = useState<Locale>("ko");

  useIsomorphicLayoutEffect(() => {
    if (controlledLocale) return;
    setLocaleState(getInitialClientLocalePreference());
  }, [controlledLocale]);

  const locale = controlledLocale ?? localeState;
  const setLocale = useCallback(
    (nextLocale: Locale) => {
      persistLocalePreference(nextLocale);
      if (!controlledLocale) {
        setLocaleState(nextLocale);
      }
      onLocaleChange?.(nextLocale);
    },
    [controlledLocale, onLocaleChange]
  );

  useEffect(() => {
    if (controlledLocale) {
      persistLocalePreference(controlledLocale);
    }
  }, [controlledLocale]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<MessagesContextValue>(
    () => ({
      locale,
      m: messages ?? DICTS[locale],
      setLocale,
    }),
    [locale, messages, setLocale]
  );

  return createElement(MessagesContext.Provider, { value }, children);
}

export function useMessages() {
  const context = useContext(MessagesContext);
  if (context) return context;

  return {
    locale: "ko" as Locale,
    m: DICTS.ko,
    setLocale: () => undefined,
  };
}
