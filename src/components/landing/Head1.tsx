import React from "react";

const Head1 = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={`text-[26px] md:text-4xl font-bold font-hedvig bg-gradpastel bg-clip-text text-transparent w-fit ${className}`}
    >
      {children}
    </div>
  );
};

export default Head1;
