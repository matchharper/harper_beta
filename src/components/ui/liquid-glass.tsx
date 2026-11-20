"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
} from "react";
import { cn } from "@/lib/utils";

/**
 * 뒤 배경을 가장자리에서 렌즈처럼 휘게 하는 유리 표면.
 *
 * krea.ai 프롬프트 입력창과 같은 방식이다. 요소 크기와 같은 굴절 맵 PNG를
 * 만들어 SVG 필터(feDisplacementMap)로 쓰고, `backdrop-filter: url(#…)`로
 * 배경에 건다. SVG backdrop-filter는 Chromium에서만 그려지므로 다른
 * 브라우저에서는 blur 표면으로 보인다.
 */

export type LiquidGlassTone = "dark" | "light";

export type LiquidGlassProps = HTMLAttributes<HTMLDivElement> & {
  ref?: Ref<HTMLDivElement>;
  /** 유리 색. dark는 Krea 입력창 값이다. */
  tone?: LiquidGlassTone;
  /** 굴절 세기(px). 기본값은 짧은 변 × 1.16 (Krea 118px 높이에서 137). */
  refraction?: number;
  /** 굴절 띠 폭 배율. 1이면 가장자리 약 18px. */
  bezel?: number;
  /** 굴절 전에 배경을 흐리는 정도(stdDeviation). */
  frost?: number;
  /** false면 Chromium에서도 Safari·Firefox와 같은 blur 표면으로 그린다. */
  refract?: boolean;
};

const TONES: Record<
  LiquidGlassTone,
  { table: string; saturate: number; className: string }
> = {
  dark: {
    // 밝기를 0.16~0.78로 눌러 배경색 없이도 어두운 유리 톤을 만든다.
    table: "0.160 0.398 0.544 0.668 0.780",
    saturate: 1.5,
    className:
      "text-white shadow-[0_0_0_0.5px_rgba(0,0,0,0.25),inset_0_0_0_0.5px_rgba(255,255,255,0.3),0_18px_50px_rgba(0,0,0,0.5)] data-[liquid-glass=fallback]:bg-[rgba(38,38,40,0.8)]",
  },
  light: {
    table: "0.600 0.730 0.820 0.900 0.970",
    saturate: 1.4,
    className:
      "shadow-[0_0_0_0.5px_rgba(0,0,0,0.08),inset_0_0_0_0.5px_rgba(255,255,255,0.7),0_18px_50px_rgba(31,28,24,0.13)] data-[liquid-glass=fallback]:bg-white/70",
  },
};

// Krea 원본 굴절 맵의 가장자리 값(가장자리에서 1px 간격, 127 = 최대).
const EDGE_PROFILE = [
  123, 124, 112, 97, 82, 68, 55, 44, 35, 27, 20, 14, 10, 7, 5, 3, 2, 1, 0,
].map((value) => value / 127);

function edgeStrength(t: number) {
  if (t <= 0) return EDGE_PROFILE[0];
  const index = Math.floor(t);
  if (index >= EDGE_PROFILE.length - 1) return 0;
  const from = EDGE_PROFILE[index];
  return from + (EDGE_PROFILE[index + 1] - from) * (t - index);
}

type Box = { width: number; height: number; radius: number };
type Maps = { displacement: string; rim: string };

const mapCache = new Map<string, Maps>();
const MAP_CACHE_LIMIT = 24;

function buildMaps({ width, height, radius }: Box, edgeScale: number): Maps {
  const key = `${width}x${height}x${radius}x${edgeScale.toFixed(3)}`;
  const cached = mapCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return { displacement: "", rim: "" };
  const displacement = context.createImageData(width, height);
  const rim = context.createImageData(width, height);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const r = Math.min(radius, halfWidth, halfHeight);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const px = x + 0.5 - halfWidth;
      const py = y + 0.5 - halfHeight;
      const qx = Math.abs(px) - (halfWidth - r);
      const qy = Math.abs(py) - (halfHeight - r);
      // depth: 가장자리에서 안쪽으로 들어온 거리, (nx, ny): 바깥 방향 법선
      let depth: number;
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) {
        const length = Math.hypot(qx, qy);
        depth = r - length;
        nx = (qx / length) * Math.sign(px);
        ny = (qy / length) * Math.sign(py);
      } else if (qx > qy) {
        depth = r - qx;
        nx = Math.sign(px);
        ny = 0;
      } else {
        depth = r - qy;
        nx = 0;
        ny = Math.sign(py);
      }

      displacement.data[i + 2] = 128;
      displacement.data[i + 3] = 255;
      if (depth < 0) {
        displacement.data[i] = 128;
        displacement.data[i + 1] = 128;
        continue;
      }
      // R·G에 안쪽 방향 벡터를 넣는다. 128은 움직이지 않음.
      const strength = edgeStrength((depth - 0.5) / edgeScale);
      displacement.data[i] = 128 - 127 * strength * nx;
      displacement.data[i + 1] = 128 - 127 * strength * ny;

      // 테두리 빛: 아래·오른쪽이 조금 더 밝고 1px마다 약 0.44배로 줄어든다.
      const alpha = (56 + 8.5 * ny + 7 * nx) * Math.exp(-depth * 0.82);
      if (alpha > 0.5) {
        rim.data[i] = 255;
        rim.data[i + 1] = 255;
        rim.data[i + 2] = 255;
        rim.data[i + 3] = alpha;
      }
    }
  }

  context.putImageData(displacement, 0, 0);
  const displacementUrl = canvas.toDataURL("image/png");
  context.putImageData(rim, 0, 0);
  const maps = { displacement: displacementUrl, rim: canvas.toDataURL("image/png") };

  if (mapCache.size >= MAP_CACHE_LIMIT) {
    const oldest = mapCache.keys().next().value;
    if (oldest !== undefined) mapCache.delete(oldest);
  }
  mapCache.set(key, maps);
  return maps;
}

