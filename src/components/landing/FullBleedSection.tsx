import clsx from "clsx";
import React from "react";

type FullBleedSectionProps = {
  children: React.ReactNode;
  backgroundClassName?: string;
  contentClassName?: string;
  as?: keyof JSX.IntrinsicElements;
};

const FullBleedSection = ({
  children,
  backgroundClassName,
  contentClassName,
  as: Component = "section",
}: FullBleedSectionProps) => {
  return (
    <Component
      className={clsx(
        "relative left-1/2 right-1/2 w-screen -translate-x-1/2",
        backgroundClassName
      )}
    >
      <div
        className={clsx(
          "mx-auto w-full max-w-[1160px] px-4",
          contentClassName
        )}
      >
        {children}
      </div>
    </Component>
  );
};

export default React.memo(FullBleedSection);
