"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en } from "@/lang/en";
import { ko } from "@/lang/ko";

export type Locale = "ko" | "en";
export type MessageDictionary = typeof ko & {
  readonly career: Record<string, string>;
};

const LOCALE_STORAGE_KEY = "harper:locale";
const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="))
    ?.split("=")[1];
}

function getLocaleFromCookie(): Locale | null {
  const c = getCookie(LOCALE_COOKIE_NAME);
  return c === "ko" || c === "en" ? c : null;
}

function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === "ko" || stored === "en") return stored;
  return getLocaleFromCookie();
}

function persistLocale(locale: Locale) {
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

  useEffect(() => {
    if (controlledLocale) return;
    const storedLocale = getStoredLocale();
    if (storedLocale) setLocaleState(storedLocale);
  }, [controlledLocale]);

  const locale = controlledLocale ?? localeState;
  const setLocale = useCallback(
    (nextLocale: Locale) => {
      if (!controlledLocale) {
        setLocaleState(nextLocale);
        persistLocale(nextLocale);
      }
      onLocaleChange?.(nextLocale);
    },
    [controlledLocale, onLocaleChange]
  );

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
