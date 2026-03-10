import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

type Mode = "static" | "fixed" | "bottom";

interface FakeStickyProps {
  children: React.ReactNode;
  top?: number;
  bottomGap?: number;
  className?: string;
}

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const FakeSticky = ({
  children,
  top = 96,
  bottomGap = 24,
  className,
}: FakeStickyProps) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<Mode>("static");
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [left, setLeft] = useState(0);
  const [bottomOffset, setBottomOffset] = useState(0);

  const measure = () => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const outerRect = outer.getBoundingClientRect();
    const docTop = window.scrollY + outerRect.top;

    setWidth(outerRect.width);
    setLeft(outerRect.left);
    setHeight(inner.offsetHeight);

    const scrollY = window.scrollY;
    const containerTop = docTop;
    const containerBottom = docTop + outer.offsetHeight;
    const panelHeight = inner.offsetHeight;

    const fixedStart = containerTop - top;
    const fixedEnd = containerBottom - panelHeight - bottomGap - top;

    if (scrollY < fixedStart) {
      setMode("static");
      setBottomOffset(0);
      return;
    }

    if (scrollY <= fixedEnd) {
      setMode("fixed");
      setBottomOffset(0);
      return;
    }

    setMode("bottom");
    setBottomOffset(bottomGap);
  };

  useIsomorphicLayoutEffect(() => {
    measure();
  }, []);

  useEffect(() => {
    measure();

    const onScroll = () => measure();
    const onResize = () => measure();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    const resizeObserver = new ResizeObserver(() => {
      measure();
    });

    if (outerRef.current) resizeObserver.observe(outerRef.current);
    if (innerRef.current) resizeObserver.observe(innerRef.current);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        position: "relative",
        minHeight: height ? `${height}px` : undefined,
      }}
    >
      <div
        ref={innerRef}
        style={
          mode === "fixed"
            ? {
                position: "fixed",
                top,
                left,
                width,
                zIndex: 30,
              }
            : mode === "bottom"
              ? {
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: bottomOffset,
                }
              : {
                  position: "relative",
                }
        }
      >
        {children}
      </div>
    </div>
  );
};

export default FakeSticky;
