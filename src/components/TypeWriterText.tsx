import { useEffect, useRef, useState } from "react";

type TypewriterTextProps = {
  text?: string | null;
  speedMs?: number; // ms per character
  animate?: boolean; // typing animation on/off
  className?: string;
};

export default function TypewriterText({
  text,
  speedMs = 20,
  animate = true,
  className,
}: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState("");
  const prevTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!text) {
      setDisplayed("");
      prevTextRef.current = null;
      return;
    }

    // 애니메이션 끄면 바로 전체 표시
    if (!animate) {
      setDisplayed(text);
      prevTextRef.current = text;
      return;
    }

    // 같은 텍스트면 다시 안 침
    if (prevTextRef.current === text) return;

    prevTextRef.current = text;
    setDisplayed("");

    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));

      if (i >= text.length) {
        clearInterval(interval);
      }
    }, speedMs);

    return () => clearInterval(interval);
  }, [text, speedMs, animate]);

  return <div className={className}>{displayed}</div>;
}
