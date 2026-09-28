import { useEffect, useLayoutEffect } from "react";
import { MuteButton } from "@/components/ui/button";
import {
  DEV_COLOR_PALETTES,
  useDevColorPaletteStore,
} from "@/store/useDevColorPaletteStore";

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

export function DevColorPaletteControls() {
  const palette = useDevColorPaletteStore((state) => state.palette);
  const setPalette = useDevColorPaletteStore((state) => state.setPalette);
  const selected = DEV_COLOR_PALETTES.find((option) => option.id === palette)!;

  return (
    <fieldset className="min-w-0 space-y-2" data-career-i18n-skip="true">
      <legend className="text-[13px] font-medium text-neutral-primary">
        색상 미리보기
      </legend>
      <div className="flex flex-wrap gap-2">
        {DEV_COLOR_PALETTES.map((option) => (
          <MuteButton
            aria-pressed={palette === option.id}
            key={option.id}
            onClick={() => setPalette(option.id)}
            variant={palette === option.id ? "dark" : "default"}
          >
            {option.label}
          </MuteButton>
        ))}
      </div>
      <p aria-live="polite" className="text-[12px] leading-5 text-neutral-muted">
        {selected.description}
      </p>
      <p className="text-[12px] leading-5 text-neutral-soft">
        primary는 모든 옵션에서 유지돼요. 이 브라우저의 Career·Org 화면에만 적용되며,
        ‘현재’를 누르면 원래 색상으로 돌아가요.
      </p>
    </fieldset>
  );
}
