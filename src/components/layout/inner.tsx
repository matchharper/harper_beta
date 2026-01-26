import React from "react";

const InnerLayout = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => {
  return (
    <div className="min-h-screen w-full">
      {/* Header */}
      <div className="mx-auto w-full px-4 pt-6 pb-2 flex flex-col items-center justify-start">
        <div className="flex items-end justify-between gap-4 w-full">
          <div className="text-3xl font-hedvig font-light tracking-tight text-white">
            {title}
          </div>
        </div>
        <div className="w-full max-w-full flex flex-col items-start justify-start relative pb-32">
          {children}
        </div>
      </div>
    </div>
  );
};

export default React.memo(InnerLayout);
