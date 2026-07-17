export type GaEventParams = Record<
  string,
  string | number | boolean | null | undefined
>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

function cleanEventParams(params: GaEventParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value != null)
  );
}

export function trackGaEvent(eventName: string, params: GaEventParams = {}) {
  const normalizedEventName = eventName.trim();
  if (typeof window === "undefined" || !GA_ID || !normalizedEventName) {
    return false;
  }

  const eventParams = cleanEventParams(params);
  window.dataLayer = window.dataLayer || [];

  if (typeof window.gtag === "function") {
    window.gtag("event", normalizedEventName, eventParams);
  } else {
    window.dataLayer.push(["event", normalizedEventName, eventParams]);
  }

  return true;
}

export function trackSignUp(params: GaEventParams = {}) {
  return trackGaEvent("sign_up", params);
}
