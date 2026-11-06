import { useEffect, useLayoutEffect } from "react";
import {
  type DevColorPalette,
  useDevColorPaletteStore,
} from "@/store/useDevColorPaletteStore";

export type DevColorPaletteCopy = {
  title: string;
  labels: Record<DevColorPalette, string>;
  descriptions: Record<DevColorPalette, string>;
  footnote: string;
};

const useClientLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Mounted once by the app so a choice survives navigation and reaches portals.
// The caller owns the route and existing dev-control access checks.
export function DevColorPalettePreview({ enabled }: { enabled: boolean }) {
  const palette = useDevColorPaletteStore((state) => state.palette);

  useEffect(() => {
    void useDevColorPaletteStore.persist.rehydrate();
  }, []);

  useClientLayoutEffect(() => {
    if (!enabled || palette === "current") return;
    document.documentElement.setAttribute("data-dev-color-palette", palette);
    return () => {
      document.documentElement.removeAttribute("data-dev-color-palette");
    };
  }, [enabled, palette]);

  return null;
}
