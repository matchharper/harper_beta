import React, { type ElementType } from "react";

type Head1Props = {
  children: React.ReactNode;
  className?: string;
  as?: ElementType;
};

const Head1 = ({ children, className, as: Tag = "div" }: Head1Props) => {
  return (
    <Tag
      className={`text-[26px] md:text-4xl font-bold font-hedvig bg-gradpastel bg-clip-text text-transparent w-fit ${className}`}
    >
      {children}
    </Tag>
  );
};

export default Head1;