// userAgentData는 Chromium 엔진에만 있다. iOS Chrome처럼 WebKit을 쓰는
// 브라우저에는 없어서 SVG backdrop-filter를 못 그리는 경우와 정확히 겹친다.
function supportsSvgBackdropFilter() {
  const brands = (
    navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }
  ).userAgentData?.brands;
  return Boolean(brands?.some((entry) => entry.brand === "Chromium"));
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

export function LiquidGlass({
  ref,
  tone = "dark",
  refraction,
  bezel = 1,
  frost = 2.5,
  refract = true,
  className,
  style,
  children,
  ...props
}: LiquidGlassProps) {
  const filterId = `liquid-glass-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const toneConfig = TONES[tone];

  const setRefs = useCallback(
    (element: HTMLDivElement | null) => {
      setNode(element);
      assignRef(ref, element);
    },
    [ref],
  );

  // 요소 크기·모서리가 바뀌면 굴절 맵을 다시 만든다.
  useEffect(() => {
    if (!node || !refract || !supportsSvgBackdropFilter()) return;
    const measure = () => {
      const width = Math.round(node.offsetWidth);
      const height = Math.round(node.offsetHeight);
      const radius = Math.round(
        parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0,
      );
      setBox((previous) =>
        previous &&
        previous.width === width &&
        previous.height === height &&
        previous.radius === radius
          ? previous
          : { width, height, radius },
      );
    };
    // ResizeObserver는 화면이 그려질 때만 알려 주므로 처음 한 번은 바로 잰다.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, refract]);

  const shortSide = box ? Math.min(box.width, box.height) : 0;
  const edgeScale = bezel * Math.min(1, shortSide / 80);
  const maps = useMemo(
    () => (box && box.width > 0 && box.height > 0 ? buildMaps(box, edgeScale) : null),
    [box, edgeScale],
  );
  const active = refract && Boolean(box && maps?.displacement);
  // 크기가 바뀌면 id도 바꿔 Chromium이 이전 필터 결과를 재사용하지 않게 한다.
  const activeFilterId = box
    ? `${filterId}-${box.width}-${box.height}-${box.radius}`
    : filterId;
  const glassStyle: CSSProperties | undefined = active
    ? { ...style, backdropFilter: `url(#${activeFilterId})` }
    : style;

  return (
    <div
      ref={setRefs}
      data-liquid-glass={active ? "svg" : "fallback"}
      className={cn(
        "relative data-[liquid-glass=fallback]:backdrop-blur-2xl",
        toneConfig.className,
        className,
      )}
      style={glassStyle}
      {...props}
    >
      {children}
      {active && box && maps ? (
        <svg aria-hidden className="pointer-events-none absolute size-0">
          <filter id={activeFilterId} colorInterpolationFilters="sRGB">
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation={frost}
              edgeMode="duplicate"
              result="frost"
            />
            <feImage
              href={maps.displacement}
              x={0}
              y={0}
              width={box.width}
              height={box.height}
              result="map"
            />
            <feDisplacementMap
              in="frost"
              in2="map"
              scale={refraction ?? shortSide * 1.16}
              xChannelSelector="R"
              yChannelSelector="G"
              result="lens"
            />
            <feColorMatrix in="lens" type="saturate" values={String(toneConfig.saturate)} />
            <feComponentTransfer result="glass">
              <feFuncR type="table" tableValues={toneConfig.table} />
              <feFuncG type="table" tableValues={toneConfig.table} />
              <feFuncB type="table" tableValues={toneConfig.table} />
            </feComponentTransfer>
            <feImage
              href={maps.rim}
              x={0}
              y={0}
              width={box.width}
              height={box.height}
              result="rim"
            />
            <feBlend in="rim" in2="glass" mode="screen" />
          </filter>
        </svg>
      ) : null}
    </div>
  );
}
