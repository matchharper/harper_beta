import React from "react";

const Tag = ({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode | null;
}) => {
  return (
    <div className="flex flex-row gap-1 rounded-md px-2.5 py-[7px] text-xs font-light leading-none bg-black/[0.04] text-black/90">
      {icon && icon}
      {children}
    </div>
  );
};

export default React.memo(Tag);
