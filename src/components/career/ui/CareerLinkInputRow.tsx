import React from "react";
import { careerCx } from "./CareerPrimitives";

const CareerLinkInputRow = ({
  label,
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
  trailing,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  className?: string;
  inputClassName?: string;
  trailing?: React.ReactNode;
}) => {
  return (
    <div
      className={careerCx(
        "flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="w-full text-[15px] font-medium text-beige900/60 md:w-1/4">
        {label}
      </div>
      <div className="flex w-full items-center gap-3 md:w-3/4">
        <input
          placeholder={placeholder}
          className={careerCx(
            "h-[36px] w-full rounded-[8px] border border-beige900/15 bg-white/60 px-3 py-2 text-[14px] font-light leading-5 text-beige900 outline-none transition focus:ring-1 focus:ring-beige900/30 placeholder:text-beige900/30",
            inputClassName
          )}
          value={value}
          onChange={onChange}
        />
        {trailing}
      </div>
    </div>
  );
};

export default CareerLinkInputRow;
