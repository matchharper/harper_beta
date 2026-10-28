import { useId, useState, type CSSProperties } from "react";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const controls = [
  { key: "radius", label: "둥글기", max: 240, unit: "px", initial: 200 },
  { key: "background", label: "흰 배경", max: 100, unit: "%", initial: 50 },
  { key: "border", label: "테두리 두께", max: 8, unit: "px", initial: 1 },
  { key: "borderOpacity", label: "테두리 불투명도", max: 100, unit: "%", initial: 80 },
  { key: "offset", label: "그림자 거리", max: 16, unit: "px", initial: 1 },
  { key: "shadowBlur", label: "그림자 흐림", max: 32, unit: "px", initial: 1 },
  { key: "shadowOpacity", label: "그림자 불투명도", max: 100, unit: "%", initial: 25 },
  { key: "backdrop", label: "배경 흐림", max: 32, unit: "px", initial: 0 },
] as const;
type ControlKey = (typeof controls)[number]["key"];
const defaults = Object.fromEntries(controls.map(({ key, initial }) => [key, initial])) as Record<ControlKey, number>;

export default function CareerGlassDevControls() {
  const id = useId();
  const [values, setValues] = useState(defaults);
  const [text, setText] = useState("새로운 기회를 살펴보세요.\n어떤 일을 할 때 가장 몰입하나요?\n지금까지의 경험과 다음 도전을 이야기해 주세요.\nHarper와 함께 커리어의 다음 장을 준비하세요.");
  const [copyState, setCopyState] = useState("");
  const shadow = `-${values.offset}px -${values.offset}px ${values.shadowBlur}px rgba(0,0,0,${values.shadowOpacity / 100}), ${values.offset}px ${values.offset}px ${values.shadowBlur}px rgba(0,0,0,${values.shadowOpacity / 100})`;
  const classes = `rounded-[${values.radius}px] bg-white/${values.background} border-[${values.border}px] border-white/${values.borderOpacity} shadow-[${shadow.replaceAll(" ", "_")}]${values.backdrop ? ` backdrop-blur-[${values.backdrop}px]` : ""}`;
  const style = {
    "--glass-radius": `${values.radius}px`,
    "--glass-background": `rgba(255,255,255,${values.background / 100})`,
    "--glass-border": `${values.border}px`,
    "--glass-border-color": `rgba(255,255,255,${values.borderOpacity / 100})`,
    "--glass-shadow": shadow,
    "--glass-blur": `${values.backdrop}px`,
  } as CSSProperties;

  return (
    <details className="mt-4 min-w-0" data-career-i18n-skip="true">
      <summary className="cursor-pointer text-[13px] font-medium">Glass 미리보기</summary>
      <div className="mt-3 space-y-4">
        <div className="relative isolate overflow-hidden rounded-xl border border-neutral-1000-a10 bg-gradient-to-br from-blue-100 via-white to-accent-200 p-5">
          <p className="min-h-48 whitespace-pre-wrap break-words text-lg leading-10 text-neutral-primary">{text}</p>
          <div
            aria-label="Glass 레이어"
            style={style}
            className="pointer-events-none absolute inset-x-4 top-1/2 h-24 -translate-y-1/2 rounded-[var(--glass-radius)] border-[length:var(--glass-border)] border-[color:var(--glass-border-color)] bg-[var(--glass-background)] shadow-[var(--glass-shadow)] backdrop-blur-[var(--glass-blur)]"
          />
        </div>
        <label className="block space-y-2 text-xs" htmlFor={`${id}-text`}>
          <span>레이어 아래 글</span>
          <Textarea id={`${id}-text`} rows={4} value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {controls.map(({ key, label, max, unit }) => (
            <label key={key} htmlFor={`${id}-${key}`} className="flex min-w-0 flex-col gap-2 text-xs">
              <span className="flex justify-between gap-2"><span>{label}</span><output>{values[key]}{unit}</output></span>
              <input id={`${id}-${key}`} type="range" min={0} max={max} value={values[key]} className="w-full accent-primary" onChange={(event) => { setValues((previous) => ({ ...previous, [key]: Number(event.target.value) })); setCopyState(""); }} />
            </label>
          ))}
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-bg-weak p-3 text-xs"><code>{classes}</code></pre>
        <div className="flex items-center gap-2">
          <MuteButton type="button" size="sm" onClick={() => { setValues(defaults); setCopyState(""); }}>원본 값</MuteButton>
          <MuteButton type="button" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(classes); setCopyState("복사했습니다."); } catch { setCopyState("복사하지 못했습니다. 위 클래스를 직접 선택해 주세요."); } }}>Tailwind 복사</MuteButton>
          <span role="status" className="text-xs text-neutral-muted">{copyState}</span>
        </div>
      </div>
    </details>
  );
}
