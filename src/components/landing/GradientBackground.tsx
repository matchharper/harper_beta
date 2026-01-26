import React, { useEffect } from "react";

const GradientBackground = ({
  interactiveRef,
}: {
  interactiveRef: React.RefObject<HTMLDivElement>;
}) => {
  useEffect(() => {
    const interBubble = interactiveRef.current;
    if (!interBubble) return;

    let curX = 0;
    let curY = 0;
    let tgX = 0;
    let tgY = 0;
    let animationId = 0;

    const move = () => {
      curX += (tgX - curX) / 20;
      curY += (tgY - curY) / 20;
      interBubble.style.transform = `translate(${Math.round(
        curX
      )}px, ${Math.round(curY)}px)`;
      animationId = window.requestAnimationFrame(move);
    };

    const handleMouseMove = (event: MouseEvent) => {
      tgX = event.clientX;
      tgY = event.clientY;
    };

    window.addEventListener("mousemove", handleMouseMove);
    move();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, [interactiveRef]);

  return (
    <>
      <div className="absolute bg-black/60 md:bg-black/80 top-0 left-0 w-full h-full inset-0 z-10"></div>
      <div className="gradient-bg absolute top-0 left-0 w-full h-full inset-0 z-0">
        {/* goo 필터 정의용 SVG */}
        <svg xmlns="http://www.w3.org/2000/svg" className="svgBlur">
          <defs>
            <filter id="goo">
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="10"
                result="blur"
              />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
                result="goo"
              />
              <feBlend in="SourceGraphic" in2="goo" />
            </filter>
          </defs>
        </svg>

        <div className="gradients-container">
          <div className="g1" />
          <div className="g2" />
          <div className="g3" />
          <div className="g4" />
          <div className="g5" />
          <div className="interactive" ref={interactiveRef} />
        </div>
      </div>
    </>
  );
};

export default GradientBackground;
