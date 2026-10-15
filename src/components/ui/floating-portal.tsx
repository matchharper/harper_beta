import { createContext, useContext } from "react";

/** Keep Base UI popups inside an enclosing Radix modal's focus boundary. */
export const FloatingPortalContainer = createContext<HTMLElement | null>(null);
export function useFloatingPortalContainer() {
  return useContext(FloatingPortalContainer);
}
