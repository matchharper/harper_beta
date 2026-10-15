import { useEffect, useState } from "react";

/** Keep displayed renewal countdowns current while the page stays open. */
export function useBillingClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
