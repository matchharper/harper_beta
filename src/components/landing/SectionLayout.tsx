import React from "react";

type SectionLayoutProps = {
  children: React.ReactNode;
};

const SectionLayout = ({ children }: SectionLayoutProps) => {
  return (
    <div className="py-12 flex justify-center items-center">
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  );
};

export default React.memo(SectionLayout);
