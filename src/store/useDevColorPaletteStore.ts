import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DEV_COLOR_PALETTES = [
  {
    id: "current",
    label: "1. 현재",
    description: "누런끼를 조금 줄인 기본 배경과 색상을 표시해요.",
  },
  {
    id: "soft",
    label: "2. 누런끼 조금 제거",
    description: "전체 기본 색상에 반영된 팔레트예요. ‘현재’와 같은 색상으로 표시해요.",
  },
  {
    id: "clean",
    label: "3. 누런끼 거의 제거",
    description: "배경과 글자를 중성 회색에 가깝게, 따뜻한 강조 배경은 더 차분하게 표시해요.",
  },
  {
    id: "mono",
    label: "4. White · Black · Gray",
    description: "primary 포인트를 제외한 공통 UI 색상을 흰색·검정·회색으로 표시해요.",
  },
] as const;

export type DevColorPalette = (typeof DEV_COLOR_PALETTES)[number]["id"];

type DevColorPaletteState = {
  palette: DevColorPalette;
  setPalette: (palette: DevColorPalette) => void;
};

export const useDevColorPaletteStore = create<DevColorPaletteState>()(
  persist(
    (set) => ({
      palette: "current",
      setPalette: (palette) => set({ palette }),
    }),
    {
      name: "harper-dev-color-palette",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({ palette: state.palette }),
      merge: (persisted, current) => {
        const palette = (persisted as { palette?: unknown } | null)?.palette;
        return {
          ...current,
          palette:
            DEV_COLOR_PALETTES.find((option) => option.id === palette)?.id ??
            "current",
        };
      },
    }
  )
);
