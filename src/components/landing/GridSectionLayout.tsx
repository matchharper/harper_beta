import React from "react";

const GridSectionLayout = ({
  children,
  borderSoft,
}: {
  children: React.ReactNode;
  borderSoft: string;
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-start px-0 md:px-20 w-full text-black border-t ${borderSoft}`}
    >
      <div
        className={`flex flex-col items-center justify-start border-0 sm:border-x w-full h-full text-center ${
          borderSoft === "border-xgray300" ? "border-black" : borderSoft
        }`}
      >
        {children}
      </div>
    </div>
  );
};

export default React.memo(GridSectionLayout);

export const BaseSectionLayout = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-start px-0 md:px-40 w-full text-white`}
    >
      <div
        className={`flex flex-col items-center justify-start w-full h-full text-center`}
      >
        {children}
      </div>
    </div>
  );
};
